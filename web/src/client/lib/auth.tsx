import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface AuthUser {
  slackUserId: string;
  displayName: string;
  isAdmin: boolean;
  team: string | null;
  coachingRole: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (slackUserId: string) => Promise<string | null>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => null,
  logout: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const STORAGE_KEY = 'atlas_user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setLoading(false);
  }, []);

  const login = async (slackUserId: string): Promise<string | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slackUserId }),
      });
      const data = await res.json();
      if (!res.ok) return data.error || 'Login failed';
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      setUser(data);
      return null;
    } catch {
      return 'Network error. Is the server running?';
    }
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
