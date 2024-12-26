'use client';

import { useEffect, useState } from 'react';
import { talkToAll } from "@/app/api/bot-actions";
import { buttonTransparentStyle } from "@/app/constants";
import { GAME_STATES, MessageType, RECIPIENT_ALL, GameMessage } from "@/app/api/game-models";
import { getPlayerColor } from "@/app/utils/color-utils";

interface GameChatProps {
    gameId: string;
    gameState: string;
}

interface BotAnswer {
    reply: string;
    type: string;
}

interface GameStory {
    story: string;
}

function renderMessage(message: GameMessage) {
    const isUserMessage = message.authorName === 'User';
    const isGameMaster = message.messageType === 'GAME_MASTER_ASK';
    
    let displayContent: string;
    try {
        console.log(message)
        switch (message.messageType) {
            case MessageType.BOT_ANSWER: {
                const botAnswer: BotAnswer = message.msg as BotAnswer;
                displayContent = botAnswer.reply;
                break;
            }
            case MessageType.GAME_STORY: {
                const gameStory = message.msg as GameStory;
                displayContent = gameStory.story;
                break;
            }
            case MessageType.GM_COMMAND:
            case MessageType.HUMAN_PLAYER_MESSAGE:
                displayContent = typeof message.msg === 'string' ? message.msg : 'Invalid message format';
                break;
            default:
                displayContent = typeof message.msg === 'string' 
                    ? message.msg 
                    : JSON.stringify(message.msg);
        }
    } catch (error) {
        console.error('Error rendering message:', error);
        displayContent = 'Error displaying message';
    }

    return (
        <div className={`${isGameMaster ? 'py-2' : 'mb-2'} ${isUserMessage ? 'text-right' : 'text-left'}`}>
            {!isGameMaster && (
                <span className={`text-xs ${isUserMessage ? 'text-gray-300' : ''} mb-1 block`} style={!isUserMessage ? { color: getPlayerColor(message.authorName) } : undefined}>
                    {message.authorName}
                </span>
            )}
            <span className={`inline-block p-2 ${
                isGameMaster ? 'w-full bg-slate-600/50' : 
                isUserMessage ? 'rounded-lg bg-slate-700' : 'rounded-lg'
            } text-white`} style={!isUserMessage && !isGameMaster ? { backgroundColor: `${getPlayerColor(message.authorName)}33` } : undefined}>
                {displayContent}
            </span>
        </div>
    );
}

export default function GameChat({ gameId, gameState }: GameChatProps) {
    const [messages, setMessages] = useState<GameMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');

    useEffect(() => {
        const eventSource = new EventSource(`/api/games/${gameId}/messages/sse`);
        eventSource.onmessage = (event) => {
            const message = JSON.parse(event.data) as GameMessage;
            setMessages(prev => [...prev, message]);
        };

        return () => eventSource.close();
    }, [gameId]);

    const sendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = newMessage.trim();
        if (!trimmed) return;

        try {
            await talkToAll(gameId, trimmed);
            setNewMessage('');
        } catch (error) {
            console.error("Error sending message:", error);
        }
    };

    const isInputEnabled = gameState === GAME_STATES.DAY_DISCUSSION;

    return (
        <div className="flex flex-col h-full border border-white border-opacity-30 rounded-lg p-4">
            <h2 className="text-xl font-bold mb-4 text-white">Game Chat</h2>
            <div className="flex-grow overflow-y-auto mb-4 p-2 bg-black bg-opacity-30 rounded">
                {messages.map((message, index) => (
                    <div key={index}>
                        {renderMessage(message)}
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