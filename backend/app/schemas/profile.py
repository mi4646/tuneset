"""听歌画像 schemas."""

from pydantic import BaseModel


class ProfileGenerateResponse(BaseModel):
    thread_id: str


class ProfileTag(BaseModel):
    tag: str
    weight: int


class ProfileClusterSong(BaseModel):
    song_id: int
    name: str
    singer: str


class ProfileCluster(BaseModel):
    name: str
    insight: str
    song_count: int
    songs: list[ProfileClusterSong] = []


class ProfileResult(BaseModel):
    radar: list[dict]  # [{axis: str, value: float}]
    personality: str
    clusters: list[ProfileCluster]
    artists: list[dict]  # [{artist: str, count: int}]
    tags: list[ProfileTag]
    generated_at: str  # ISO datetime


class ShareTokenCreate(BaseModel):
    pass


class ShareTokenResponse(BaseModel):
    token: str
    created_at: str
    expires_at: str


class ShareTokenListResponse(BaseModel):
    tokens: list[ShareTokenResponse]
