import React, { useState } from 'react';
import { SafeAreaView, StyleSheet, View } from 'react-native';
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
        setPlayerIdMap,
        playerNameMap,
        setPlayerNameMap,
        gameMasterLLM,
        setGameMasterLLM,
        botPlayersLLM,
        setBotPlayersLLM,
        selectedLanguage,
        setSelectedLanguage,
    } = useGame();

    const { messages, setMessages, sendMessage } = useChatMessages(
        setLoading,
        gameId,
        userName,
        playerNameMap
    );

    const { handleNewGameModalOkPress } = useNewGame(
        setLoading,
        isNewGameModalVisible,
        setNewGameModalVisible,
        setMessages,
        userName,
        gameName,
        gameTheme,
        setGameId,
        setPlayerIdMap,
        setPlayerNameMap,
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
    } = useVoting(setLoading, setMessages, userName, playerIdMap, gameId);

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
                <ParticipantsList participants={Array.from(playerIdMap.values())}  onStartVoting={startVoting}/>
                <View style={styles.chatContainer}>
                    <ChatMessages messages={messages}/>
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
                onUserNameChange={(name) => setUserName(name)}
                onChatMessagesLoaded={(messages) => setMessages(messages)}
                onPlayerNameMapUpdated={(newPlayerNameMap) => setPlayerNameMap(newPlayerNameMap)}
                onPlayerIdMapUpdated={(newPlayerIdMap) => setPlayerIdMap(newPlayerIdMap)}
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

export default SplitScreenChat;