import axios from "axios";

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

export const authApi = {
  register: (data: { email: string; password: string; invite_code?: string }) =>
    api.post("/auth/register", data),
  login: (data: { email: string; password: string }) =>
    api.post("/auth/login", data).then((r) => {
      setToken(r.data.access_token, r.data.refresh_token);
      return r;
    }),
  refresh: () => api.post("/auth/refresh", { refresh_token: localStorage.getItem("refresh") }),
  me: () => api.get("/auth/me"),
};

export const qqApi = {
  qrcode: () => api.post("/qq/qrcode"),
  check: (identifier: string) => api.post("/qq/check", { identifier }),
};

export const songlistApi = {
  shared: (songlist_id: number) => api.post("/songlist/shared", { songlist_id }),
  favorite: (euin: string, credential: Record<string, unknown>) =>
    api.post("/songlist/favorite", { euin, credential }),
};

export const classifyApi = {
  start: (songs: unknown[]) => api.post("/classify/start", { songs }),
  state: (thread_id: string) => api.get(`/classify/${thread_id}`),
  feedback: (thread_id: string, data: { feedback_text?: string; feedback_drag?: unknown[] }) =>
    api.post(`/classify/${thread_id}/feedback`, data),
  confirm: (thread_id: string, data: { credential: Record<string, unknown>; dirname_template?: string }) =>
    api.post(`/classify/${thread_id}/confirm`, data),
  cancel: (thread_id: string) => api.post(`/classify/${thread_id}/cancel`),
};
