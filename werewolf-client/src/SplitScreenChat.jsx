import React, {useState} from 'react';
import {SafeAreaView, StyleSheet, View} from 'react-native';
import MenuBar from './components/MenuBar';
import ParticipantsList from './components/ParticipantsList';
import ChatMessages from './components/ChatMessages';
import InputArea from './components/InputArea';
import NewGameModal from './components/modals/NewGameModal';
import Loader from './components/Loader';
import useChatMessages from './hooks/useChatMessages';
import useGame from './hooks/useGame';
import useNewGame from './hooks/useNewGame';
import useVoting from './hooks/useVoting';
import AllGamesModal from './components/modals/AllGamesModal';
import VotingModal from "./components/VotingModal";
import {connect} from "react-redux";
import {updateGame} from "./redux/actions";

const SplitScreenChat = () => {
    const [inputText, setInputText] = useState('');
    const [isNewGameModalVisible, setNewGameModalVisible] = useState(false);
    const [isAllGamesModalVisible, setAllGamesModalVisible] = useState(false);

    const {
        gameId,
        setGameId,
        userName,
        setUserName,
        gameName,
        setGameName,
        gameTheme,
        setGameTheme,
        isLoading,
        setLoading,
        playerIdMap,
        gameMasterLLM,
        setGameMasterLLM,
        botPlayersLLM,
        setBotPlayersLLM,
        selectedLanguage,
        setSelectedLanguage,
    } = useGame();

    const {  sendMessage } = useChatMessages(
        setLoading
    );

    const { handleNewGameModalOkPress } = useNewGame(
        setLoading,
        isNewGameModalVisible,
        setNewGameModalVisible,
        userName,
        gameName,
        gameTheme,
        setGameId,
        setGameName,
        setGameTheme,
        gameMasterLLM,
        botPlayersLLM,
        selectedLanguage,
    );

    const {
        isVotingModalVisible,
        setVotingModalVisible,
        startVoting,
        onHumanPlayerVote,
    } = useVoting(setLoading);

    const handleIconPress = (iconName) => {
        console.log(`Icon pressed: ${iconName}`);
    };

    const handleMenuPress = (menuItem) => {
        if (menuItem === 'New Game') {
            setNewGameModalVisible(true);
        } else if (menuItem === 'All Games') {
            setAllGamesModalVisible(true);
        }
    };

    const handleGameSelect = (gameId) => {
        setGameId(gameId);
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <MenuBar onMenuPress={handleMenuPress} onIconPress={handleIconPress} />
            <View style={styles.container}>
                <ParticipantsList onStartVoting={startVoting}/>
                <View style={styles.chatContainer}>
                    <ChatMessages />
                    <InputArea
                        inputText={inputText}
                        onChangeText={setInputText}
                        onSendMessage={() => sendMessage(inputText)}
                    />
                </View>
            </View>
            <NewGameModal
                isVisible={isNewGameModalVisible}
                onClose={() => setNewGameModalVisible(false)}
                onOkPress={handleNewGameModalOkPress}
                userName={userName}
                onUserNameChange={setUserName}
                gameName={gameName}
                onGameNameChange={setGameName}
                gameTheme={gameTheme}
                onGameThemeChange={setGameTheme}
                gameMasterLLM={gameMasterLLM}
                setGameMasterLLM={setGameMasterLLM}
                botPlayersLLM={botPlayersLLM}
                setBotPlayersLLM={setBotPlayersLLM}
                selectedLanguage={selectedLanguage}
                setSelectedLanguage={setSelectedLanguage}
            />
            <AllGamesModal
                isVisible={isAllGamesModalVisible}
                onClose={() => setAllGamesModalVisible(false)}
                onGameSelect={handleGameSelect}
            />
            <VotingModal
                isVisible={isVotingModalVisible}
                onClose={() => setVotingModalVisible(false)}
                participants={Array.from(playerIdMap.values())}
                onHumanPlayerVote={onHumanPlayerVote}
            />
            {isLoading && <Loader />}
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#282c34',
    },
    container: {
        flex: 1,
        flexDirection: 'row',
    },
    chatContainer: {
        width: '80%',
        padding: 10,
    },
});

const mapStateToProps = (state) => ({
    game: state.game,
});

const mapDispatchToProps = {
    updateGame,
};

export default connect(mapStateToProps, mapDispatchToProps)(SplitScreenChat);