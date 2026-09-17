export function getApiBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl && envUrl.trim() !== '') {
    return envUrl;
  }

  if (typeof window !== 'undefined') {
    // If running in browser on Next.js dev port 3000, call NestJS on port 4000
    if (window.location.port === '3000') {
      return `${window.location.protocol}//${window.location.hostname}:4000/api`;
    }
    // Otherwise behind Nginx reverse proxy (standard port 80/443), resolve relative to origin
    return '/api';
  }

  return 'http://localhost:4000/api';
}

const API_BASE_URL = getApiBaseUrl();


interface RequestOptions extends RequestInit {
  data?: any;
}

export async function request(endpoint: string, options: RequestOptions = {}) {
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const headers = new Headers(options.headers || {});
  
  if (options.data && !(options.data instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
    options.body = JSON.stringify(options.data);
  }

  // Always enable credentials so cookies (JWT tokens) are passed
  options.credentials = 'include';
  options.headers = headers;

  let response = await fetch(url, options);

  // If unauthorized, attempt to refresh the token
  if (response.status === 401 && !url.includes('/auth/login') && !url.includes('/auth/refresh')) {
    const refreshed = await attemptTokenRefresh();
    if (refreshed) {
      // Retry original request
      response = await fetch(url, options);
    } else {
      // Clear auth client-side if refresh fails
      if (typeof window !== 'undefined' && !['/login', '/forgot-password', '/reset-password'].includes(window.location.pathname)) {
        window.location.href = '/login';
      }
    }
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Request failed with status ${response.status}`);
  }

  return response.json().catch(() => ({}));
}

async function attemptTokenRefresh(): Promise<boolean> {
  try {
    const refreshUrl = `${API_BASE_URL}/auth/refresh`;
    const response = await fetch(refreshUrl, {
      method: 'POST',
      credentials: 'include',
    });
    return response.ok;
  } catch (e) {
    return false;
  }
}

export const api = {
  get: (endpoint: string, options?: RequestOptions) => request(endpoint, { ...options, method: 'GET' }),
  post: (endpoint: string, data?: any, options?: RequestOptions) => request(endpoint, { ...options, method: 'POST', data }),
  put: (endpoint: string, data?: any, options?: RequestOptions) => request(endpoint, { ...options, method: 'PUT', data }),
  patch: (endpoint: string, data?: any, options?: RequestOptions) => request(endpoint, { ...options, method: 'PATCH', data }),
  delete: (endpoint: string, options?: RequestOptions) => request(endpoint, { ...options, method: 'DELETE' }),
};
