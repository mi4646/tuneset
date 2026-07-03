"""pytest 公共 fixtures. 设环境变量 + eager celery + 初始化 DB."""

import os

os.environ.setdefault("REDIS_URL", "redis://localhost:6380/0")
os.environ.setdefault("CELERY_BROKER_URL", "redis://localhost:6380/1")
os.environ.setdefault("CELERY_RESULT_BACKEND", "redis://localhost:6380/2")

import pytest
from fastapi.testclient import TestClient

from app.auth.security import hash_password
from app.db.base import SessionLocal, init_db
from app.main import app
from app.models import User
from app.tasks.celery_app import celery

celery.conf.update(task_always_eager=True)


@pytest.fixture(autouse=True)
def flush_redis():
    from app.redis_client import redis_client
    redis_client.flushdb()
    yield
    redis_client.flushdb()


@pytest.fixture(scope="session", autouse=True)
def setup_db():
    init_db()
    with SessionLocal() as db:
        if not db.query(User).filter(User.email == "test@t.com").first():
            db.add(User(email="test@t.com", password_hash=hash_password("password123")))
            db.commit()
    yield


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def auth_headers(client):
    r = client.post(
        "/api/auth/login", json={"email": "test@t.com", "password": "password123"}
    )
    assert r.status_code == 200
    return {"Authorization": f'Bearer {r.json()["access_token"]}'}


@pytest.fixture
def mock_ai():
    from unittest.mock import patch

    with patch("app.workflow.nodes.ai_provider") as m:
        m.chat.return_value = (
            '[{"song_id":1,"song_type":0,"category":"华语流行","reason":"测试"}]',
            {"input_tokens": 10, "output_tokens": 20},
        )
        yield m
