import { useState } from "react";
import { toast } from "sonner";
import { CircleCheck, CircleX } from "lucide-react";
import { useProxyConfig, useSaveProxy, useTestProxy } from "@/hooks/queries";
import { errMsg } from "@/lib/error";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProxyTestResult } from "@/types";

export default function Settings() {
  const { data: cfg, isLoading } = useProxyConfig();
  const saveProxy = useSaveProxy();
  const testProxy = useTestProxy();

  const [enabled, setEnabled] = useState(false);
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [testResult, setTestResult] = useState<ProxyTestResult | null>(null);
  const [initialized, setInitialized] = useState(false);

  // 首次拉到配置后填充表单
  if (cfg && !initialized) {
    setEnabled(cfg.enabled);
    setHost(cfg.host);
    setPort(String(cfg.port || ""));
    setUsername(cfg.username ?? "");
    setInitialized(true);
  }

  if (isLoading) return <div className="text-muted-foreground">加载中…</div>;

  const handleSave = async () => {
    const portNum = Number(port);
    if (!host.trim()) {
      toast.error("请填写 host");
      return;
    }
    if (!portNum || portNum < 1 || portNum > 65535) {
      toast.error("port 须为 1-65535");
      return;
    }
    try {
      await saveProxy.mutateAsync({
        enabled,
        host: host.trim(),
        port: portNum,
        username: username.trim() || null,
        password: password === "" ? null : password,
      });
      setPassword("");
    } catch (e: unknown) {
      toast.error(errMsg(e, "保存失败"));
    }
  };

  const handleTest = async () => {
    const portNum = Number(port);
    if (!host.trim()) {
      toast.error("请填写 host");
      return;
    }
    if (!portNum || portNum < 1 || portNum > 65535) {
      toast.error("port 须为 1-65535");
      return;
    }
    setTestResult(null);
    try {
      const result = await testProxy.mutateAsync({
        enabled: true,
        host: host.trim(),
        port: portNum,
        username: username.trim() || null,
        password: password === "" ? null : password,
      });
      setTestResult(result);
    } catch (e: unknown) {
      toast.error(errMsg(e, "测试失败"));
    }
  };

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle>AI 代理配置</CardTitle>
        <CardDescription>
          配置 worker 访问 AI API 使用的代理，保存后热生效。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <input
            id="proxy-enabled"
            type="checkbox"
            className="size-4 rounded border-input"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <Label htmlFor="proxy-enabled">启用代理</Label>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="proxy-host">Host</Label>
          <Input
            id="proxy-host"
            placeholder="host.docker.internal"
            value={host}
            onChange={(e) => setHost(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="proxy-port">Port</Label>
          <Input
            id="proxy-port"
            type="number"
            placeholder="7897"
            value={port}
            onChange={(e) => setPort(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="proxy-username">用户名（可选）</Label>
          <Input
            id="proxy-username"
            placeholder="用户名"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="proxy-password">密码（可选）</Label>
          <Input
            id="proxy-password"
            type="password"
            placeholder={
              cfg?.password_is_set ? "已设置，留空不改" : "密码"
            }
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className="rounded-md border border-yellow-400/50 bg-yellow-400/10 p-3 text-sm text-yellow-700 dark:text-yellow-300">
          若 TuneSet 跑在 Docker，host 填{" "}
          <code className="font-mono">host.docker.internal</code> 或宿主机
          IP，<strong>不要填 127.0.0.1</strong>（容器内 127.0.0.1 指容器自身）。
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={testProxy.isPending}
          >
            {testProxy.isPending ? "测试中…" : "测试"}
          </Button>
          <Button onClick={handleSave} disabled={saveProxy.isPending}>
            {saveProxy.isPending ? "保存中…" : "保存"}
          </Button>
        </div>

        {testResult && (
          <div className="flex flex-col gap-2 rounded-md border p-3">
            <TestRow label="L1 TCP" r={testResult.l1_tcp} />
            <TestRow label="L2 HTTP" r={testResult.l2_http} />
            <TestRow label="L3 Chat" r={testResult.l3_chat} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TestRow({
  label,
  r,
}: {
  label: string;
  r: { ok: boolean; detail: string };
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {r.ok ? (
        <CircleCheck className="size-4 text-green-600" />
      ) : (
        <CircleX className="size-4 text-destructive" />
      )}
      <span className="font-medium">{label}</span>
      <span className="text-muted-foreground">{r.detail}</span>
    </div>
  );
}
