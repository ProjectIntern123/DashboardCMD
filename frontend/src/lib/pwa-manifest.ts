import type { MetadataRoute } from 'next';

export async function getDynamicManifest(): Promise<MetadataRoute.Manifest & { id?: string; prefer_related_applications?: boolean; categories?: string[] }> {
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
    // Fallback if backend API is offline during build
  }

  const name = settings.pwa_name || settings.app_name || 'HARTEK CMD Office';
  const shortName = settings.pwa_short_name || settings.pwa_name || settings.app_name || 'HARTEK CMD';
  const description = settings.pwa_description || settings.app_subtitle || 'HARTEK Group CMD Office Command Center PWA';
  const themeColor = settings.pwa_theme_color || settings.primary_color || '#0f2a4a';
  const backgroundColor = settings.pwa_background_color || settings.login_bg_color || '#0f2a4a';
  const display = (settings.pwa_display as any) || 'standalone';
  const orientation = (settings.pwa_orientation as any) || 'portrait-primary';

  let icon192 = '/pwa-assets/icon-192.png';
  let icon512 = '/pwa-assets/icon-512.png';
  let iconMaskable = '/pwa-assets/icon-maskable.png';

  if (settings.pwa_icon_type === 'url' && settings.pwa_icon && settings.pwa_icon.startsWith('http')) {
    icon192 = settings.pwa_icon;
    icon512 = settings.pwa_icon;
    iconMaskable = settings.pwa_icon;
  }

  return {
    id: '/',
    name,
    short_name: shortName,
    description,
    start_url: '/',
    scope: '/',
    display,
    orientation,
    background_color: backgroundColor,
    theme_color: themeColor,
    prefer_related_applications: false,
    categories: ['business', 'productivity'],
    icons: [
      {
        src: icon192,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: icon512,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: iconMaskable,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
