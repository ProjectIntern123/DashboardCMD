import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function servePwaIcon(size: '192' | '512', purpose: 'any' | 'maskable' = 'any') {
  let settings: Record<string, string> = {};

  try {
    const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:4000';
    const res = await fetch(`${backendUrl}/api/settings/public`, {
      cache: 'no-store',
    });
    if (res.ok) {
      settings = await res.json();
    }
  } catch (e) {
    // Fallback
  }

  let customIcon = '';
  if (settings.pwa_icon_type === 'upload' && settings.pwa_icon) {
    customIcon = settings.pwa_icon;
  } else if (settings.pwa_icon_type === 'url' && settings.pwa_icon) {
    customIcon = settings.pwa_icon;
  } else if (settings.app_logo && (settings.app_logo.startsWith('data:') || settings.app_logo.startsWith('http'))) {
    customIcon = settings.app_logo;
  }

  // 1. Base64 Data URL
  if (customIcon && customIcon.startsWith('data:image/')) {
    try {
      const matches = customIcon.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const mimeType = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');
        return new Response(buffer, {
          headers: {
            'Content-Type': mimeType,
            'Cache-Control': 'public, max-age=3600, s-maxage=3600',
          },
        });
      }
    } catch (e) {
      // Fallback
    }
  }

  // 2. Remote HTTPS URL
  if (customIcon && customIcon.startsWith('http')) {
    try {
      const imgRes = await fetch(customIcon);
      if (imgRes.ok) {
        const contentType = imgRes.headers.get('content-type') || 'image/png';
        const blob = await imgRes.arrayBuffer();
        return new Response(blob, {
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=3600, s-maxage=3600',
          },
        });
      }
    } catch (e) {
      // Fallback
    }
  }

  // 3. Fallback to physical PNG file on disk
  const fileName = size === '512' ? (purpose === 'maskable' ? 'icon-maskable.png' : 'icon-512.png') : 'icon-192.png';
  const filePath = path.join(process.cwd(), 'public', 'icons', fileName);

  try {
    if (fs.existsSync(filePath)) {
      const fileBuffer = fs.readFileSync(filePath);
      return new Response(fileBuffer, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }
  } catch (e) {
    // Fallback
  }

  return new NextResponse('Icon file missing', { status: 404 });
}
