from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

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


@app.get("/init_game/")
def read_item(name="Alex", theme="Lord of the Ring"):
    game_id, human_player_role, player_names, story = init_game(human_player_name=name, theme=theme)
    return {
        "game_id": game_id, "story": story, "human_player_role": human_player_role.value, "player_names": player_names
    }
