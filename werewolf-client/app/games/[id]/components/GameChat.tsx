'use client';

import { useEffect, useState } from 'react';
import { Message } from "@/models/messages";
import { createMessage } from "@/app/games/actions";

interface GameChatProps {
    gameId: string;
}

export default function GameChat({ gameId }: GameChatProps) {
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

        try {
            const result = await createMessage(gameId, newMessage, 'User');
            if (result) {
                setNewMessage('');
            }
        } catch (err) {
            console.error("Error sending message:", err);
        }
    };

    return (
        <div className="flex flex-col h-full rounded-lg">
            {/*<h2 className="text-xl font-bold mb-4 text-white">Game Chat</h2>*/}
            <div className="flex-grow overflow-y-auto mb-4 p-2 bg-black bg-opacity-30 border border-white border-opacity-30 rounded">
                {messages.map((message) => (
                    <div key={message.id} className="mb-2">
                        <span className="font-bold text-blue-300">{message.sender}: </span>
                        <span className="text-white">{message.text}</span>
                    </div>
                ))}
            </div>
            <form onSubmit={sendMessage} className="flex">
                <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    className="flex-grow p-3 rounded-l bg-black bg-opacity-30 text-white placeholder-gray-400 border border-gray-600 focus:outline-none focus:border-gray-500"
                    placeholder="Type a message..."
                />
                <button type="submit" className="text-white bg-black bg-opacity-30 border border-white border-opacity-30 ml-3 p-3 text-xl rounded">Send</button>
            </form>
        </div>
    );
}