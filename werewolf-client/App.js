import React, { useState, useRef } from 'react';
import { View, Text, Image, TextInput, Pressable, ScrollView, StyleSheet, SafeAreaView, Keyboard } from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faUser } from '@fortawesome/free-solid-svg-icons/faUser'
const logoIcon = require('./assets/logo.png');

const SplitScreenChat = () => {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const scrollViewRef = useRef(null);

  const participants = ['Cersei_Lannister', 'General_Zod', 'Harley_Quinn', 'Joker', 'Lex_Luthor', 'Thanos'];

  const sendMessage = () => {
    if (inputText.trim()) {
      const newMessage = {
        id: Math.random().toString(36).substring(7),
        text: inputText.trim(),
        timestamp: new Date(),
      };
      setMessages(previousMessages => [...previousMessages, newMessage]);
      setInputText('');
      Keyboard.dismiss();
    }
  };

  const handleIconPress = (iconName) => {
    // Placeholder function for handling icon press events
    console.log(`Icon pressed: ${iconName}`);
    // Here you can add your navigation or any other interaction
  };

  return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.menuBar}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Image source={logoIcon} style={styles.logoIcon} />
            <Text style={styles.headerTitle}>AI Werewolf</Text>
          </View>
          <Pressable onPress={() => handleIconPress('ellipsis-v')}>
            <FontAwesomeIcon icon={ faUser } size={24} color="#fff" />
          </Pressable>
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
            <ScrollView
                style={styles.chatMessages}
                ref={scrollViewRef}
                onContentSizeChange={() => scrollViewRef.current.scrollToEnd({ animated: true })}
            >
              {messages.map(message => (
                  <View key={message.id} style={styles.messageBubble}>
                    <Text style={styles.messageText}>{message.text}</Text>
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
  messageBubble: {
    backgroundColor: '#333',
    padding: 10,
    borderRadius: 5,
    marginVertical: 5,
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
  }
});

export default SplitScreenChat;
