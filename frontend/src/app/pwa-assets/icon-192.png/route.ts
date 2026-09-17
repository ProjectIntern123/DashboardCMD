import { servePwaIcon } from '../../../lib/serve-pwa-icon';

export async function GET() {
  return servePwaIcon('192', 'any');
}
