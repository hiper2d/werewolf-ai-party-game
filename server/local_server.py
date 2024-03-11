from fastapi import FastAPI, Request
from starlette.middleware.cors import CORSMiddleware

from dto.request_dtos import InitGameRequest, WelcomeRequest, TalkToAllRequest, TalkToPlayer
from lambda_functions import init_game, get_welcome_message, talk_to_all, talk_to_certain_player
from models import ArbiterReply

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
        theme=init_game_request.gameTheme
    )

    return {
        "game_id": game_id,
        "story": story,
        "human_player_role": human_player_role.value,
        "bot_players": bot_players
    }


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
