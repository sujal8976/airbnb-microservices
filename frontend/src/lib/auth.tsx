import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import type { User } from "./api";
import { saveSession, clearSession, getSessionUser } from "./api";

interface AuthContextValue {
  user: User | null;
  login: (user: User, token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(getSessionUser());

  function login(user: User, token: string) {
    saveSession(user, token);
    setUser(user);
  }

  function logout() {
    clearSession();
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
