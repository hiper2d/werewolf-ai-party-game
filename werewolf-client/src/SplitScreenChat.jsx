import React, {useRef, useState} from 'react';
import {SafeAreaView, StyleSheet, View} from 'react-native';
import MenuBar from './components/MenuBar';
import ParticipantsList from './components/ParticipantsList';
import ChatMessages from './components/ChatMessages';
import InputArea from './components/InputArea';
import NewGameModal from './components/NewGameModal';
import Loader from './components/Loader';
import useChatMessages from "././hooks/useChatMessages";
import useGame from "././hooks/useGame";
import useInitGame from "././hooks/useInitGame";
import useVoting from "./hooks/useVoting";

const SplitScreenChat = () => {
    const [inputText, setInputText] = useState('');
    const scrollViewRef = useRef(null);
    const [isModalVisible, setIsModalVisible] = useState(false);
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
        setIsLoading,
        playerIdMap,
        setPlayerIdMap,
        playerNameMap,
        setPlayerNameMap,
    } = useGame();

    const {messages, setMessages, sendMessage} = useChatMessages(setIsLoading, gameId, userName, playerNameMap);
    const {handleNewGameModalOkPress} = useInitGame(
        setIsLoading,
        isModalVisible,
        setIsModalVisible,
        setMessages,
        userName,
        gameName,
        gameTheme,
        setGameId,
        setPlayerIdMap,
        setPlayerNameMap,
        setGameName,
        setGameTheme
    );
    const {handleVotingPress} = useVoting(setIsLoading, setMessages, playerIdMap, gameId);

    const handleIconPress = (iconName) => {
        console.log(`Icon pressed: ${iconName}`);
    };

    const handleMenuPress = (menuItem) => {
        if (menuItem === 'New Game') {
            handleNewGamePress();
        } else if (menuItem === 'All Games') {
            console.log('Navigate to All Games screen');
        }
    };

    const handleNewGamePress = () => {
        setIsModalVisible(true);
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <MenuBar onMenuPress={handleMenuPress} onIconPress={handleIconPress}/>
            <View style={styles.container}>
                <ParticipantsList
                    participants={Array.from(playerIdMap.values())}
                    onVote={() => handleVotingPress()}
                />
                <View style={styles.chatContainer}>
                    <ChatMessages messages={messages} scrollViewRef={scrollViewRef}/>
                    <InputArea
                        inputText={inputText}
                        onChangeText={setInputText}
                        onSendMessage={() => sendMessage(inputText)}
                    />
                </View>
            </View>
            <NewGameModal
                isVisible={isModalVisible}
                onClose={() => setIsModalVisible(false)}
                onOkPress={() => handleNewGameModalOkPress()}
                userName={userName}
                onUserNameChange={setUserName}
                gameName={gameName}
                onGameNameChange={setGameName}
                gameTheme={gameTheme}
                onGameThemeChange={setGameTheme}
            />
            {isLoading && <Loader/>}
        </SafeAreaView>
    );
}

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
