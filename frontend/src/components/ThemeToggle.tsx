import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={isDark ? "切换到亮色" : "切换到暗色"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {mounted ? (isDark ? <Sun /> : <Moon />) : <Moon />}
    </Button>
  );
}
