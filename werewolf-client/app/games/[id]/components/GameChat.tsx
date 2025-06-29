'use client';

import React, { useEffect, useState } from 'react';
import { talkToAll, humanPlayerVote } from "@/app/api/bot-actions";
import { beginNight, performNightAction } from "@/app/api/night-actions";
import { buttonTransparentStyle } from "@/app/constants";
import { GAME_STATES, MessageType, RECIPIENT_ALL, GameMessage, Game, SystemErrorMessage, BotResponseError, GAME_MASTER } from "@/app/api/game-models";
import { getPlayerColor } from "@/app/utils/color-utils";
import { convertMessageContent } from "@/app/utils/message-utils";
import { clearGameErrorState } from "@/app/api/game-actions";
import VotingModal from "./VotingModal";

interface GameChatProps {
    gameId: string;
    game: Game;
    onGameStateChange?: (updatedGame: Game) => void;
    clearNightMessages?: boolean;
    onErrorHandled?: () => void;
}

interface BotAnswer {
    reply: string;
    type: string;
}

interface GameStory {
    story: string;
}

interface VoteMessage {
    who: string;
    why: string;
}


interface ErrorBannerProps {
    error: SystemErrorMessage;
    onDismiss: () => void;
    onRetry?: () => void;
}

function ErrorBanner({ error, onDismiss, onRetry }: ErrorBannerProps) {
    const isWarning = error.error.toLowerCase().includes('warning');
    const bgColor = isWarning ? 'bg-yellow-900/50 border-yellow-500/30' : 'bg-red-900/50 border-red-500/30';
    const textColor = isWarning ? 'text-yellow-200' : 'text-red-200';
    const iconColor = isWarning ? 'text-yellow-400' : 'text-red-400';

    return (
        <div className={`mb-4 p-3 rounded-lg border ${bgColor} ${textColor}`}>
            <div className="flex items-start justify-between">
                <div className="flex items-start space-x-2 flex-1">
                    <div className={`mt-0.5 ${iconColor}`}>
                        {isWarning ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                                <line x1="12" y1="9" x2="12" y2="13"/>
                                <line x1="12" y1="17" x2="12.01" y2="17"/>
                            </svg>
                        ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="15" y1="9" x2="9" y2="15"/>
                                <line x1="9" y1="9" x2="15" y2="15"/>
                            </svg>
                        )}
                    </div>
                    <div className="flex-1">
                        <div className="font-medium text-sm">{error.error}</div>
                        {error.details && (
                            <div className="text-xs mt-1 opacity-80">{error.details}</div>
                        )}
                    </div>
                </div>
                <div className="flex items-center space-x-2 ml-4">
                    {error.recoverable && onRetry && (
                        <button
                            onClick={onRetry}
                            className="px-2 py-1 text-xs rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                            title="Retry the failed action"
                        >
                            Retry
                        </button>
                    )}
                    <button
                        onClick={onDismiss}
                        className="p-1 rounded hover:bg-gray-600/50 transition-colors"
                        title="Dismiss"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
}

