from pydantic import BaseModel


class InitGameRequest(BaseModel):
    userName: str
    gameName: str
    gameTheme: str
    gameMasterLLM: str
    botPlayersLLM: str


class GetBotPlayerResponse(BaseModel):
    id: str
    name: str
    color: str


class GetGameResponse(BaseModel):
    game_id: str
    story: str
    human_player_role: str
    bot_players: list[GetBotPlayerResponse]
    messages: list[dict]


class WelcomeRequest(BaseModel):
    gameId: str
    id: str


class TalkToAllRequest(BaseModel):
    gameId: str
    message: str


class TalkToPlayer(BaseModel):
    gameId: str
    playerId: str


class VoteRoundOne(BaseModel):
    gameId: str
    participantId: str


class VoteRoundOneResponse(BaseModel):
    player_to_eliminate: str
    reason: str
