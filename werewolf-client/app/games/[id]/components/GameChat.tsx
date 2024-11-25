'use client';

import { useEffect, useState } from 'react';
import { addMessageToChatAndSaveToDb } from "@/app/api/game-actions";
import {buttonTransparentStyle} from "@/app/constants";
import {GAME_STATES, Message} from "@/app/api/game-models";
import {RECIPIENT_ALL} from "@/app/ai/ai-models";

interface GameChatProps {
    gameId: string;
    gameState: string;
}

export default function GameChat({ gameId, gameState }: GameChatProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');

    useEffect(() => {
        const eventSource = new EventSource(`/api/games/${gameId}/messages/sse`);
        eventSource.onmessage = (event) => {
            const message = JSON.parse(event.data); // Convert to AgentMessageDto
            setMessages(prev => [...prev, message]);
        };

        return () => eventSource.close();
    }, [gameId]);

    const sendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newMessage.trim() === '') return;

        try {
            const result = await addMessageToChatAndSaveToDb(gameId, newMessage, 'User', RECIPIENT_ALL); // todo: there should be the player name
            if (result) {
                setNewMessage('');
            }
        } catch (err) {
            console.error("Error sending message:", err);
        }
    };

    const isInputEnabled = gameState === GAME_STATES.DAY_DISCUSSION;

    return (
        <div className="flex flex-col h-full border border-white border-opacity-30 rounded-lg p-4">
            <h2 className="text-xl font-bold mb-4 text-white">Game Chat</h2>
            <div className="flex-grow overflow-y-auto mb-4 p-2 bg-black bg-opacity-30 rounded">
                {messages.map((message, index) => (
                    <div key={message.id} className={`mb-2 ${message.sender === 'User' ? 'text-right' : 'text-left'}`}>
                        {(index === 0 || messages[index - 1].sender !== message.sender) && (
                            <span
                                className={`text-xs ${message.sender === 'User' ? 'text-gray-300' : 'text-gray-400'} mb-1 block`}>
                                {message.sender}
                            </span>
                        )}
                        <span
                            className={`inline-block p-2 rounded-lg ${message.sender === 'User' ? 'bg-slate-700 text-white' : 'bg-slate-800 text-white'}`}>
                            {message.text}
                        </span>
                    </div>
                ))}
            </div>
            <form onSubmit={sendMessage} className="flex">
                <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    disabled={!isInputEnabled}
                    className={`flex-grow p-3 rounded-l bg-black bg-opacity-30 text-white placeholder-gray-400 border
                        mr-3 border-gray-600 focus:outline-none focus:border-gray-500
                        ${!isInputEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                    placeholder={isInputEnabled ? "Type a message..." : "Waiting for game to start..."}
                />
                <button 
                    type="submit" 
                    disabled={!isInputEnabled}
                    className={`${buttonTransparentStyle} ${!isInputEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    Send
                </button>
            </form>
        </div>
    );
}