import { QueryClient } from "@tanstack/react-query";

/** 创建全局 QueryClient，配置默认 staleTime / 重试策略 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}
