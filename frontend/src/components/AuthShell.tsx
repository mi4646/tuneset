import { type ReactNode } from "react";
import BrandMark from "@/components/BrandMark";

export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-svh flex flex-col items-center justify-center gap-8 p-8">
      <header className="flex flex-col items-center gap-2">
        <BrandMark />
        <p className="text-sm text-muted-foreground">AI 帮你整理 QQ 音乐歌单</p>
      </header>
      {children}
    </div>
  );
}
