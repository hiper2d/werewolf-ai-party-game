import os
import time
from typing import Optional, List, Tuple
from redis import Redis
from api.models import Game
import logging

logger = logging.getLogger('my_application')


def connect_to_redis() -> Redis:
    try:
        r = Redis(host=os.getenv("REDIS_HOST"), port=os.getenv("REDIS_PORT"), db=0)
        logger.debug("Connected to Redis: %s", r.ping())
        return r
    except ConnectionError as e:
        logger.error("Failed to connect to Redis: %s", e)


def save_game_to_redis(r: Redis, game: Game):
    game_json = game.model_dump_json()
    timestamp = time.time()

    # Attempt to add to sorted set with NX option to ensure it's added only if it doesn't exist
    added_to_zset = r.zadd('games', {game.id: timestamp}, nx=True)

    # The response from zadd with NX is the number of elements added (1 if added, 0 if not)
    if added_to_zset == 1:
        logger.debug(f"Game ID {game.id} added to sorted set with timestamp {timestamp}")
    elif added_to_zset == 0:
        logger.debug(f"Game ID {game.id} already exists in sorted set, not added again")
    else:
        # This else case should not happen for NX option, included for completeness
        logger.warning(f"Unexpected result when adding Game ID {game.id} to sorted set")

    # Set the value and check response
    set_response = r.set(game.id, game_json)
    if set_response:
        logger.debug(f"Game data for ID {game.id} saved successfully to string")
    else:
        logger.warning(f"Failed to save game data for ID {game.id}")


def delete_game_from_redis(r: Redis, game: Game):
    deleted = r.delete(game.id)
    if deleted:
        logger.debug(f"Game ID {game.id} deleted successfully from Redis")
    else:
        logger.warning(f"Failed to delete game ID {game.id} from Redis")

    removed_from_zset = r.zrem('games', game.id)
    if removed_from_zset:
        logger.debug(f"Game ID {game.id} removed from sorted set successfully")
    else:
        logger.warning(f"Failed to remove game ID {game.id} from sorted set")


def load_game_from_redis(r: Redis, game_id: str) -> Optional[Game]:
    game_json = r.get(game_id)
    if game_json:
        logger.debug(f"Game with id {game_id} found in Redis")
        return Game.model_validate_json(game_json.decode('utf-8'))
    else:
        logger.warning(f"Game with id {game_id} not found in Redis")
        return None


def read_newest_game_from_redis(r: Redis) -> Optional[Game]:
    try:
        # Get the ID of the newest game from the sorted set, using ZREVRANGE to get the last item
        newest_game_id = r.zrevrange('games', 0, 0)
        if not newest_game_id:
            logger.warning("No games found in Redis.")
            return None

        # Convert bytes to string if necessary (Redis returns bytes)
        if isinstance(newest_game_id[0], bytes):
            newest_game_id = newest_game_id[0].decode('utf-8')

        game_json = r.get(newest_game_id)
        if game_json:
            logger.debug(f"Game with id {newest_game_id} found in Redis")
            return Game.model_validate_json(game_json.decode('utf-8'))
        else:
            logger.warning(f"Game with id {newest_game_id} not found in Redis")
            return None
    except Exception as e:
        logger.error(f"Failed to read newest game from Redis: {e}")
        return None


def add_message_to_game_history_redis_list(r: Redis, game_id: str, messages: List[str]) -> Tuple[bool, int]:
    if messages:
        pushed = r.rpush(f"{game_id}:history", *messages)
        if pushed:
            latest_index = pushed - 1  # Calculate the index of the last added message
            logger.debug(f"{len(messages)} messages added to game {game_id}, latest index: {latest_index}")
            return True, latest_index
        else:
            logger.warning(f"Failed to add messages to game {game_id}")
            return False, -1
    else:
        logger.debug("No messages to add.")
        return False, -1


def read_messages_from_game_history_redis_list(r: Redis, game_id: str, read_from_line: int) -> Tuple[List[str], int]:
    if not r.exists(f"{game_id}:history"):
        logger.warning(f"No list found for game ID {game_id}")
        return [], -1

    messages = r.lrange(f"{game_id}:history", read_from_line, -1)
    decoded_messages = [message.decode('utf-8') for message in messages]

    # Get the total length of the list to find the index of the latest record
    total_length = r.llen(f"{game_id}:history")
    latest_index = total_length - 1  # Subtracting 1 because list indices start at 0
    logger.debug(f"Read {len(decoded_messages)} messages from game {game_id}")
    return decoded_messages, latest_index


def delete_game_history_redis_list(r: Redis, game_id: str):
    list_key = f"{game_id}:history"
    result = r.delete(list_key)
    if result:
        logger.debug(f"List {list_key} deleted successfully.")
    else:
        logger.warning(f"List {list_key} does not exist or could not be deleted.")
