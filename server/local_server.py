from typing import List

from fastapi import FastAPI, Request
from starlette.middleware.cors import CORSMiddleware

from dto.request_dtos import InitGameRequest, WelcomeRequest, TalkToAllRequest, TalkToPlayer, VoteRoundOne
from lambda_functions import init_game, get_welcome_message, talk_to_all, talk_to_certain_player, \
    ask_certain_player_to_vote, get_all_games, get_chat_history
from models import ArbiterReply, VotingResponse, GameListDto, AllGamesRecordDto

app = FastAPI()


# Configure CORS
origins = [
    "http://localhost",
    "http://localhost:8081",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {"Hello": "World"}


@app.post("/init_game/")
async def init_game_endpoint(request: Request):
    data = await request.json()
    init_game_request = InitGameRequest(**data)
    game_id, human_player_role, bot_players, story = init_game(
        human_player_name=init_game_request.userName,
        game_name=init_game_request.gameName,
        theme=init_game_request.gameTheme
    )

    return {
        "game_id": game_id,
        "story": story,
        "human_player_role": human_player_role.value,
        "bot_players": bot_players
    }


@app.get("/all_games/")
async def init_game_endpoint():
    games: List[AllGamesRecordDto] = get_all_games()
    return games


@app.get("/chat_history/{game_id}")
async def get_chat_history_endpoint(game_id: str):
    messages = get_chat_history(game_id)
    return [message.dict() for message in messages]


@app.post("/get_welcome_message/")
async def init_game_endpoint(request: Request):
    data = await request.json()
    request = WelcomeRequest(**data)
    return get_welcome_message(
        game_id=request.gameId, bot_player_id=request.id
    )


@app.post("/talk_to_all/")
async def init_game_endpoint(request: Request):
    data = await request.json()
    request = TalkToAllRequest(**data)
    arbiter_reply: ArbiterReply = talk_to_all(
        game_id=request.gameId, user_message=request.message
    )
    return arbiter_reply


@app.post("/talk_to_certain_player/")
async def init_game_endpoint(request: Request):
    data = await request.json()
    request = TalkToPlayer(**data)
    arbiter_reply: ArbiterReply = talk_to_certain_player(
        game_id=request.gameId, name=request.name
    )
    return arbiter_reply


@app.post("/ask_certain_player_to_vote/")
async def init_game_endpoint(request: Request):
    data = await request.json()
    request = VoteRoundOne(**data)
    voting_response: VotingResponse = ask_certain_player_to_vote(
        game_id=request.gameId, bot_player_id=request.participantId
    )
    return voting_response
