// 前端配置：VITE_ 环境变量注入（vite 构建期），均有默认值
// vite 仅暴露 VITE_ 前缀变量给客户端 bundle，后端密钥不会泄露
export const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "/api",
  qrPollInterval: Number(import.meta.env.VITE_QR_POLL_INTERVAL ?? 2000),
  classifyMaxIterations: Number(import.meta.env.VITE_CLASSIFY_MAX_ITERATIONS ?? 5),
  classifyMaxSongs: Number(import.meta.env.VITE_CLASSIFY_MAX_SONGS ?? 2000),
  profileTagCloudMax: Number(import.meta.env.VITE_PROFILE_TAG_CLOUD_MAX ?? 50),
} as const;
