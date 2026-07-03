"""auth 端点测试."""


def test_login(client):
    r = client.post(
        "/api/auth/login", json={"email": "test@t.com", "password": "password123"}
    )
    assert r.status_code == 200
    data = r.json()
    assert "access_token" in data and "refresh_token" in data


def test_me(client, auth_headers):
    r = client.get("/api/auth/me", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["email"] == "test@t.com"


def test_me_no_token(client):
    r = client.get("/api/auth/me")
    assert r.status_code == 401


def test_login_wrong_password(client):
    r = client.post(
        "/api/auth/login", json={"email": "test@t.com", "password": "wrong"}
    )
    assert r.status_code == 401
