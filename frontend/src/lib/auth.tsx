import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import { api, setAuthToken } from './api';
import type { AuthUser } from './types';

const TOKEN_KEY = 'docgen.token.v1';

interface AuthApi {
  user: AuthUser | null;
  loading: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthApi>(null as unknown as AuthApi);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    setAuthToken(token);
    try {
      setUser(await api.get<AuthUser>('/auth/me'));
    } catch {
      // Token expired or the account was deactivated server-side.
      localStorage.removeItem(TOKEN_KEY);
      setAuthToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.send<{ accessToken: string; user: AuthUser }>(
      '/auth/login', 'POST', { email, password },
    );
    localStorage.setItem(TOKEN_KEY, res.accessToken);
    setAuthToken(res.accessToken);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setAuthToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthApi>(
    () => ({ user, loading, isAdmin: user?.role === 'ADMIN', login, logout, refresh }),
    [user, loading, login, logout, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
