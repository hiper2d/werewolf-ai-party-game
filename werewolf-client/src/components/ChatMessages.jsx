import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faFish } from '@fortawesome/free-solid-svg-icons/faFish';

const ChatMessages = ({ messages, scrollViewRef }) => {
    return (
        <ScrollView
            style={styles.chatMessages}
            ref={scrollViewRef}
            onContentSizeChange={() => scrollViewRef.current.scrollToEnd({ animated: true })}
        >
            {messages.map((message) => (
                <View
                    key={message.id}
                    style={[
                        styles.messageContainer,
                        message.isUserMessage && styles.userMessageContainer,
                    ]}
                >
                    {!message.isUserMessage && (
                        <View style={styles.iconContainer}>
                            <FontAwesomeIcon icon={faFish} style={styles.gameMasterIcon} />
                            <Text style={styles.gameMasterTooltip}>Game Master</Text>
                        </View>
                    )}
                    <View
                        style={[
                            styles.messageBubble,
                            message.isUserMessage && styles.userMessageBubble,
                        ]}
                    >
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
    );
};

const styles = StyleSheet.create({
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

export default ChatMessages;