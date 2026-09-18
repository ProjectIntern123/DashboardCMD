'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { api } from '../lib/api';

interface UserPermission {
  action: string;
  resource: string;
}

interface User {
  id: string;
  email: string;
  name: string;
  initials: string;
  role: string;
  requiresPasswordReset?: boolean;
  permissions: UserPermission[];
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, rememberMe?: boolean, otp?: string) => Promise<{ mfaRequired?: boolean; message?: string }>;
  logout: () => Promise<void>;
  hasPermission: (action: string, resource: string) => boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const refreshUser = async () => {
    try {
      const data = await api.get('/auth/me');
      setUser(data);
    } catch (e) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  useEffect(() => {
    if (!loading) {
      const publicPaths = ['/login', '/forgot-password', '/reset-password'];
      const isPublicPath = publicPaths.includes(pathname || '');

      if (!user && !isPublicPath) {
        router.push('/login');
      } else if (user) {
        if (user.requiresPasswordReset) {
          if (pathname !== '/reset-password') {
            router.push('/reset-password');
          }
        } else if (isPublicPath) {
          if (user.role === 'Admin') {
            router.push('/admin');
          } else {
            router.push('/');
          }
        }
      }
    }
  }, [user, loading, pathname, router]);

  const login = async (email: string, password: string, rememberMe?: boolean, otp?: string) => {
    const response = await api.post('/auth/login', { email, password, rememberMe, otp });
    
    if (response.mfaRequired) {
      return response;
    }

    setUser(response.user);
    if (response.user.requiresPasswordReset) {
      router.push('/reset-password');
    } else if (response.user.role === 'Admin') {
      router.push('/admin');
    } else {
      router.push('/');
    }
    return {};
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (e) {
      // Proceed with local logout regardless of API success
    } finally {
      setUser(null);
      router.push('/login');
    }
  };

  const hasPermission = (action: string, resource: string): boolean => {
    if (!user) return false;
    if (user.role === 'Admin' || user.role === 'CMD') return true;
    if (['Manager', 'Supervisor', 'Employee'].includes(user.role) && resource !== 'AdminControl') {
      if (['View', 'Create', 'Edit', 'Export'].includes(action)) {
        if (!user.permissions || user.permissions.length === 0) return true;
        const hasExplicitResource = user.permissions.some(p => p.resource === resource);
        if (!hasExplicitResource) return true;
      }
    }
    return (user.permissions || []).some(p => p.action === action && p.resource === resource);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasPermission, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
