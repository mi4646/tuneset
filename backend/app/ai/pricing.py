"""AI 模型定价（per 1M tokens）。用于成本估算与审计.

开发者按实际单价更新 PRICING 表。未列出的模型返回 0.0。
"""

PRICING: dict[str, dict[str, float]] = {
    "gpt-4o-mini": {"input": 1.5, "output": 6.0},
    "gpt-4o": {"input": 18.0, "output": 72.0},
    "claude-3-5-haiku-20241022": {"input": 8.0, "output": 40.0},
    "claude-3-5-sonnet-20241022": {"input": 22.0, "output": 110.0},
}


def estimate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    """估算单次调用成本（元）。模型未列出返回 0.0."""
    price = PRICING.get(model)
    if price is None:
        return 0.0
    return (
        input_tokens / 1_000_000 * price["input"]
        + output_tokens / 1_000_000 * price["output"]
    )
