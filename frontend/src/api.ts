import axios from "axios";
import type {
  CheckQrResponse,
  ConfirmResponse,
  DragFeedback,
  QrCodeResponse,
  SharedSonglistResponse,
  SongItem,
  StartResponse,
  StateResponse,
  SubscribeResponse,
  TokenPair,
  User,
} from "./types";

const api = axios.create({ baseURL: "/api" });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function setToken(access: string, refresh: string) {
  localStorage.setItem("token", access);
  localStorage.setItem("refresh", refresh);
}

export function clearToken() {
  localStorage.removeItem("token");
  localStorage.removeItem("refresh");
}

export function isLoggedIn() {
  return !!localStorage.getItem("token");
}

export function getCredential(): Record<string, unknown> | null {
  const raw = sessionStorage.getItem("qq_credential");
  return raw ? JSON.parse(raw) : null;
}

export function setCredential(cred: Record<string, unknown>) {
  sessionStorage.setItem("qq_credential", JSON.stringify(cred));
}

let refreshing: Promise<string> | null = null;

async function doRefresh(): Promise<string> {
  const rt = localStorage.getItem("refresh");
  if (!rt) throw new Error("no refresh token");
  const r = await axios.post<TokenPair>("/api/auth/refresh", {
    refresh_token: rt,
  });
  setToken(r.data.access_token, r.data.refresh_token);
  return r.data.access_token;
}

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config as {
      _retry?: boolean;
      url?: string;
      headers?: Record<string, string>;
    };
    if (
      error.response?.status === 401 &&
      !original._retry &&
      original.url !== "/auth/refresh"
    ) {
      original._retry = true;
      try {
        if (!refreshing) {
          refreshing = doRefresh().finally(() => {
            refreshing = null;
          });
        }
        const token = await refreshing;
        original.headers = { ...original.headers, Authorization: `Bearer ${token}` };
        return api(original);
      } catch {
        clearToken();
        if (location.pathname !== "/login") location.assign("/login");
      }
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  register: (data: { email: string; password: string; invite_code?: string }) =>
    api.post("/auth/register", data),
  login: (data: { email: string; password: string }) =>
    api.post<TokenPair>("/auth/login", data).then((r) => {
      setToken(r.data.access_token, r.data.refresh_token);
      return r;
    }),
  me: () => api.get<User>("/auth/me"),
};

export const qqApi = {
  qrcode: () => api.post<QrCodeResponse>("/qq/qrcode"),
  check: (identifier: string) =>
    api.post<CheckQrResponse>("/qq/check", { identifier }),
};

export const songlistApi = {
  shared: (songlist_id: number) =>
    api.post<SharedSonglistResponse>("/songlist/shared", { songlist_id }),
  favorite: (credential: Record<string, unknown>) =>
    api.post<SharedSonglistResponse>("/songlist/favorite", { credential }),
  subscribeFavorite: (credential: Record<string, unknown>) =>
    api.post<SubscribeResponse>("/songlist/favorite/subscribe", { credential }),
  streamUrl: (stream_id: string) => `/api/stream/${stream_id}`,
};

export const classifyApi = {
  start: (songs: SongItem[]) =>
    api.post<StartResponse>("/classify/start", { songs }),
  state: (thread_id: string) => api.get<StateResponse>(`/classify/${thread_id}`),
  feedback: (
    thread_id: string,
    data: { feedback_text?: string; feedback_drag?: DragFeedback[] }
  ) => api.post<StartResponse>(`/classify/${thread_id}/feedback`, data),
  confirm: (
    thread_id: string,
    data: { credential: Record<string, unknown>; dirname_template?: string }
  ) => api.post<ConfirmResponse>(`/classify/${thread_id}/confirm`, data),
  cancel: (thread_id: string) =>
    api.post<{ cancelled: boolean; thread_id: string }>(
      `/classify/${thread_id}/cancel`
    ),
};
