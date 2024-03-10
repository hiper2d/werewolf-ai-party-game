from fastapi import FastAPI, Request
from starlette.middleware.cors import CORSMiddleware

from dto.request_dtos import InitGameRequest
from lambda_functions import init_game

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
    game_id, human_player_role, player_names, story = init_game(
        human_player_name=init_game_request.userName,
        theme=init_game_request.gameTheme
    )

    return {
        "game_id": game_id,
        "story": story,
        "human_player_role": human_player_role.value,
        "player_names": player_names
    }
