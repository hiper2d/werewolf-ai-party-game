'use client';

import React, { useEffect, useState } from 'react';
import { talkToAll, humanPlayerVote, getSuggestion } from "@/app/api/bot-actions";
import { beginNight, performNightAction, humanPlayerTalkWerewolves } from "@/app/api/night-actions";
import { buttonTransparentStyle } from "@/app/constants";
import { GAME_STATES, MessageType, RECIPIENT_ALL, GameMessage, Game, SystemErrorMessage, BotResponseError, GAME_MASTER, ROLE_CONFIGS, GAME_ROLES } from "@/app/api/game-models";
import { getPlayerColor } from "@/app/utils/color-utils";
import { convertMessageContent } from "@/app/utils/message-utils";
import { clearGameErrorState } from "@/app/api/game-actions";
import VotingModal from "./VotingModal";
import NightActionModal from "./NightActionModal";

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
    const [showNightActionModal, setShowNightActionModal] = useState(false);
    const [isPerformingNightAction, setIsPerformingNightAction] = useState(false);
    const [isMultiline, setIsMultiline] = useState(false);
    const [isGettingSuggestion, setIsGettingSuggestion] = useState(false);

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
        
        // Auto-process NIGHT queue (but skip if human player is involved or night has ended)
        if (game.gameState === GAME_STATES.NIGHT &&
            game.gameStateProcessQueue.length > 0 &&
            game.gameStateParamQueue.length > 0 &&
            !isProcessing &&
            !game.errorState) {
            
            const currentRole = game.gameStateProcessQueue[0];
            const currentPlayer = game.gameStateParamQueue[0];
            
            console.log('🔍 GAMECHAT: AUTO-PROCESS NIGHT CHECK:', {
                currentRole,
                currentPlayer,
                humanPlayerRole: game.humanPlayerRole,
                humanPlayerName: game.humanPlayerName,
                isHumanPlayerTurn: currentRole === game.humanPlayerRole && currentPlayer === game.humanPlayerName,
                gameId,
                timestamp: new Date().toISOString()
            });
            
            // Skip auto-processing if it's the human player's turn for this role
            if (currentRole === game.humanPlayerRole && currentPlayer === game.humanPlayerName) {
                console.log('🌙 GAMECHAT: SKIPPING AUTO-PROCESS - Human player turn for night action', {
                    currentRole,
                    currentPlayer,
                    humanPlayerRole: game.humanPlayerRole,
                    humanPlayerName: game.humanPlayerName
                });
                return;
            }
            
            console.log('🌙 GAMECHAT: CALLING PERFORM_NIGHT_ACTION API', {
                gameId,
                queue: game.gameStateProcessQueue,
                processQueueLength: game.gameStateProcessQueue.length,
                paramQueueLength: game.gameStateParamQueue.length
            });
            const processNightQueue = async () => {
                setIsProcessing(true);
                const updatedGame = await performNightAction(gameId);
                console.log('✅ GAMECHAT: PerformNightAction API completed');
                
                // Update parent game state
                if (onGameStateChange) {
                    console.log('🔄 GAMECHAT: UPDATING PARENT GAME STATE after night processing...');
                    onGameStateChange(updatedGame);
                }
                setIsProcessing(false);
            };
            processNightQueue();
        }
    }, [game.gameState, game.gameStateProcessQueue, game.gameStateParamQueue, game.humanPlayerRole, game.humanPlayerName, gameId, isProcessing, game.errorState, onGameStateChange]);

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

    // Check if it's human player's turn for night action
    useEffect(() => {
        console.log('🔍 NIGHT ACTION MODAL TRIGGER CHECK:', {
            gameState: game.gameState,
            processQueue: game.gameStateProcessQueue,
            paramQueue: game.gameStateParamQueue,
            humanPlayerName: game.humanPlayerName,
            humanPlayerRole: game.humanPlayerRole,
            showNightActionModal,
            isPerformingNightAction,
            timestamp: new Date().toISOString()
        });
        
        // Check conditions for showing night action modal or enabling chat
        if (game.gameState === GAME_STATES.NIGHT &&
            game.gameStateProcessQueue.length > 0 &&
            game.gameStateParamQueue.length > 0 &&
            !showNightActionModal &&
            !isPerformingNightAction) {
            
            const currentRole = game.gameStateProcessQueue[0];
            const currentPlayer = game.gameStateParamQueue[0];
            
            // Check if it's the human player's role and they're in the param queue
            if (currentRole === game.humanPlayerRole && currentPlayer === game.humanPlayerName) {
                // Check if this is the last player in the param queue (target selection needed)
                if (game.gameStateParamQueue.length === 1) {
                    console.log('🚨 OPENING NIGHT ACTION MODAL - Last in queue, target selection needed');
                    setShowNightActionModal(true);
                }
                // If multiple players in param queue, enable chat for werewolf coordination
                // This will be handled by enabling the input field below
            }
        }
    }, [game.gameState, game.gameStateProcessQueue, game.gameStateParamQueue, game.humanPlayerName, game.humanPlayerRole, showNightActionModal, isPerformingNightAction]);

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
        
        // NEW LOGIC: Check if this is werewolf coordination phase
        if (game.gameState === GAME_STATES.NIGHT &&
            game.gameStateProcessQueue.length > 0 &&
            game.gameStateParamQueue.length > 1) {
            
            const currentRole = game.gameStateProcessQueue[0];
            const currentPlayer = game.gameStateParamQueue[0];
            
            // If it's human werewolf coordination phase, use humanPlayerTalkWerewolves
            if (currentRole === game.humanPlayerRole && 
                currentPlayer === game.humanPlayerName &&
                currentRole === GAME_ROLES.WEREWOLF) {
                
                console.log('🐺 SENDING WEREWOLF COORDINATION MESSAGE:', { message: trimmed, gameId });
                const updatedGame = await humanPlayerTalkWerewolves(gameId, trimmed);
                setNewMessage('');
                
                // Update parent game state
                if (onGameStateChange) {
                    console.log('🔄 UPDATING GAME STATE after werewolf coordination...');
                    onGameStateChange(updatedGame);
                }
                setIsProcessing(false);
                return;
            }
        }
        
        // Default behavior: normal day discussion
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

    const handleNightAction = async (targetPlayer: string, message: string) => {
        console.log('🌙 HUMAN NIGHT ACTION SUBMISSION:', {
            targetPlayer,
            message,
            gameId,
            currentState: game.gameState,
            role: game.humanPlayerRole,
            timestamp: new Date().toISOString()
        });
        
        setIsPerformingNightAction(true);
        console.log('🚨 CALLING PERFORM_HUMAN_PLAYER_NIGHT_ACTION API');
        
        // We'll need to import this function
        const { performHumanPlayerNightAction } = await import("@/app/api/bot-actions");
        const updatedGame = await performHumanPlayerNightAction(gameId, targetPlayer, message);
        console.log('✅ Human night action API completed, closing modal and updating state');
        setShowNightActionModal(false);
        
        // Update game state if callback is provided
        if (onGameStateChange) {
            console.log('📊 Updating parent game state after night action');
            onGameStateChange(updatedGame);
        }
        setIsPerformingNightAction(false);
    };

    const handleCloseNightActionModal = () => {
        if (!isPerformingNightAction) {
            setShowNightActionModal(false);
        }
    };

    const handleGetSuggestion = async () => {
        if (game.gameState !== GAME_STATES.DAY_DISCUSSION) {
            return;
        }
        
        setIsGettingSuggestion(true);
        try {
            const suggestion = await getSuggestion(gameId);
            setNewMessage(suggestion);
        } catch (error) {
            console.error('Error getting suggestion:', error);
            alert('Failed to get suggestion. Please try again.');
        } finally {
            setIsGettingSuggestion(false);
        }
    };

    // Check if chat input should be enabled
    const isInputEnabled = () => {
        // Day discussion - normal chat when no queue processing
        if (game.gameState === GAME_STATES.DAY_DISCUSSION &&
            game.gameStateProcessQueue.length === 0 &&
            !isProcessing &&
            !isDeleting) {
            return true;
        }
        
        // Night phase - enable chat for human werewolf coordination
        if (game.gameState === GAME_STATES.NIGHT &&
            game.gameStateProcessQueue.length > 0 &&
            game.gameStateParamQueue.length > 1 && // Multiple players in queue means coordination phase
            !isProcessing &&
            !isDeleting) {
            
            const currentRole = game.gameStateProcessQueue[0];
            const currentPlayer = game.gameStateParamQueue[0];
            
            // Enable if it's the human player's role and they're first in param queue
            return currentRole === game.humanPlayerRole && currentPlayer === game.humanPlayerName;
        }
        
        return false;
    };

    const getInputPlaceholder = () => {
        console.log(game.gameState.valueOf());
        if (game.gameState === GAME_STATES.GAME_OVER) {
            return "Game has ended - chat disabled";
        }
        if (game.gameState === GAME_STATES.NIGHT) {
            if (game.gameStateProcessQueue.length > 0) {
                const currentRole = game.gameStateProcessQueue[0];
                const currentPlayer = game.gameStateParamQueue.length > 0 ? game.gameStateParamQueue[0] : null;
                
                // Check if it's werewolf coordination phase for human player
                if (currentRole === game.humanPlayerRole && 
                    currentPlayer === game.humanPlayerName &&
                    currentRole === GAME_ROLES.WEREWOLF &&
                    game.gameStateParamQueue.length > 1) {
                    return "Coordinate with other werewolves...";
                }
                
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
            <form onSubmit={sendMessage} className="flex flex-col">
                <div className="flex items-end">
                    {isMultiline ? (
                        <textarea
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            disabled={!isInputEnabled()}
                            rows={3}
                            className={`flex-grow p-3 rounded bg-black bg-opacity-30 text-white placeholder-gray-400 border
                                mr-3 border-gray-600 focus:outline-none focus:border-gray-500 resize-none
                                ${!isInputEnabled() ? 'opacity-50 cursor-not-allowed' : ''}`}
                            placeholder={getInputPlaceholder()}
                        />
                    ) : (
                        <input
                            type="text"
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            disabled={!isInputEnabled()}
                            className={`flex-grow p-3 rounded bg-black bg-opacity-30 text-white placeholder-gray-400 border
                                mr-3 border-gray-600 focus:outline-none focus:border-gray-500
                                ${!isInputEnabled() ? 'opacity-50 cursor-not-allowed' : ''}`}
                            placeholder={getInputPlaceholder()}
                        />
                    )}
                    <div className="flex gap-2">
                        {/* Textarea toggle button */}
                        <button
                            type="button"
                            onClick={() => setIsMultiline(!isMultiline)}
                            disabled={!isInputEnabled()}
                            className={`p-3 rounded bg-gray-600 hover:bg-gray-500 text-white transition-colors
                                ${!isInputEnabled() ? 'opacity-50 cursor-not-allowed' : ''}
                                ${isMultiline ? 'bg-blue-600 hover:bg-blue-500' : ''}`}
                            title={isMultiline ? "Switch to single line input" : "Switch to multi-line input"}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                <polyline points="14,2 14,8 20,8"/>
                                <line x1="16" y1="13" x2="8" y2="13"/>
                                <line x1="16" y1="17" x2="8" y2="17"/>
                                <polyline points="10,9 9,9 8,9"/>
                            </svg>
                        </button>
                        
                        {/* Suggestion button - only show during day discussion */}
                        {game.gameState === GAME_STATES.DAY_DISCUSSION && (
                            <button
                                type="button"
                                onClick={handleGetSuggestion}
                                disabled={!isInputEnabled() || isGettingSuggestion}
                                className={`p-3 rounded bg-purple-600 hover:bg-purple-500 text-white transition-colors
                                    ${!isInputEnabled() || isGettingSuggestion ? 'opacity-50 cursor-not-allowed' : ''}`}
                                title={isGettingSuggestion ? "Getting suggestion..." : "Get AI suggestion for your response"}
                            >
                                {isGettingSuggestion ? (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                                        <path d="M21 12a9 9 0 11-6.219-8.56"/>
                                    </svg>
                                ) : (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                                        <circle cx="12" cy="12" r="10"/>
                                        <path d="M12 17h.01"/>
                                    </svg>
                                )}
                            </button>
                        )}
                        
                        {/* Send button */}
                        <button
                            type="submit"
                            disabled={!isInputEnabled()}
                            className={`${buttonTransparentStyle} ${!isInputEnabled() ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title={!isInputEnabled() ? "Game is not ready for input" : "Send your message to all players"}
                        >
                            Send
                        </button>
                    </div>
                </div>
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
            {showNightActionModal && (
                <NightActionModal
                    isOpen={showNightActionModal}
                    game={game}
                    currentRole={game.humanPlayerRole}
                    isLastInQueue={game.gameStateParamQueue.length === 1}
                    onAction={handleNightAction}
                    onClose={handleCloseNightActionModal}
                    isSubmitting={isPerformingNightAction}
                />
            )}
        </div>
    );
}