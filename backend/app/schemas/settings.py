from pydantic import BaseModel, Field


class ProxyConfigResponse(BaseModel):
    enabled: bool
    host: str
    port: int
    username: str | None
    password_is_set: bool  # 不返回明文

    model_config = {"from_attributes": True}


class ProxyConfigUpdate(BaseModel):
    enabled: bool
    host: str = Field(min_length=1, max_length=255)
    port: int = Field(ge=1, le=65535)
    username: str | None = None
    password: str | None = None  # None/缺省=不改;""=清空;非空=更新


class ProxyTestRequest(BaseModel):
    enabled: bool = True
    host: str
    port: int
    username: str | None = None
    password: str | None = None  # None=用已存的;""=无密码;非空=用此值


class ProxyTestStepResult(BaseModel):
    ok: bool
    detail: str


class ProxyTestResponse(BaseModel):
    l1_tcp: ProxyTestStepResult
    l2_http: ProxyTestStepResult
    l3_chat: ProxyTestStepResult
