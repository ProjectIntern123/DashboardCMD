import type { MetadataRoute } from 'next';
import { getDynamicManifest } from '../lib/pwa-manifest';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  return await getDynamicManifest();
}
