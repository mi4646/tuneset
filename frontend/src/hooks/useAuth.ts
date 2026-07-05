import { createContext, useContext } from "react";
import type { User } from "../types";

export type { User };

export interface AuthCtxValue {
  user: User | null;
  loading: boolean;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

export const AuthCtx = createContext<AuthCtxValue>({
  user: null,
  loading: true,
  logout: () => {},
  refreshUser: async () => {},
});

export function useAuth() {
  return useContext(AuthCtx);
}
