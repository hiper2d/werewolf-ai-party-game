import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faUser } from '@fortawesome/free-solid-svg-icons/faUser';

const logoIcon = require('./assets/logo.png');

const MenuBar = ({ onMenuPress, onIconPress }) => {
    return (
        <View style={styles.menuBar}>
            <View style={styles.logoContainer}>
                <Image source={logoIcon} style={styles.logoIcon} />
                <Text style={styles.headerTitle}>AI Werewolf</Text>
            </View>
            <View style={styles.menuItems}>
                <Pressable
                    onPress={() => onMenuPress('All Games')}
                    style={({ hovered, pressed }) => [
                        styles.menuItem,
                        hovered && styles.menuItemHover,
                        pressed && styles.menuItemPressed,
                    ]}
                >
                    <Text style={styles.menuItemText}>All Games</Text>
                </Pressable>
                <Pressable
                    onPress={() => onMenuPress('New Game')}
                    style={({ hovered, pressed }) => [
                        styles.menuItem,
                        hovered && styles.menuItemHover,
                        pressed && styles.menuItemPressed,
                    ]}
                >
                    <Text style={styles.menuItemText}>New Game</Text>
                </Pressable>
                <Pressable onPress={() => onIconPress('user')}>
                    <FontAwesomeIcon icon={faUser} size={24} color="#fff" />
                </Pressable>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    menuBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 10,
        backgroundColor: '#21252b',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
    },
    logoContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    logoIcon: {
        width: 60,
        height: 60,
    },
    headerTitle: {
        color: '#61dafb',
        fontSize: 20,
        fontWeight: 'bold',
        marginLeft: 10,
    },
    menuItems: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    menuItem: {
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
    menuItemText: {
        color: '#fff',
        fontSize: 16,
    },
});

export default MenuBar;