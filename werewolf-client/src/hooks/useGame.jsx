import { useState } from 'react';

const useGame = () => {
    const [gameId, setGameId] = useState('');
    const [userName, setUserName] = useState('');
    const [gameName, setGameName] = useState('');
    const [gameTheme, setGameTheme] = useState('');
    const [isLoading, setLoading] = useState(false);
    const [playerIdMap, setPlayerIdMap] = useState(new Map());
    const [playerNameMap, setPlayerNameMap] = useState(new Map());

    return {
        gameId,
        setGameId,
        userName,
        setUserName,
        gameName,
        setGameName,
        gameTheme,
        setGameTheme,
        isLoading,
        setLoading,
        playerIdMap,
        setPlayerIdMap,
        playerNameMap,
        setPlayerNameMap,
        // Export game-related functions
    };
};

export default useGame;