function renderMessage(message: GameMessage, gameId: string, onDeleteAfter: (messageId: string) => void, game: Game) {
    const isUserMessage = message.messageType === MessageType.HUMAN_PLAYER_MESSAGE || message.authorName === game.humanPlayerName;
    const isGameMaster = message.authorName === GAME_MASTER || message.messageType === MessageType.GM_COMMAND || message.messageType === MessageType.NIGHT_BEGINS;
    const isBotMessage = message.messageType === MessageType.BOT_ANSWER && !isGameMaster && !isUserMessage;
    
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
            case MessageType.VOTE_MESSAGE: {
                const voteMessage: VoteMessage = message.msg as VoteMessage;
                displayContent = `🗳️ Votes for ${voteMessage.who}: "${voteMessage.why}"`;
                break;
            }
            case MessageType.GM_COMMAND:
                displayContent = typeof message.msg === 'string' ? `🎭 ${message.msg}` : '🎭 Invalid message format';
                break;
            case MessageType.NIGHT_BEGINS:
                displayContent = typeof message.msg === 'string' ? `🌙 ${message.msg}` : '🌙 Invalid message format';
                break;
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

    const isVoteMessage = message.messageType === MessageType.VOTE_MESSAGE;
    
    return (
        <div className={`${isGameMaster ? 'py-2' : 'mb-2'} ${isUserMessage ? 'text-right' : 'text-left'} group`}>
            <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-semibold ${
                    isGameMaster ? 'text-green-400' : 
                    isUserMessage ? 'text-gray-300' : ''
                }`} style={!isUserMessage && !isGameMaster ? { color: getPlayerColor(message.authorName) } : undefined}>
                    {message.authorName}
                </span>
                {isBotMessage && message.id && !isVoteMessage && (
                    <button
                        onClick={() => onDeleteAfter(message.id!)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 ml-2 p-1 rounded hover:bg-gray-600/50"
                        title="Reset chat to this point (delete all messages after this one)"
                    >
                        <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="text-gray-400 hover:text-red-400"
                        >
                            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                            <path d="M21 3v5h-5"/>
                            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                            <path d="M3 21v-5h5"/>
                        </svg>
                    </button>
                )}
            </div>
            <span className={`inline-block p-2 ${
                isGameMaster ? 'rounded-lg bg-green-900/50 border border-green-500/30' :
                isVoteMessage ? 'rounded-lg bg-orange-900/50 border border-orange-500/30' :
                isUserMessage ? 'rounded-lg bg-slate-700' : 'rounded-lg'
            } text-white`} style={!isUserMessage && !isGameMaster && !isVoteMessage ? { backgroundColor: `${getPlayerColor(message.authorName)}33` } : undefined}>
                {displayContent}
            </span>
        </div>
    );
}

export default function GameChat({ gameId, game, onGameStateChange, clearNightMessages, onErrorHandled }: GameChatProps) {
    const [messages, setMessages] = useState<GameMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [showVotingModal, setShowVotingModal] = useState(false);
    const [isVoting, setIsVoting] = useState(false);
    const [isStartingNight, setIsStartingNight] = useState(false);

    // Function to clear messages from night phase onward
    const clearMessagesFromNight = () => {
        setMessages(prev => {
            // Find the first NIGHT_BEGINS message for the current day
            const nightBeginsIndex = prev.findIndex(msg => 
                msg.messageType === MessageType.NIGHT_BEGINS && 
                msg.day === game.currentDay
            );
            
            if (nightBeginsIndex === -1) {
                console.log('🌙 No NIGHT_BEGINS message found for current day, keeping all messages');
                return prev;
            }
            
            const messagesBeforeNight = prev.slice(0, nightBeginsIndex);
            console.log(`🌙 Cleared ${prev.length - nightBeginsIndex} messages from night phase (kept ${messagesBeforeNight.length})`);
            return messagesBeforeNight;
        });
    };

    // Clear night messages when prop changes
    React.useEffect(() => {
        if (clearNightMessages) {
            clearMessagesFromNight();
        }
    }, [clearNightMessages]);


    // Auto-process queue when not empty
    useEffect(() => {
        console.log('🔍 AUTO-PROCESS QUEUE CHECK:', {
            gameState: game.gameState,
            queueLength: game.gameStateProcessQueue.length,
            queue: game.gameStateProcessQueue,
            isProcessing,
            hasError: !!game.errorState,
            gameId,
            timestamp: new Date().toISOString()
        });

        // Auto-process DAY_DISCUSSION queue
        if (game.gameState === GAME_STATES.DAY_DISCUSSION &&
            game.gameStateProcessQueue.length > 0 &&
            !isProcessing &&
            !game.errorState) {
            console.log('🚨 CALLING TALK_TO_ALL API - This could be the loop source!', {
                gameId,
                queue: game.gameStateProcessQueue
            });
            const processQueue = async () => {
                setIsProcessing(true);
                const updatedGame = await talkToAll(gameId, '');
                console.log('✅ TalkToAll API completed');
                
                // Update parent game state to clear the queue
                if (onGameStateChange) {
                    console.log('🔄 UPDATING PARENT GAME STATE after auto-processing...');
                    onGameStateChange(updatedGame);
                }
                setIsProcessing(false);
            };
            processQueue();
        }
        
        // Auto-process NIGHT queue
        if (game.gameState === GAME_STATES.NIGHT &&
            game.gameStateProcessQueue.length > 0 &&
            !isProcessing &&
            !game.errorState) {
            console.log('🌙 CALLING PERFORM_NIGHT_ACTION API', {
                gameId,
                queue: game.gameStateProcessQueue
            });
            const processNightQueue = async () => {
                setIsProcessing(true);
                const updatedGame = await performNightAction(gameId);
                console.log('✅ PerformNightAction API completed');
                
                // Update parent game state
                if (onGameStateChange) {
                    console.log('🔄 UPDATING PARENT GAME STATE after night processing...');
                    onGameStateChange(updatedGame);
                }
                setIsProcessing(false);
            };
            processNightQueue();
        }
    }, [game.gameState, game.gameStateProcessQueue, gameId, isProcessing, game.errorState, onGameStateChange]);

    // Check if it's human player's turn to vote
    useEffect(() => {
        console.log('🔍 VOTING MODAL TRIGGER CHECK:', {
            gameState: game.gameState,
            queueLength: game.gameStateProcessQueue.length,
            firstInQueue: game.gameStateProcessQueue[0],
            humanPlayerName: game.humanPlayerName,
            showVotingModal,
            isVoting,
            timestamp: new Date().toISOString()
        });
        
        if (game.gameState === GAME_STATES.VOTE &&
            game.gameStateProcessQueue.length > 0 &&
            game.gameStateProcessQueue[0] === game.humanPlayerName &&
            !showVotingModal &&
            !isVoting) {
            console.log('🚨 OPENING VOTING MODAL - This could be the loop source!');
            setShowVotingModal(true);
        }
    }, [game.gameState, game.gameStateProcessQueue, game.humanPlayerName, showVotingModal, isVoting]);

    useEffect(() => {
        const eventSource = new EventSource(`/api/games/${gameId}/messages/sse`);
        
        eventSource.onmessage = (event) => {
            const message = JSON.parse(event.data) as GameMessage;
            setMessages(prev => [...prev, message]);
        };

        eventSource.onerror = (event) => {
            console.error('SSE connection error:', event);
        };

        return () => eventSource.close();
    }, [gameId]);

    const sendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = newMessage.trim();
        if (!trimmed) return;

        setIsProcessing(true);
        const updatedGame = await talkToAll(gameId, trimmed);
        setNewMessage('');
        
        // Update parent game state
        if (onGameStateChange) {
            console.log('🔄 UPDATING GAME STATE after human message...');
            onGameStateChange(updatedGame);
        }
        setIsProcessing(false);
    };

    const handleDismissError = async () => {
        // Clear the persistent error state in the database
        try {
            console.log('🔄 CLEARING GAME ERROR STATE and refreshing...');
            const updatedGame = await clearGameErrorState(gameId);
            if (onGameStateChange) {
                onGameStateChange(updatedGame);
            }
            console.log('✅ GAME ERROR STATE CLEARED and game state refreshed');
        } catch (error) {
            console.error('Error clearing game error state:', error);
        }
    };

    const handleDeleteAfter = async (messageId: string) => {
        const confirmed = window.confirm(
            'Are you sure you want to delete all messages after this point? This action cannot be undone.'
        );
        
        if (!confirmed) return;

        try {
            setIsDeleting(true);
            const response = await fetch(`/api/games/${gameId}/messages/delete-after`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ messageId }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to delete messages');
            }

            const result = await response.json();
            console.log(result.message);
            
            // Remove deleted messages from local state
            setMessages(prev => {
                const targetIndex = prev.findIndex(msg => msg.id === messageId);
                if (targetIndex === -1) return prev;
                return prev.slice(0, targetIndex + 1);
            });

            // Refresh game state immediately if callback is provided
            if (onGameStateChange) {
                try {
                    console.log('🔄 REFRESHING GAME STATE after message deletion...');
                    const { getGame } = await import("@/app/api/game-actions");
                    const updatedGame = await getGame(gameId);
                    if (updatedGame) {
                        const aliveBots = updatedGame.bots.filter(bot => bot.isAlive).map(bot => bot.name);
                        console.log('✅ GAME STATE REFRESHED - Alive bots:', aliveBots);
                        onGameStateChange(updatedGame);
                    }
                } catch (error) {
                    console.error('Error refreshing game state:', error);
                }
            }
        } catch (error) {
            console.error('Error deleting messages:', error);
            alert('Failed to delete messages. Please try again.');
        } finally {
            setIsDeleting(false);
        }
    };

    const handleVote = async (targetPlayer: string, reason: string) => {
        console.log('🗳️ HUMAN VOTE SUBMISSION:', {
            targetPlayer,
            reason,
            gameId,
            currentState: game.gameState,
            queue: game.gameStateProcessQueue,
            timestamp: new Date().toISOString()
        });
        
        setIsVoting(true);
        console.log('🚨 CALLING HUMAN_PLAYER_VOTE API - This could trigger the loop!');
        const updatedGame = await humanPlayerVote(gameId, targetPlayer, reason);
        console.log('✅ Human vote API completed, closing modal and updating state');
        setShowVotingModal(false);
        
        // Update game state if callback is provided
        if (onGameStateChange) {
            console.log('📊 Updating parent game state after vote');
            onGameStateChange(updatedGame);
        }
        setIsVoting(false);
    };

    const handleCloseVotingModal = () => {
        if (!isVoting) {
            setShowVotingModal(false);
        }
    };

    const handleStartNight = async () => {
        console.log('🌙 START NIGHT BUTTON CLICKED:', {
            gameId,
            currentState: game.gameState,
            timestamp: new Date().toISOString()
        });
        
        setIsStartingNight(true);
        console.log('🚨 CALLING BEGIN_NIGHT API');
        const updatedGame = await beginNight(gameId);
        console.log('✅ Begin night API completed, updating state');
        
        // Update game state if callback is provided
        if (onGameStateChange) {
            console.log('📊 Updating parent game state after starting night');
            onGameStateChange(updatedGame);
        }
        setIsStartingNight(false);
    };

    const isInputEnabled = game.gameState === GAME_STATES.DAY_DISCUSSION &&
                          game.gameStateProcessQueue.length === 0 &&
                          !isProcessing &&
                          !isDeleting;

    const getInputPlaceholder = () => {
        console.log(game.gameState.valueOf());
        if (game.gameState === GAME_STATES.GAME_OVER) {
            return "Game has ended - chat disabled";
        }
        if (game.gameState === GAME_STATES.NIGHT) {
            if (game.gameStateProcessQueue.length > 0) {
                const currentRole = game.gameStateProcessQueue[0];
                // Capitalize the role name for display
                const displayRole = currentRole.charAt(0).toUpperCase() + currentRole.slice(1);
                return `Night phase: ${displayRole} is taking action...`;
            }
            return "Night phase in progress...";
        }
        if (game.gameState !== GAME_STATES.DAY_DISCUSSION) {
            return "Waiting for game to start...";
        }
        if (isProcessing || game.gameStateProcessQueue.length > 0) {
            const currentBot = game.gameStateProcessQueue[0];
            return `Waiting for ${currentBot || 'bots'} to respond...`;
        }
        return "Type a message...";
    };

    return (
        <div className="flex flex-col h-full border border-white border-opacity-30 rounded-lg p-4">
            <h2 className="text-xl font-bold mb-4 text-white">Game Chat</h2>
            {game.errorState && (
                <ErrorBanner
                    error={game.errorState}
                    onDismiss={handleDismissError}
                />
            )}
            {game.gameStateProcessQueue.length > 0 && (
                <div className="mb-4 text-sm text-gray-400">
                    Bots in queue: {game.gameStateProcessQueue.join(', ')}
                </div>
            )}
            <div className="flex-grow overflow-y-auto mb-4 p-2 bg-black bg-opacity-30 rounded">
                {messages.map((message, index) => (
                    <div key={index}>
                        {renderMessage(message, gameId, handleDeleteAfter, game)}
                    </div>
                ))}
                {isDeleting && (
                    <div className="text-center text-gray-400 text-sm py-2">
                        Deleting messages...
                    </div>
                )}
            </div>
            {game.gameState === GAME_STATES.VOTE_RESULTS && (
                <div className="mb-4 flex justify-center">
                    <button
                        onClick={handleStartNight}
                        disabled={isStartingNight}
                        className={`${buttonTransparentStyle} ${isStartingNight ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title={isStartingNight ? "Starting night phase..." : "Begin the night phase where werewolves and special roles take their actions"}
                    >
                        {isStartingNight ? 'Starting Night...' : 'Start Night'}
                    </button>
                </div>
            )}
            <form onSubmit={sendMessage} className="flex">
                <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    disabled={!isInputEnabled}
                    className={`flex-grow p-3 rounded-l bg-black bg-opacity-30 text-white placeholder-gray-400 border
                        mr-3 border-gray-600 focus:outline-none focus:border-gray-500
                        ${!isInputEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                    placeholder={getInputPlaceholder()}
                />
                <button
                    type="submit"
                    disabled={!isInputEnabled}
                    className={`${buttonTransparentStyle} ${!isInputEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title={!isInputEnabled ? "Game is not ready for input" : "Send your message to all players"}
                >
                    Send
                </button>
            </form>
            {showVotingModal && (
                <VotingModal
                    isOpen={showVotingModal}
                    game={game}
                    onVote={handleVote}
                    onClose={handleCloseVotingModal}
                    isSubmitting={isVoting}
                />
            )}
        </div>
    );
}