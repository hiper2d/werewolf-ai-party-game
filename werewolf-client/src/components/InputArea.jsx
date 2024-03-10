import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

const InputArea = ({ inputText, onChangeText, onSendMessage }) => {
    return (
        <View style={styles.inputArea}>
            <TextInput
                style={styles.input}
                value={inputText}
                onChangeText={onChangeText}
                placeholder="Type your message..."
                placeholderTextColor="#999"
                onSubmitEditing={onSendMessage}
                enterKeyHint="send"
            />
            <Pressable
                onPress={onSendMessage}
                style={({ pressed }) => [styles.sendButton, pressed && styles.buttonPressed]}
            >
                <Text style={styles.sendButtonText}>Send</Text>
            </Pressable>
        </View>
    );
};

const styles = StyleSheet.create({
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
        opacity: 0.5,
    },
});

export default InputArea;