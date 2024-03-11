from pydantic import BaseModel


class InitGameRequest(BaseModel):
    userName: str
    gameName: str
    gameTheme: str

class WelcomeRequest(BaseModel):
    gameId: str
    id: str

class TalkToAllRequest(BaseModel):
    gameId: str
    message: str

class TalkToPlayer(BaseModel):
    gameId: str
    name: str