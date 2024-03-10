from pydantic import BaseModel


class InitGameRequest(BaseModel):
    userName: str
    gameName: str
    gameTheme: str