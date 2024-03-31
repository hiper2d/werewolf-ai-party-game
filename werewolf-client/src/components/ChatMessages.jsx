import React, {useEffect, useRef} from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faFish } from '@fortawesome/free-solid-svg-icons/faFish';

const ChatMessages = ({ messages }) => {
    const scrollViewRef = useRef(null);

    useEffect(() => {
        if (scrollViewRef.current) {
            scrollViewRef.current.scrollToEnd({ animated: true });
        }
    }, [messages]);

    return (
        <ScrollView
            style={styles.chatMessages}
            ref={scrollViewRef}
            onContentSizeChange={() => {
                if (scrollViewRef.current) {
                    scrollViewRef.current.scrollToEnd({ animated: true });
                }
            }}
        >
            {messages.map((message) => (
                <View key={message.key} style={styles.messageContainer}>
                    <View style={styles.iconContainer}>
                        <FontAwesomeIcon
                            icon={message.isUserMessage ? faFish : faFish}
                            style={message.isUserMessage
                                ? styles.userIcon
                                : [styles.gameMasterIcon, { backgroundColor: message.authorColor }]}
                        />
                    </View>
                    <View style={styles.messageContent}>
                        <Text style={[styles.authorName, { color: message.authorColor }]}>
                            {message.author}
                        </Text>
                        <View style={styles.messageBubble}>
                            <Text style={styles.messageText}>{message.text}</Text>
                        </View>
                    </View>
                </View>
            ))}
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    chatMessages: {
        flex: 1,
    },
    messageContainer: {
        flexDirection: 'row',
        marginVertical: 5,
    },
    iconContainer: {
        marginRight: 10,
    },
    gameMasterIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#61dafb',
        padding: 5,
    },
    userIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#333',
        padding: 5,
    },
    messageContent: {
        flex: 1,
    },
    authorName: {
        fontSize: 12,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    messageBubble: {
        backgroundColor: '#333',
        borderRadius: 5,
        paddingHorizontal: 10,
        paddingVertical: 8,
    },
    messageText: {
        color: '#fff',
        fontSize: 16,
    },
});

export default ChatMessages;