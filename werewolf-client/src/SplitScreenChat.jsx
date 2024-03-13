import React, { useRef, useState } from 'react';
import { SafeAreaView, StyleSheet, View } from 'react-native';
import MenuBar from './components/MenuBar';
import ParticipantsList from './components/ParticipantsList';
import ChatMessages from './components/ChatMessages';
import InputArea from './components/InputArea';
import NewGameModal from './components/NewGameModal';
import Loader from './components/Loader';
import {
    GAME_MASTER_COLOR,
    URL_API_GET_WELCOME_MESSAGE,
    URL_API_INIT_GAME,
    URL_API_TALK_TO_ALL,
    URL_API_TALK_TO_CERTAIN_PLAYER
} from "./Constants";

const SplitScreenChat = () => {
    const [messages, setMessages] = useState([
        {
            id: Math.random().toString(36).substring(7),
            text: 'Welcome to the game! Welcome to the game! Welcome to the game! Welcome to the game! Welcome to the game! Welcome to the game! Welcome to the game! Welcome to the game!',
            timestamp: new Date(),
            isUserMessage: false,
            author: 'Game Master',
            authorColor: GAME_MASTER_COLOR
        }
    ]);
    const [inputText, setInputText] = useState('');
    const scrollViewRef = useRef(null);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [gameId, setGameId] = useState('');
    const [userName, setUserName] = useState('');
    const [gameName, setGameName] = useState('');
    const [gameTheme, setGameTheme] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [playerIdMap, setPlayerIdMap] = useState(new Map());
    const [playerNameMap, setPlayerNameMap] = useState(new Map());

    const participantColors = [
        '#61dafb', // React blue
        '#a0f0ed', // Light blue
        '#50e3c2', // Turquoise
        '#f8c555', // Yellow
        '#f76b1c', // Orange
        '#e44d26', // Red
        '#cd84f1', // Pink
        '#c56cf0', // Purple
        '#ffcc00', // Gold
        '#67e480', // Green
    ];

    const getRandomColor = () => {
        const randomIndex = Math.floor(Math.random() * participantColors.length);
        return participantColors[randomIndex];
    };

    const sendMessage = async () => {
        if (inputText.trim()) {
            const newMessage = {
                id: Math.random().toString(36).substring(7),
                text: inputText.trim(),
                timestamp: new Date(),
                isUserMessage: true,
                author: userName,
            };
            setMessages((previousMessages) => [...previousMessages, newMessage]);
            setInputText('');

            try {
                const response = await fetch(URL_API_TALK_TO_ALL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        gameId: gameId,
                        message: newMessage.text,
                    }),
                });

                if (response.ok) {
                    const data = await response.json();
                    const playersToReply = data.players_to_reply;

                    for (const playerName of playersToReply) {
                        const replyResponse = await fetch(URL_API_TALK_TO_CERTAIN_PLAYER, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                gameId: gameId,
                                name: playerName
                            }),
                        });

                        if (replyResponse.ok) {
                            const replyMessage = await replyResponse.text();
                            const playerColor = playerNameMap.get(playerName)?.color;

                            setMessages((previousMessages) => [
                                ...previousMessages,
                                {
                                    id: Math.random().toString(36).substring(7),
                                    text: replyMessage,
                                    timestamp: new Date(),
                                    isUserMessage: false,
                                    author: playerName,
                                    authorColor: playerColor,
                                },
                            ]);
                        } else {
                            console.error('Error getting reply:', replyResponse.status);
                        }
                    }
                } else {
                    console.error('Error getting players to reply:', response.status);
                }
            } catch (error) {
                console.error('Error sending message:', error);
            }
        }
    };

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

    const handleNewGameModalOkPress = async () => {
        setIsModalVisible(false);
        setIsLoading(true);
        try {
            const response = await fetch(URL_API_INIT_GAME, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userName,
                    gameName,
                    gameTheme,
                }),
            });
            if (response.ok) {
                const data = await response.json();
                console.log('New Game data:', data);
                const botPlayers = data.bot_players;
                const gameId = data.game_id;
                setGameId(gameId)
                const story = data.story;
                const humanPlayerRole = data.human_player_role;

                const newPlayerIdMap = new Map();
                const newPlayerNameMap = new Map();
                botPlayers.forEach(([playerId, playerName]) => {
                    const randomColor = getRandomColor();
                    newPlayerIdMap.set(playerId, { id: playerId, name: playerName, color: randomColor });
                    newPlayerNameMap.set(playerName, { id: playerId, name: playerName, color: randomColor });
                });
                setPlayerIdMap(newPlayerIdMap);
                setPlayerNameMap(newPlayerNameMap);

                setMessages((previousMessages) => [
                    ...previousMessages,
                    {
                        id: Math.random().toString(36).substring(7),
                        text: story,
                        timestamp: new Date(),
                        isUserMessage: false,
                        author: 'Game Master',
                        authorColor: GAME_MASTER_COLOR
                    },
                    {
                        id: Math.random().toString(36).substring(7),
                        text: `Your role is ${humanPlayerRole}`,
                        timestamp: new Date(),
                        isUserMessage: false,
                        author: 'Game Master',
                        authorColor: GAME_MASTER_COLOR,
                    },
                ]);

                for (const [playerId, playerName] of botPlayers) {
                    const welcomeResponse = await fetch(URL_API_GET_WELCOME_MESSAGE, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            'gameId': gameId,
                            'id': playerId
                        }),
                    });
                    if (welcomeResponse.ok) {
                        const welcomeMessageRaw = await welcomeResponse.text();
                        const welcomeMessage = welcomeMessageRaw.replace(/^"|"$/g, '');
                        const playerColor = newPlayerIdMap.get(playerId).color;
                        setMessages((previousMessages) => [
                            ...previousMessages,
                            {
                                id: Math.random().toString(36).substring(7),
                                text: welcomeMessage,
                                timestamp: new Date(),
                                isUserMessage: false,
                                author: playerName,
                                authorColor: playerColor,
                            },
                        ]);
                    } else {
                        console.error('Error getting welcome message:', welcomeResponse.status);
                    }
                }

                // setUserName('');
                setGameName('');
                setGameTheme('');
            } else {
                console.error('Error initializing game:', response.status);
            }
        } catch (error) {
            console.error('Error initializing game:', error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <MenuBar onMenuPress={handleMenuPress} onIconPress={handleIconPress}/>
            <View style={styles.container}>
                <ParticipantsList participants={Array.from(playerIdMap.values())}/>
                <View style={styles.chatContainer}>
                    <ChatMessages messages={messages} scrollViewRef={scrollViewRef}/>
                    <InputArea
                        inputText={inputText}
                        onChangeText={setInputText}
                        onSendMessage={sendMessage}
                    />
                </View>
            </View>
            <NewGameModal
                isVisible={isModalVisible}
                onClose={() => setIsModalVisible(false)}
                onOkPress={handleNewGameModalOkPress}
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
