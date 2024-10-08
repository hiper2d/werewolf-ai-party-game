from typing import List

from fastapi import FastAPI, Request
from starlette._middleware.cors import CORSMiddleware

from dto.request_dtos import InitGameRequest, WelcomeRequest, TalkToAllRequest, TalkToPlayer, VoteRoundOne, \
    GetGameResponse, GetBotPlayerResponse, ProcessVotingResultRequest
from api.lambda_functions import init_game, get_welcome_message, talk_to_all, talk_to_certain_player, \
    ask_certain_player_to_vote, get_all_games, get_chat_history, load_game, delete_game, start_voting, \
    process_voting_result
from api.models import ArbiterReply, AllGamesRecordDto, LLMType, DayPhase

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
        theme=init_game_request.gameTheme,
        bot_player_llm=LLMType(init_game_request.botPlayersLLM),
        reply_language_instruction=init_game_request.selectedLanguage,
        gm_llm=LLMType(init_game_request.gameMasterLLM)
    )

    return GetGameResponse(
        game_id=game_id,
        story=story,
        human_player_name=init_game_request.userName,
        human_player_role=human_player_role.value,
        bot_players=bot_players,
        current_day_phase=DayPhase.DAY_DISCUSSION.value,
        messages=[]
    )


@app.get("/all_games/")
async def init_game_endpoint():
    games: List[AllGamesRecordDto] = get_all_games()
    return games


@app.get("/game/{game_id}")
async def load_game_endpoint(game_id: str):
    game, messages, bot_players = load_game(game_id=game_id)
    return GetGameResponse(
        game_id=game.id,
        story=game.story,
        human_player_name=game.human_player.name,
        human_player_role=game.human_player.role.value,
        current_day_phase=game.current_day_phase.value,
        bot_players=[GetBotPlayerResponse(id=bot_player.id, name=bot_player.name, color=bot_player.color) for bot_player in bot_players],
        messages=[message.dict() for message in messages]
    )


@app.delete("/game/{game_id}")
async def delete_game_endpoint(game_id: str):
    delete_game(game_id)


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
        game_id=request.gameId, bot_player_id=request.playerId
    )
    return arbiter_reply


@app.post("/start_voting/")
async def start_voting_endpoint(request: Request):
    data = await request.json()
    game_id = data["gameId"]
    start_voting_message, current_day_phase = start_voting(game_id)
    return start_voting_message, current_day_phase


@app.post("/ask_certain_player_to_vote/")
async def init_game_endpoint(request: Request):
    data = await request.json()
    request = VoteRoundOne(**data)
    voting_response: str = ask_certain_player_to_vote(
        game_id=request.gameId, bot_player_id=request.participantId
    )
    return voting_response


@app.post("/process_voting_result/")
async def process_voting_result_endpoint(request: ProcessVotingResultRequest):
    game_id = request.gameId
    votes = request.votes
    backend_response = process_voting_result(game_id, votes)
    return backend_response
