import {useDispatch, useSelector} from "react-redux";
import {createGame} from "../redux/actions";

const useNewGame = (
    setIsLoading,
    isModalVisible,
    setModalVisible,
    userName,
    gameName,
    gameTheme,
    setGameName,
    setGameTheme,
    gameMasterLLM,
    botPlayersLLM,
    selectedLanguage,
) => {
    const dispatch = useDispatch();
    const game = useSelector((state) => state.game);

    const handleNewGameModalOkPress = async () => {
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