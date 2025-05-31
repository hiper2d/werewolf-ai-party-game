'use client';

import { useEffect, useState } from 'react';
import { talkToAll, humanPlayerVote } from "@/app/api/bot-actions";
import { buttonTransparentStyle } from "@/app/constants";
import { GAME_STATES, MessageType, RECIPIENT_ALL, GameMessage, Game, SystemErrorMessage, BotResponseError } from "@/app/api/game-models";
import { getPlayerColor } from "@/app/utils/color-utils";
import VotingModal from "./VotingModal";

interface GameChatProps {
    gameId: string;
    game: Game;
    onGameStateChange?: (updatedGame: Game) => void;
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

function renderMessage(message: GameMessage, gameId: string, onDeleteAfter: (messageId: string) => void) {
    const isUserMessage = message.authorName === 'User';
    const isGameMaster = message.messageType === 'GAME_MASTER_ASK';
    const isBotMessage = !isUserMessage && !isGameMaster;
    
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
            {!isGameMaster && (
                <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs ${isUserMessage ? 'text-gray-300' : ''}`} style={!isUserMessage ? { color: getPlayerColor(message.authorName) } : undefined}>
                        {message.authorName}
                    </span>
                    {isBotMessage && message.id && (
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
            )}
            <span className={`inline-block p-2 ${
                isGameMaster ? 'w-full bg-slate-600/50' :
                isVoteMessage ? 'rounded-lg bg-orange-900/50 border border-orange-500/30' :
                isUserMessage ? 'rounded-lg bg-slate-700' : 'rounded-lg'
            } text-white`} style={!isUserMessage && !isGameMaster && !isVoteMessage ? { backgroundColor: `${getPlayerColor(message.authorName)}33` } : undefined}>
                {displayContent}
            </span>
        </div>
    );
}

export default function GameChat({ gameId, game, onGameStateChange }: GameChatProps) {
    const [messages, setMessages] = useState<GameMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState<SystemErrorMessage | null>(null);
    const [showErrorBanner, setShowErrorBanner] = useState(false);
    const [lastFailedAction, setLastFailedAction] = useState<(() => Promise<void>) | null>(null);
    const [showVotingModal, setShowVotingModal] = useState(false);
    const [isVoting, setIsVoting] = useState(false);

    // Auto-process queue when not empty
    useEffect(() => {
        console.log('🔍 AUTO-PROCESS QUEUE CHECK:', {
            gameState: game.gameState,
            queueLength: game.gameStateProcessQueue.length,
            queue: game.gameStateProcessQueue,
            isProcessing,
            gameId,
            timestamp: new Date().toISOString()
        });

        if (game.gameState === GAME_STATES.DAY_DISCUSSION &&
            game.gameStateProcessQueue.length > 0 &&
            !isProcessing) {
            console.log('🚨 CALLING TALK_TO_ALL API - This could be the loop source!', {
                gameId,
                queue: game.gameStateProcessQueue
            });
            const processQueue = async () => {
                setIsProcessing(true);
                try {
                    await talkToAll(gameId, '');
                    console.log('✅ TalkToAll API completed');
                } catch (error) {
                    console.error("Error processing queue:", error);
                } finally {
                    setIsProcessing(false);
                }
            };
            processQueue();
        }
    }, [game.gameState, game.gameStateProcessQueue, gameId, isProcessing]);

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

        const action = async () => {
            await talkToAll(gameId, trimmed);
            setNewMessage('');
        };

        try {
            setIsProcessing(true);
            setLastFailedAction(() => action);
            await action();
        } catch (error) {
            console.error("Error sending message:", error);
            
            // Handle BotResponseError by converting to SystemErrorMessage for display
            if (error instanceof BotResponseError) {
                const systemError: SystemErrorMessage = {
                    error: error.message || 'Bot response error occurred',
                    details: error.details || 'Failed to process bot response',
                    context: error.context || {},
                    recoverable: error.recoverable !== false, // Default to recoverable
                    timestamp: Date.now()
                };
                handleError(systemError);
            } else {
                // Handle other errors
                const systemError: SystemErrorMessage = {
                    error: 'System error occurred',
                    details: error instanceof Error ? error.message : 'Unknown error',
                    context: {},
                    recoverable: false,
                    timestamp: Date.now()
                };
                handleError(systemError);
            }
        } finally {
            setIsProcessing(false);
        }
    };

    const handleError = (errorMessage: SystemErrorMessage) => {
        setError(errorMessage);
        setShowErrorBanner(true);
    };

    const handleDismissError = () => {
        setShowErrorBanner(false);
        setError(null);
    };

    const handleRetryError = async () => {
        if (!lastFailedAction) return;
        
        try {
            setIsProcessing(true);
            setShowErrorBanner(false);
            await lastFailedAction();
            setError(null);
        } catch (error) {
            console.error("Error retrying action:", error);
            // Keep the error banner visible if retry fails
            setShowErrorBanner(true);
        } finally {
            setIsProcessing(false);
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
                    const { getGame } = await import("@/app/api/game-actions");
                    const updatedGame = await getGame(gameId);
                    if (updatedGame) {
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
        
        try {
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
        } catch (error) {
            console.error('Error casting vote:', error);
            
            // Handle voting errors
            if (error instanceof BotResponseError) {
                const systemError: SystemErrorMessage = {
                    error: error.message || 'Voting error occurred',
                    details: error.details || 'Failed to cast vote',
                    context: error.context || {},
                    recoverable: error.recoverable !== false,
                    timestamp: Date.now()
                };
                handleError(systemError);
            } else {
                const systemError: SystemErrorMessage = {
                    error: 'Failed to cast vote',
                    details: error instanceof Error ? error.message : 'Unknown error',
                    context: {},
                    recoverable: true,
                    timestamp: Date.now()
                };
                handleError(systemError);
            }
        } finally {
            setIsVoting(false);
        }
    };

    const handleCloseVotingModal = () => {
        if (!isVoting) {
            setShowVotingModal(false);
        }
    };

    const isInputEnabled = game.gameState === GAME_STATES.DAY_DISCUSSION &&
                          game.gameStateProcessQueue.length === 0 &&
                          !isProcessing &&
                          !isDeleting;

    const getInputPlaceholder = () => {
        console.log(game.gameState.valueOf());
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
            {showErrorBanner && error && (
                <ErrorBanner
                    error={error}
                    onDismiss={handleDismissError}
                    onRetry={error.recoverable ? handleRetryError : undefined}
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
                        {renderMessage(message, gameId, handleDeleteAfter)}
                    </div>
                ))}
                {isDeleting && (
                    <div className="text-center text-gray-400 text-sm py-2">
                        Deleting messages...
                    </div>
                )}
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
                    placeholder={getInputPlaceholder()}
                />
                <button 
                    type="submit" 
                    disabled={!isInputEnabled}
                    className={`${buttonTransparentStyle} ${!isInputEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    Send
                </button>
            </form>
            {showVotingModal && (
                <VotingModal
                    game={game}
                    onVote={handleVote}
                    onClose={handleCloseVotingModal}
                    isSubmitting={isVoting}
                />
            )}
        </div>
    );
}