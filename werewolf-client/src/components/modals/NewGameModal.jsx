import React, {useState} from 'react';
import {Modal, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {Picker} from "react-native-web";

const NewGameModal = ({
      isVisible,
      onClose,
      onOkPress,
      userName,
      onUserNameChange,
      gameName,
      onGameNameChange,
      gameTheme,
      onGameThemeChange,
      gameMasterLLM,
      setGameMasterLLM,
      botPlayersLLM,
      setBotPlayersLLM
  }) => {
    return (
        <Modal visible={isVisible} animationType="slide" transparent={true}>
            <View style={styles.modalContainer}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>New Game</Text>
                    <TextInput
                        style={styles.modalInput}
                        placeholder="User Name"
                        value={userName}
                        onChangeText={onUserNameChange}
                        placeholderTextColor="#999"
                    />
                    <TextInput
                        style={styles.modalInput}
                        placeholder="Game Name"
                        value={gameName}
                        onChangeText={onGameNameChange}
                        placeholderTextColor="#999"
                    />
                    <TextInput
                        style={styles.modalInput}
                        placeholder="Game Theme"
                        value={gameTheme}
                        onChangeText={onGameThemeChange}
                        placeholderTextColor="#999"
                    />

                    <View style={styles.dropdownContainer}>
                        <View style={styles.dropdownWrapper}>
                            <Text style={styles.dropdownLabel}>Game Master LLM:</Text>
                            <Picker
                                style={styles.dropdown}
                                selectedValue={gameMasterLLM}
                                onValueChange={(itemValue) => setGameMasterLLM(itemValue)}
                            >
                                <Picker.Item label="GPT-4" value="GPT-4" />
                                <Picker.Item label="Claude3 Opus" value="Claude3 Opus" />
                                <Picker.Item label="Mistral Large" value="Mistral Large" />
                                <Picker.Item label="Groq LLaMA3" value="Groq LLaMA3" />
                            </Picker>
                        </View>
                        <View style={styles.dropdownWrapper}>
                            <Text style={styles.dropdownLabel}>Bot Players LLM:</Text>
                            <Picker
                                style={styles.dropdown}
                                selectedValue={botPlayersLLM}
                                onValueChange={(itemValue) => setBotPlayersLLM(itemValue)}
                            >
                                <Picker.Item label="GPT-4" value="GPT-4" />
                                <Picker.Item label="Claude3 Opus" value="Claude3 Opus" />
                                <Picker.Item label="Mistral Large" value="Mistral Large" />
                                <Picker.Item label="Groq LLaMA3" value="Groq LLaMA3" />
                                <Picker.Item label="Mixed" value="Mixed" />
                            </Picker>
                        </View>
                    </View>

                    <View style={styles.modalButtonContainer}>
                        <Pressable
                            onPress={onClose}
                            style={({ pressed }) => [
                                styles.modalButton,
                                styles.cancelButton,
                                pressed && styles.buttonPressed,
                            ]}
                        >
                            <Text style={styles.modalButtonText}>Cancel</Text>
                        </Pressable>
                        <Pressable
                            onPress={onOkPress}
                            style={({ pressed }) => [
                                styles.modalButton,
                                styles.okButton,
                                (!userName || !gameName || !gameTheme) && styles.disabledButton,
                                pressed && styles.buttonPressed,
                            ]}
                            disabled={!userName || !gameName || !gameTheme}
                        >
                            <Text style={styles.modalButtonText}>OK</Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    modalContent: {
        backgroundColor: '#282c34',
        padding: 20,
        borderRadius: 10,
        width: '50%',
        alignItems: 'center',
    },
    modalTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 20,
        color: '#61dafb',
    },

    // inputs
    modalInput: {
        borderWidth: 1,
        borderColor: '#61dafb',
        borderRadius: 5,
        padding: 10,
        marginBottom: 10,
        color: '#fff',
        width: '100%',
    },

    // dropdowns
    dropdownContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
        marginBottom: 20,
    },
    dropdownWrapper: {
        flex: 1,
        marginHorizontal: 5,
    },
    dropdownLabel: {
        color: '#fff',
        marginBottom: 5,
    },
    dropdown: {
        color: '#999',
        backgroundColor: '#282c34',
        borderRadius: 5,
        paddingHorizontal: 10,
    },

    // buttons
    modalButtonContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        width: '100%',
        marginTop: 20,
    },
    modalButton: {
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 5,
    },
    cancelButton: {
        backgroundColor: '#61dafb',
    },
    okButton: {
        backgroundColor: '#61dafb',
    },
    modalButtonText: {
        color: '#282c34',
        fontSize: 16,
    },
    disabledButton: {
        opacity: 0.5,
    },
    buttonPressed: {
        opacity: 0.5,
    },
});

export default NewGameModal;