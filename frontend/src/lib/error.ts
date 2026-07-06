/** 从 axios 错误中提取后端 detail 消息，兜底到 message 或默认文案 */
export function errMsg(e: unknown, fallback = "请求失败"): string {
  const r = (e as { response?: { data?: { detail?: string } } })?.response;
  if (r?.data?.detail) return r.data.detail;
  const m = (e as { message?: string })?.message;
  return m || fallback;
}
