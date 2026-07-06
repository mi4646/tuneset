"""AI 模型统一接口. 按 settings.ai_protocol 分流 openai/anthropic 双 SDK."""

from app.config import settings


class AIProvider:
    """统一 AI 调用接口，屏蔽 openai/anthropic SDK 差异.

    chat() 返回 (text, usage)，usage 含 input_tokens/output_tokens 供审计 + 成本估算。
    """

    def __init__(self) -> None:
        self._protocol = settings.ai_protocol
        self._client = None  # lazy: 首次 chat() 时构造,避免 import 阶段校验 api_key

    def _build_client(self):
        if self._protocol == "openai":
            from openai import OpenAI

            return OpenAI(api_key=settings.ai_api_key, base_url=settings.ai_base_url)
        if self._protocol == "anthropic":
            from anthropic import Anthropic

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
        if self._client is None:
            self._client = self._build_client()
        if self._protocol == "openai":
            resp = self._client.chat.completions.create(
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
        resp = self._client.messages.create(
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
