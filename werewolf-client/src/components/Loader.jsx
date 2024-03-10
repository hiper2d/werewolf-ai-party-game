import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

const Loader = () => {
    return (
        <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color="#61dafb" />
            <Text style={styles.loaderText}>Thinking...</Text>
        </View>
    );
};

const styles = StyleSheet.create({
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
});

export default Loader;