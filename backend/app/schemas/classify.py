from pydantic import BaseModel


class SongIn(BaseModel):
    song_id: int
    song_type: int = 0
    name: str
    singer: str = ""
    labels: list[str] = []
    lyric: str | None = None


class StartRequest(BaseModel):
    songs: list[SongIn]


class StartResponse(BaseModel):
    thread_id: str
    status: str
    proposal: list = []
    iteration: int = 0


class FeedbackRequest(BaseModel):
    feedback_text: str | None = None
    feedback_drag: list[dict] | None = None


class ConfirmRequest(BaseModel):
    credential: dict
    dirname_template: str = "{category}"


class StateResponse(BaseModel):
    thread_id: str
    status: str
    proposal: list | None = None
    iteration: int = 0
    plan: dict | None = None
