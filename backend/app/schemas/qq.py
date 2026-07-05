from pydantic import BaseModel


class QrCodeResponse(BaseModel):
    image_base64: str
    identifier: str


class CheckQrRequest(BaseModel):
    identifier: str


class CheckQrResponse(BaseModel):
    done: bool
    event: str | None = None
    credential: dict | None = None


class FavSongRequest(BaseModel):
    credential: dict


class SharedSonglistRequest(BaseModel):
    songlist_id: int


class SubscribeResponse(BaseModel):
    stream_id: str
    songs: list
    total: int
    interval: int
