"""classify 流程测试（mock AI）."""


def test_start(client, auth_headers, mock_ai):
    r = client.post(
        "/api/classify/start",
        json={"songs": [{"song_id": 1, "song_type": 0, "name": "测试", "singer": "测试"}]},
        headers=auth_headers,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] == "awaiting_feedback"
    assert data["proposal"][0]["category"] == "华语流行"
    assert data["iteration"] == 0
    assert len(data["proposal"]) == 1


def test_start_no_songs(client, auth_headers, mock_ai):
    r = client.post("/api/classify/start", json={"songs": []}, headers=auth_headers)
    assert r.status_code == 400


def test_state_not_found(client, auth_headers):
    r = client.get("/api/classify/nonexistent", headers=auth_headers)
    assert r.status_code == 404
