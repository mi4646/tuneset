"""AI 模型统一接口. 按 settings.ai_protocol 分流 openai/anthropic 双 SDK.

每次 chat() 从 DB 读 ProxyConfig，enabled 时构造 httpx.Client(proxy=...) 注入 SDK，
保证代理配置热生效（改完不重启 worker）。
"""

from app.config import settings
from app.logging import get_logger

log = get_logger(__name__)


class AIProvider:
    """统一 AI 调用接口，屏蔽 openai/anthropic SDK 差异.

    chat() 返回 (text, usage)，usage 含 input_tokens/output_tokens 供审计 + 成本估算。
    """

    def __init__(self) -> None:
        self._protocol = settings.ai_protocol

    def _read_proxy_url(self) -> str | None:
        """从 DB 读 ProxyConfig(id=1)，enabled 且字段有效时返回代理 URL，否则 None（直连）."""
        try:
            from app.db.base import SessionLocal
            from app.models import ProxyConfig
            from app.security.crypto import decrypt

            with SessionLocal() as db:
                cfg = db.get(ProxyConfig, 1)
                if cfg is None or not cfg.enabled:
                    return None
                if not cfg.host or cfg.port <= 0:
                    return None
                # 构造 http://[user:pass@]host:port
                auth = ""
                if cfg.username:
                    pwd = ""
                    if cfg.password_enc:
                        try:
                            pwd = decrypt(cfg.password_enc)
                        except Exception:
                            log.warning("proxy_password_decrypt_failed")
                    auth = f"{cfg.username}:{pwd}@"
                return f"http://{auth}{cfg.host}:{cfg.port}"
        except Exception as e:
            log.warning("proxy_config_read_failed", error=str(e))
            return None

    def _build_client(self):
        proxy_url = self._read_proxy_url()
        http_client = None
        if proxy_url:
            import httpx

            http_client = httpx.Client(proxy=proxy_url)

        if self._protocol == "openai":
            from openai import OpenAI

            if http_client:
                return OpenAI(
                    api_key=settings.ai_api_key,
                    base_url=settings.ai_base_url,
                    http_client=http_client,
                )
            return OpenAI(api_key=settings.ai_api_key, base_url=settings.ai_base_url)
        if self._protocol == "anthropic":
            from anthropic import Anthropic

            if http_client:
                return Anthropic(
                    api_key=settings.ai_api_key,
                    http_client=http_client,
                )
            return Anthropic(api_key=settings.ai_api_key)
        raise ValueError(f"unsupported ai_protocol: {self._protocol}")

    def chat(
        self,
        system: str,
        user: str,
        *,
        max_tokens: int = 2000,
        temperature: float = 0.3,
    ) -> tuple[str, dict[str, int]]:
        """返回 (response_text, usage). usage = {input_tokens, output_tokens}."""
        # 每次构造 client（不缓存），保证代理配置热生效
        client = self._build_client()
        if self._protocol == "openai":
            resp = client.chat.completions.create(
                model=settings.ai_model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                max_tokens=max_tokens,
                temperature=temperature,
            )
            text = resp.choices[0].message.content or ""
            usage = {
                "input_tokens": resp.usage.prompt_tokens,
                "output_tokens": resp.usage.completion_tokens,
            }
            return text, usage
        # anthropic
        resp = client.messages.create(
            model=settings.ai_model,
            system=system,
            messages=[{"role": "user", "content": user}],
            max_tokens=max_tokens,
            temperature=temperature,
        )
        text = resp.content[0].text if resp.content else ""
        usage = {
            "input_tokens": resp.usage.input_tokens,
            "output_tokens": resp.usage.output_tokens,
        }
        return text, usage


ai_provider = AIProvider()
