"""classify 流程测试（mock AI）."""


def test_start(client, auth_headers, mock_ai):
    r = client.post(
        "/api/classify/start",
        json={"songs": [{"song_id": 1, "song_type": 0, "name": "测试", "singer": "测试"}]},
        headers=auth_headers,
    )
    assert r.status_code == 200, r.text
    tid = r.json()["thread_id"]
    # eager 模式 task 同步完成，查 state 拿最终 proposal
    rs = client.get(f"/api/classify/{tid}", headers=auth_headers)
    assert rs.status_code == 200
    data = rs.json()
    assert data["status"] == "awaiting_feedback"
    assert data["proposal"][0]["category"] == "华语流行"
    assert data["iteration"] == 0
    assert len(data["proposal"]) == 1


def test_start_returns_running(client, auth_headers, mock_ai):
    """start 立即返回 running + 空 proposal."""
    r = client.post(
        "/api/classify/start",
        json={"songs": [{"song_id": 1, "song_type": 0, "name": "测试", "singer": "测试"}]},
        headers=auth_headers,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] == "running"
    assert data["proposal"] == []


def test_start_batch(client, auth_headers, mock_ai_batch):
    """分批 + merge 路径：3 首 > batch_size=2 → 2 批 + 1 merge."""
    songs = [
        {"song_id": i, "song_type": 0, "name": f"测试{i}", "singer": "测试"}
        for i in range(1, 4)
    ]
    r = client.post("/api/classify/start", json={"songs": songs}, headers=auth_headers)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "running"
    tid = r.json()["thread_id"]
    rs = client.get(f"/api/classify/{tid}", headers=auth_headers)
    assert rs.status_code == 200
    data = rs.json()
    assert data["status"] == "awaiting_feedback"
    assert len(data["proposal"]) == 3
    assert data["proposal"][0]["category"] == "华语流行"


def test_start_no_songs(client, auth_headers, mock_ai):
    r = client.post("/api/classify/start", json={"songs": []}, headers=auth_headers)
    assert r.status_code == 400


def test_state_not_found(client, auth_headers):
    r = client.get("/api/classify/nonexistent", headers=auth_headers)
    assert r.status_code == 404


def test_start_daily_limit(client, auth_headers, mock_ai):
    """每日上限：RATE_LIMIT_USER_DAILY=2，第 3 次 start 被 429."""
    from app.redis_client import redis_client

    songs = [{"song_id": 1, "song_type": 0, "name": "测试", "singer": "测试"}]
    for _ in range(2):
        r = client.post("/api/classify/start", json={"songs": songs}, headers=auth_headers)
        assert r.status_code == 200, r.text
        # 清 interval key，避免间隔拦截下次请求；daily key 保留累计
        for k in redis_client.keys("rl:classify:*"):
            redis_client.delete(k)
    # 第 3 次应被每日上限拦截
    r = client.post("/api/classify/start", json={"songs": songs}, headers=auth_headers)
    assert r.status_code == 429
    assert "每日" in r.json()["detail"]


def test_start_songs_over_limit_no_interval_consumed(client, auth_headers, mock_ai):
    """songs 超量被拒不应消耗间隔：连续两次超量请求都应返回 400 而非 429."""
    songs = [{"song_id": i, "song_type": 0, "name": f"测试{i}", "singer": "测试"} for i in range(1, 2002)]
    r1 = client.post("/api/classify/start", json={"songs": songs}, headers=auth_headers)
    assert r1.status_code == 400
    assert "max" in r1.json()["detail"]
    # 紧接着第二次（间隔限流应未被 setex，因为 songs 校验在前）
    r2 = client.post("/api/classify/start", json={"songs": songs}, headers=auth_headers)
    assert r2.status_code == 400
    assert "max" in r2.json()["detail"]
