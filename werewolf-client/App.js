import React, {useRef, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import {FontAwesomeIcon} from '@fortawesome/react-native-fontawesome';
import {faUser} from '@fortawesome/free-solid-svg-icons/faUser';
import {faFish} from '@fortawesome/free-solid-svg-icons/faFish';

const logoIcon = require('./assets/logo.png');
const BACKEND_URL = 'http://127.0.0.1:8000'

const SplitScreenChat = () => {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const scrollViewRef = useRef(null);
  const [participants, setParticipants] = useState([]);
  const [tooltipStyle, setTooltipStyle] = useState(styles.gameMasterTooltip);

  const [isLoading, setIsLoading] = useState(false);

  const Loader = () => (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#61dafb" />
        <Text style={styles.loaderText}>Loading...</Text>
      </View>
  );

  const sendMessage = () => {
    if (inputText.trim()) {
      const newMessage = {
        id: Math.random().toString(36).substring(7),
        text: inputText.trim(),
        timestamp: new Date(),
        isUserMessage: true, // Add this flag to identify user messages
      };
      setMessages((previousMessages) => [...previousMessages, newMessage]);
      setInputText('');
      Keyboard.dismiss();
    }
  };

  const handleIconPress = (iconName) => {
    // Placeholder function for handling icon press events
    console.log(`Icon pressed: ${iconName}`);
    // Here you can add your navigation or any other interaction
  };

  const handleMenuPress = (menuItem) => {
    if (menuItem === 'New Game') {
      // Send a request to the backend for the JSON data
      fetchNewGameData();
    } else if (menuItem === 'All Games') {
      // Handle navigation to the All Games screen
      console.log('Navigate to All Games screen');
    }
  };

  const fetchNewGameData = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${BACKEND_URL}/init_game`);
      const data = await response.json();
      console.log('New Game data:', data);
      // Update the participants state with the received player names
      setParticipants(data.player_names);

      // Extract the story and human player role from the response
      const story = data.story;
      const humanPlayerRole = data.human_player_role;

      // Add the story and role as messages to the chat
      setMessages((previousMessages) => [
        ...previousMessages,
        { id: Math.random().toString(36).substring(7), text: story, timestamp: new Date(), isUserMessage: false },
        {
          id: Math.random().toString(36).substring(7),
          text: `Your role is ${humanPlayerRole}`,
          timestamp: new Date(),
          isUserMessage: false,
        },
      ]);
    } catch (error) {
      console.error('Error fetching New Game data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.menuBar}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Image source={logoIcon} style={styles.logoIcon} />
            <Text style={styles.headerTitle}>AI Werewolf</Text>
          </View>
          <View style={styles.menuItems}>
            <Pressable
                onPress={() => handleMenuPress('All Games')}
                style={({ hovered, pressed }) => [
                  styles.menuItem,
                  hovered && styles.menuItemHover,
                  pressed && styles.menuItemPressed,
                ]}
            >
              <Text style={styles.menuItem}>All Games</Text>
            </Pressable>
            <Pressable
                onPress={() => handleMenuPress('New Game')}
                style={({ hovered, pressed }) => [
                  styles.menuItem,
                  hovered && styles.menuItemHover,
                  pressed && styles.menuItemPressed,
                ]}
            >
              <Text style={styles.menuItem}>New Game</Text>
            </Pressable>
            <Pressable onPress={() => handleIconPress('ellipsis-v')}>
              <FontAwesomeIcon icon={faUser} size={24} color="#fff" />
            </Pressable>
          </View>
        </View>
        <View style={styles.container}>
          <View style={styles.participantsList}>
            <Text style={styles.sidebarHeader}>Participants</Text>
            {participants.map((participant) => (
                <Text key={participant} style={styles.participantName}>
                  {participant}
                </Text>
            ))}
          </View>
          <View style={styles.chatContainer}>
            <ScrollView style={styles.chatMessages} ref={scrollViewRef} onContentSizeChange={() => scrollViewRef.current.scrollToEnd({ animated: true })}>
              {messages.map((message) => (
                  <View key={message.id} style={[styles.messageContainer, message.isUserMessage && styles.userMessageContainer]}>
                    {!message.isUserMessage && (
                        <View style={styles.iconContainer}>
                          <FontAwesomeIcon icon={faFish} style={styles.gameMasterIcon} />
                          <Text style={styles.gameMasterTooltip}>Game Master</Text>
                        </View>
                    )}
                    <View style={[styles.messageBubble, message.isUserMessage && styles.userMessageBubble]}>
                      <Text style={styles.messageText}>{message.text}</Text>
                    </View>
                    {message.isUserMessage && (
                        <View style={styles.userIconContainer}>
                          <FontAwesomeIcon icon={faFish} style={styles.userIcon} />
                        </View>
                    )}
                  </View>
              ))}
            </ScrollView>
            <View style={styles.inputArea}>
              <TextInput
                  style={styles.input}
                  value={inputText}
                  onChangeText={setInputText}
                  placeholder="Type your message..."
                  placeholderTextColor="#999"
                  onSubmitEditing={sendMessage} // Here we handle the enter key press
                  enterKeyHint="send" // Changes the return key to say "Send"
              />
              <Pressable onPress={sendMessage} style={({ pressed }) => [
                styles.sendButton,
                pressed && styles.buttonPressed
              ]}>
              <Text style={styles.sendButtonText}>Send</Text>
              </Pressable>
            </View>
          </View>
        </View>
        {isLoading && <Loader />}
      </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#282c34', // Dark background color similar to the screenshot
  },
  menuBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#21252b', // Slightly lighter dark shade for the menu bar
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)', // x-offset, y-offset, blur-radius, color
  },
  menuItems: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuItem: {
    color: '#fff',
    fontSize: 16,
    marginRight: 20,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 5,
  },
  menuItemHover: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  menuItemPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  headerTitle: {
    color: '#61dafb', // React blue color
    fontSize: 20,
    fontWeight: 'bold',
    paddingLeft: 30,
  },
  container: {
    flex: 1,
    flexDirection: 'row',
  },
  participantsList: {
    width: '30%',
    backgroundColor: '#21252b',
    padding: 10,
  },
  sidebarHeader: {
    color: '#61dafb',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  participantName: {
    color: '#abb2bf', // Light grey color for text
    fontSize: 16,
    paddingVertical: 8,
  },
  chatContainer: {
    width: '70%',
    padding: 10,
  },
  chatMessages: {
    flex: 1,
  },
  messageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 5,
  },
  iconContainer: {
    position: 'relative',
    marginRight: 10,
  },
  gameMasterIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#61dafb',
    padding: 5,
  },
  gameMasterTooltip: {
    position: 'absolute',
    top: -25,
    left: -10,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    color: '#fff',
    padding: 5,
    borderRadius: 5,
    fontSize: 12,
    opacity: 0,
  },
  messageBubble: {
    backgroundColor: '#333',
    padding: 10,
    borderRadius: 5,
    maxWidth: '80%',
  },
  messageText: {
    color: '#fff',
  },
  inputArea: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#333',
    padding: 10,
  },
  input: {
    flex: 1,
    padding: 10,
    backgroundColor: '#333',
    color: '#fff',
    borderRadius: 5,
    marginRight: 10,
  },
  sendButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: '#61dafb',
    borderRadius: 5,
  },
  sendButtonText: {
    color: '#003366',
  },
  buttonPressed: {
    opacity: 0.5, // This will give feedback to the user when the button is pressed
  },
  logoIcon: {
    width: 60,
    height: 60,
  },
  loaderContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  loaderText: {
    color: '#fff',
    fontSize: 18,
    marginTop: 10,
  },
  userMessageContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  userMessageBubble: {
    backgroundColor: '#61dafb',
    marginRight: 10,
  },
  userIconContainer: {
    marginLeft: 10,
  },
  userIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#333',
    padding: 5,
  },
});

export default SplitScreenChat;
