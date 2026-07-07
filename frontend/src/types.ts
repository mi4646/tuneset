export interface Credential {
  [key: string]: unknown;
}

export interface ProposalItem {
  song_id: number;
  song_type: number;
  category: string;
  reason: string;
}

export interface DragFeedback {
  song_id: number;
  from_category: string;
  to_category: string;
}

export interface SongItem {
  song_id: number;
  song_type: number;
  name: string;
  singer: string;
  labels?: string[];
  lyric?: string;
}

export interface User {
  email: string;
  is_superuser: boolean;
}

export interface ProxyConfig {
  enabled: boolean;
  host: string;
  port: number;
  username: string | null;
  password_is_set: boolean;
}

export interface ProxyConfigUpdate {
  enabled: boolean;
  host: string;
  port: number;
  username?: string | null;
  password?: string | null;
}

export interface ProxyTestRequest {
  enabled: boolean;
  host: string;
  port: number;
  username?: string | null;
  password?: string | null;
}

export interface ProxyTestStepResult {
  ok: boolean;
  detail: string;
}

export interface ProxyTestResult {
  l1_tcp: ProxyTestStepResult;
  l2_http: ProxyTestStepResult;
  l3_chat: ProxyTestStepResult;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
}

export interface QrCodeResponse {
  image_base64: string;
  identifier: string;
}

export interface CheckQrResponse {
  done: boolean;
  event?: string;
  bound?: boolean;
}

export interface QqStatusResponse {
  bound: boolean;
  euin_masked?: string;
}

export interface SharedSonglistResponse {
  songs: Record<string, unknown>[];
}

export interface SubscribeResponse {
  stream_id: string;
  songs: Record<string, unknown>[];
  total: number;
  interval: number;
}

export interface StartResponse {
  thread_id: string;
  status: string;
  proposal: ProposalItem[];
  iteration: number;
}

export interface StateResponse {
  thread_id: string;
  status: string;
  proposal?: ProposalItem[];
  iteration?: number;
  plan?: Record<string, unknown>;
}

export interface ConfirmResult {
  category: string;
  dirid: number;
  added: boolean;
}

export interface ConfirmResponse {
  results: ConfirmResult[];
}

export interface ClassifyProgressEvent {
  completed: number;
  total: number;
  status: string;
}

export interface ClassifyReadyEvent {
  status: string;
  proposal: ProposalItem[];
  iteration: number;
}

export interface ClassifyFailedEvent {
  status: string;
  error: string;
}
