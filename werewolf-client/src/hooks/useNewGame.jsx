import {useDispatch} from "react-redux";
import {createGame} from "../redux/actions";

const useNewGame = (
    setIsLoading,
    isModalVisible,
    setModalVisible,
    userName,
    gameName,
    gameTheme,
    setGameId,
    setGameName,
    setGameTheme,
    gameMasterLLM,
    botPlayersLLM,
    selectedLanguage,
) => {
    const dispatch = useDispatch();

    const handleNewGameModalOkPress = async (

    ) => {
        setModalVisible(false);
        setIsLoading(true);
        try {
            dispatch(createGame(
                userName,
                gameName,
                gameTheme,
                gameMasterLLM,
                botPlayersLLM,
                selectedLanguage,
                setGameName,
                setGameTheme,
            ));
        } finally {
            setIsLoading(false);
        }
    };

    return {
        handleNewGameModalOkPress
    };
};

export default useNewGame;