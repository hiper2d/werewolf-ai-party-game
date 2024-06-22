'use client';

import {useEffect, useState} from 'react';
import {Message} from "@/models/messages";
import {createMessage} from "@/app/games/actions";

interface GameChatProps {
    gameId: string;
}

export default function GameChat({gameId}: GameChatProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');

    useEffect(() => {
        const eventSource = new EventSource(`/api/games/${gameId}/messages/sse`);
        eventSource.onmessage = (event) => {
            const message = JSON.parse(event.data);
            setMessages(prev => [...prev, message]);
        };

        return () => eventSource.close();
    }, [gameId]);

    const sendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newMessage.trim() === '') return;

        // setError(null);
        try {
            const result = await createMessage(gameId, newMessage, 'User');
            if (result) {
                setNewMessage('');
            } else {
                // setError(result.error || 'Failed to send message');
            }
        } catch (err) {
            // setError(err.message);
            console.error("Error sending message:", err);
        }
    };

    return (
        <div className="bg-gray-800 rounded-lg shadow-xl p-4">
            <h2 className="text-xl font-bold mb-4 text-white">Game Chat</h2>
            <div className="h-80 overflow-y-auto mb-4 p-2 bg-gray-700 rounded">
                {messages.map((message) => (
                    <div key={message.id} className="mb-2">
                        <span className="font-bold text-blue-300">{message.sender}: </span>
                        <span className="text-white">{message.text}</span>
                        {/*<span className="text-xs text-gray-400 ml-2">
                            {message.timestamp?.toDate().toLocaleDateString()}
                        </span>*/}
                    </div>
                ))}
            </div>
            <form onSubmit={sendMessage} className="flex">
                <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    className="flex-grow p-2 rounded-l text-black"
                    placeholder="Type a message..."
                />
                <button type="submit" className="bg-blue-500 text-white p-2 rounded-r">Send</button>
            </form>
        </div>
    );
}