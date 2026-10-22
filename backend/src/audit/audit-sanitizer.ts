/**
 * Audit Log Payload Sanitizer
 *
 * Prevents large binary attachment payloads (Base64 data URIs and raw Base64 strings)
 * and sensitive credentials (passwords, tokens, secrets) from bloating PostgreSQL audit logs.
 *
 * Preserves essential audit metadata: IDs, filenames, content types, byte sizes, actions, and field deltas.
 * Guarantee: Pure, non-mutating transformations that never alter the original request or response objects.
 */

export const BINARY_ATTACHMENT_OMITTED_MARKER = '[BINARY_ATTACHMENT_OMITTED]';
export const REDACTED_MARKER = '[REDACTED]';

const SENSITIVE_KEY_SUBSTRINGS = [
  'password',
  'passwordhash',
  'mfasecret',
  'refreshtoken',
  'accesstoken',
  'secretkey',
  'apikey',
  'keyhash',
];

const EXACT_SENSITIVE_KEYS = new Set([
  'token',
  'secret',
  'otp',
  'otpcode',
]);

const BINARY_KEY_NAMES = new Set([
  'data',
  'base64',
  'datauri',
  'filedata',
  'filecontent',
  'buffer',
]);

/**
 * Determines whether a field key represents sensitive credentials or tokens.
 */
export function isSensitiveKey(key?: string): boolean {
  if (!key) return false;
  const lower = key.toLowerCase();
  if (EXACT_SENSITIVE_KEYS.has(lower)) return true;
  return SENSITIVE_KEY_SUBSTRINGS.some((substring) => lower.includes(substring));
}

/**
 * Determines whether a field key commonly holds binary attachment data.
 */
export function isBinaryKey(key?: string): boolean {
  if (!key) return false;
  return BINARY_KEY_NAMES.has(key.toLowerCase());
}

/**
 * Checks if a string value is a Base64 Data URI (e.g., data:image/png;base64,...).
 */
export function isDataUri(value: string): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim().toLowerCase();
  return trimmed.startsWith('data:') && trimmed.includes(';base64,');
}

/**
 * Checks if a string value appears to be a raw Base64 encoded payload.
 * Must have significant length (>256 chars), no whitespace, not be an HTTP URL,
 * and only contain Base64 characters.
 */
export function isLikelyRawBase64(value: string): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length > 256 && !/\s/.test(trimmed)) {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return false;
    }
    return /^[A-Za-z0-9+/=_-]+$/.test(trimmed);
  }
  return false;
}

/**
 * Determines whether a string property in a given object context represents attachment data.
 */
function isAttachmentDataContext(
  key: string,
  value: string,
  parentObj?: any,
  parentKey?: string,
): boolean {
  if (!isBinaryKey(key)) return false;
  if (typeof value !== 'string' || value.length === 0) return false;

  // Definite binary indicators
  if (isDataUri(value) || isLikelyRawBase64(value)) {
    return true;
  }

  // Known attachment/image collection context
  const normParentKey = parentKey ? parentKey.toLowerCase() : '';
  if (normParentKey === 'attachments' || normParentKey === 'images') {
    return true;
  }

  // Sibling attachment metadata indicators (e.g., { name, type, size, data })
  if (
    parentObj &&
    typeof parentObj === 'object' &&
    (parentObj.name !== undefined ||
      parentObj.filename !== undefined ||
      parentObj.type !== undefined ||
      parentObj.mimeType !== undefined ||
      parentObj.size !== undefined)
  ) {
    return true;
  }

  // Base64 string of meaningful length without whitespace
  if (value.length > 64 && !/\s/.test(value) && /^[A-Za-z0-9+/=_-]+$/.test(value)) {
    return true;
  }

  return false;
}

/**
 * Recursively sanitizes an audit log payload (request or response object).
 *
 * - Replaces Data URIs and raw Base64 attachment data with `[BINARY_ATTACHMENT_OMITTED]`.
 * - Redacts sensitive credential fields (passwords, tokens, secrets) with `[REDACTED]`.
 * - Preserves attachment metadata (id, name, type, size, etc.) and business fields.
 * - Handles nested arrays, objects, and stringified JSON properties.
 * - Protects against circular references and deep recursion.
 * - Non-destructive: leaves original objects completely untouched.
 */
export function sanitizeAuditPayload(
  payload: any,
  keyName?: string,
  depth = 0,
  seen = new WeakSet<object>(),
  parentObj?: any,
  parentKey?: string,
): any {
  // Prevent stack overflow on excessively deep hierarchies
  if (depth > 20) {
    return '[MAX_DEPTH_EXCEEDED]';
  }

  // Fast path for null or undefined
  if (payload === null || payload === undefined) {
    return payload;
  }

  // Redact credentials at the current key level
  if (keyName && isSensitiveKey(keyName)) {
    return REDACTED_MARKER;
  }

  const valType = typeof payload;

  // Pass through primitive numbers, booleans, and bigints
  if (valType === 'number' || valType === 'boolean') {
    return payload;
  }

  if (valType === 'bigint') {
    return payload.toString();
  }

  if (valType === 'function' || valType === 'symbol') {
    return undefined;
  }

  // String processing
  if (valType === 'string') {
    // 1. Data URI strings anywhere in the payload
    if (isDataUri(payload)) {
      return BINARY_ATTACHMENT_OMITTED_MARKER;
    }

    // 2. Binary attachment context (e.g. data field on an attachment or image)
    if (keyName && isAttachmentDataContext(keyName, payload, parentObj, parentKey)) {
      return BINARY_ATTACHMENT_OMITTED_MARKER;
    }

    // 3. Raw Base64 string payload
    if (isLikelyRawBase64(payload)) {
      return BINARY_ATTACHMENT_OMITTED_MARKER;
    }

    // 4. Stringified JSON (e.g., NotepadNote.images sent as a JSON string in request body)
    const trimmed = payload.trim();
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed !== null && typeof parsed === 'object') {
          const sanitizedParsed = sanitizeAuditPayload(
            parsed,
            keyName,
            depth + 1,
            seen,
            parentObj,
            parentKey,
          );
          return JSON.stringify(sanitizedParsed);
        }
      } catch {
        // Fall through if not valid JSON
      }
    }

    return payload;
  }

  // Handle Date objects
  if (payload instanceof Date) {
    return payload.toISOString();
  }

  // Handle Prisma Decimal or similar objects with toFixed/toString
  if (typeof (payload as any).toFixed === 'function' && typeof (payload as any).d === 'object') {
    return payload.toString();
  }

  // Handle Arrays
  if (Array.isArray(payload)) {
    if (seen.has(payload)) {
      return '[CIRCULAR]';
    }
    seen.add(payload);

    return payload.map((item) =>
      sanitizeAuditPayload(
        item,
        undefined,
        depth + 1,
        seen,
        undefined,
        keyName || parentKey,
      ),
    );
  }

  // Handle Plain and Nested Objects
  if (valType === 'object') {
    if (seen.has(payload)) {
      return '[CIRCULAR]';
    }
    seen.add(payload);

    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(payload)) {
      if (isSensitiveKey(k)) {
        result[k] = REDACTED_MARKER;
      } else {
        result[k] = sanitizeAuditPayload(v, k, depth + 1, seen, payload, parentKey);
      }
    }
    return result;
  }

  return payload;
}
