import { SetMetadata } from '@nestjs/common';

export enum PortalScope {
  ADMIN = 'ADMIN',
  USER = 'USER',
  SHARED = 'SHARED',
}

export const PORTAL_SCOPE_KEY = 'portal_scope';

export const AdminPortalOnly = () => SetMetadata(PORTAL_SCOPE_KEY, PortalScope.ADMIN);
export const UserPortalOnly = () => SetMetadata(PORTAL_SCOPE_KEY, PortalScope.USER);
export const SharedPortal = () => SetMetadata(PORTAL_SCOPE_KEY, PortalScope.SHARED);
