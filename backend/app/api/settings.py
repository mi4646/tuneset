"""AI 代理配置 API. 仅超管可访问.

GET /proxy        → 读取配置（库无记录返回默认）
PUT /proxy        → upsert 配置（password 语义：None=不改, ""=清空, 非空=更新）
POST /proxy/test  → 三档连通性测试（L1 TCP / L2 HTTP / L3 Chat）
"""

import socket

import httpx
from fastapi import APIRouter, Depends
from openai import OpenAI

from app.auth.deps import get_superadmin
from app.config import settings
from app.db.base import SessionLocal
from app.logging import get_logger
from app.models import ProxyConfig, User
from app.schemas.settings import (
    ProxyConfigResponse,
    ProxyConfigUpdate,
    ProxyTestRequest,
    ProxyTestResponse,
    ProxyTestStepResult,
)
from app.security.crypto import decrypt, encrypt

log = get_logger(__name__)

router = APIRouter()


def _build_proxy_url(host: str, port: int, username: str | None, password: str | None) -> str:
    auth = ""
    if username:
        pwd = password or ""
        auth = f"{username}:{pwd}@"
    return f"http://{auth}{host}:{port}"


def _get_or_default() -> ProxyConfig:
    """读取 ProxyConfig(id=1)，库无记录返回默认对象（不落库）."""
    with SessionLocal() as db:
        cfg = db.get(ProxyConfig, 1)
        if cfg is not None:
            return cfg
    return ProxyConfig(id=1, enabled=False, host="", port=0, username=None, password_enc=None)


@router.get("/proxy", response_model=ProxyConfigResponse)
def get_proxy(_: User = Depends(get_superadmin)) -> ProxyConfigResponse:
    cfg = _get_or_default()
    return ProxyConfigResponse(
        enabled=cfg.enabled,
        host=cfg.host,
        port=cfg.port,
        username=cfg.username,
        password_is_set=cfg.password_enc is not None,
    )


@router.put("/proxy", response_model=ProxyConfigResponse)
def put_proxy(
    body: ProxyConfigUpdate,
    _: User = Depends(get_superadmin),
) -> ProxyConfigResponse:
    with SessionLocal() as db:
        cfg = db.get(ProxyConfig, 1)
        if cfg is None:
            cfg = ProxyConfig(id=1)
            db.add(cfg)
        cfg.enabled = body.enabled
        cfg.host = body.host
        cfg.port = body.port
        cfg.username = body.username or None
        # password 语义：None=不改;""=清空;非空=更新
        if body.password is not None:
            if body.password == "":
                cfg.password_enc = None
            else:
                cfg.password_enc = encrypt(body.password)
        db.commit()
        result = ProxyConfigResponse(
            enabled=cfg.enabled,
            host=cfg.host,
            port=cfg.port,
            username=cfg.username,
            password_is_set=cfg.password_enc is not None,
        )
    log.info(
        "proxy_config_save",
        user_id=_.id,
        enabled=body.enabled,
        host=body.host,
        port=body.port,
    )
    return result


@router.post("/proxy/test", response_model=ProxyTestResponse)
def test_proxy(
    body: ProxyTestRequest,
    _: User = Depends(get_superadmin),
) -> ProxyTestResponse:
    host = body.host
    port = body.port

    # password: None=用已存的;""=无密码;非空=用此值
    password = body.password
    if password is None:
        cfg = _get_or_default()
        if cfg.password_enc:
            try:
                password = decrypt(cfg.password_enc)
            except Exception:
                password = ""
        else:
            password = ""
    elif password == "":
        password = ""
    # else 非空=用此值

    username = body.username

    # L1: TCP
    try:
        with socket.create_connection((host, port), timeout=5):
            pass
        l1 = ProxyTestStepResult(ok=True, detail="TCP 连接成功")
    except Exception as e:
        l1 = ProxyTestStepResult(ok=False, detail=f"TCP 连接失败：{e}")
        skipped = ProxyTestStepResult(ok=False, detail="跳过（L1 失败）")
        log.info("proxy_config_test", user_id=_.id, l1_ok=False, l2_ok=False, l3_ok=False)
        return ProxyTestResponse(l1_tcp=l1, l2_http=skipped, l3_chat=skipped)

    proxy_url = _build_proxy_url(host, port, username, password)

    # L2: HTTP（任意 HTTP 响应即 ok，含 401/404）
    try:
        with httpx.Client(proxy=proxy_url) as client:
            resp = client.get(settings.ai_base_url, timeout=10)
        l2 = ProxyTestStepResult(ok=True, detail=f"HTTP 响应 {resp.status_code}")
    except Exception as e:
        l2 = ProxyTestStepResult(ok=False, detail=f"HTTP 请求失败：{e}")
        log.info("proxy_config_test", user_id=_.id, l1_ok=True, l2_ok=False, l3_ok=False)
        return ProxyTestResponse(l1_tcp=l1, l2_http=l2, l3_chat=ProxyTestStepResult(ok=False, detail="跳过（L2 失败）"))

    # L3: Chat（OpenAI 调用，返回非空即 ok）
    try:
        with httpx.Client(proxy=proxy_url) as http_client:
            client = OpenAI(
                api_key=settings.ai_api_key,
                base_url=settings.ai_base_url,
                http_client=http_client,
            )
            resp = client.chat.completions.create(
                model=settings.ai_model,
                messages=[{"role": "user", "content": "ping"}],
                max_tokens=1,
            )
            content = resp.choices[0].message.content or ""
            if content:
                l3 = ProxyTestStepResult(ok=True, detail="AI 响应成功")
            else:
                l3 = ProxyTestStepResult(ok=False, detail="AI 返回空内容")
    except Exception as e:
        l3 = ProxyTestStepResult(ok=False, detail=f"AI 调用失败：{e}")

    log.info("proxy_config_test", user_id=_.id, l1_ok=True, l2_ok=True, l3_ok=l3.ok)
    return ProxyTestResponse(l1_tcp=l1, l2_http=l2, l3_chat=l3)
