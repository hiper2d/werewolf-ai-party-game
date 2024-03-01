from fastapi import FastAPI

from lambda_functions import init_game

app = FastAPI()


@app.get("/")
def read_root():
    return {"Hello": "World"}


@app.get("/init_game/")
def read_item(name="Alex", theme="Lord of the Ring"):
    game_id, human_player_role = init_game(human_player_name=name, theme=theme)
    return {"game_id": game_id, "human_player_role": human_player_role.value}
