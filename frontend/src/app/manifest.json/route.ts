import { NextResponse } from 'next/server';
import { getDynamicManifest } from '../../lib/pwa-manifest';

export async function GET() {
  const manifestData = await getDynamicManifest();

  return NextResponse.json(manifestData, {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=300',
    },
  });
}
