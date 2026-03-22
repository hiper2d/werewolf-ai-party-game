'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { talkToAll, humanPlayerVote, getSuggestion } from "@/app/api/bot-actions";
import { humanPlayerTalkWerewolves } from "@/app/api/night-actions";
import { buttonTransparentStyle } from "@/app/constants";
import { GAME_STATES, MessageType, RECIPIENT_ALL, RECIPIENT_WEREWOLVES, RECIPIENT_DOCTOR, RECIPIENT_DETECTIVE, RECIPIENT_MANIAC, GameMessage, Game, GameActionResponse, SystemErrorMessage, BotResponseError, GAME_MASTER, ROLE_CONFIGS, GAME_ROLES, FREE_TIER_LIMITS } from "@/app/api/game-models";
import { getPlayerColor } from "@/app/utils/color-utils";
import { clearGameErrorState } from "@/app/api/game-actions";
import VotingModal from "./VotingModal";
import NightActionModal from "./NightActionModal";
import MentionDropdown from "./MentionDropdown";
import ConfirmModal from "./ConfirmModal";
import { ttsService } from "@/app/services/tts-service";
import { sttService } from "@/app/services/stt-service";
import { getDefaultVoiceProvider } from "@/app/ai/voice-config";
import { useUIControls } from '../context/UIControlsContext';

interface GameChatProps {
    gameId: string;
    game: Game;
    onGameStateChange?: (response: GameActionResponse) => void;
    pendingMessages?: GameMessage[];
    onPendingMessagesConsumed?: () => void;
    clearNightMessages?: boolean;
    onErrorHandled?: () => void;
    isExternalLoading?: boolean;
    gameControls?: React.ReactNode;
    onBeforeAction?: () => void;
    cancelButton?: React.ReactNode;
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
}

function ErrorBanner({ error, onDismiss }: ErrorBannerProps) {
    const isWarning = error.error.toLowerCase().includes('warning');
    const bgColor = isWarning ? 'bg-yellow-900/50 border-yellow-500/30' : 'bg-red-900/50 border-red-500/30';
    const textColor = isWarning ? 'text-yellow-200' : 'text-red-200';
    const iconColor = isWarning ? 'text-yellow-400' : 'text-red-400';

    // Truncate very long error messages to prevent UI blocking
    const truncateText = (text: string, maxLength: number = 200) => {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    };

    return (
        <div className={`mb-4 p-3 rounded-lg border ${bgColor} ${textColor} max-h-32 overflow-y-auto`}>
            <div className="flex items-start justify-between">
                <div className="flex items-start space-x-2 flex-1 min-w-0">
                    <div className={`mt-0.5 flex-shrink-0 ${iconColor}`}>
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
                    <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm break-words">{truncateText(error.error)}</div>
                        {error.details && (
                            <div className="text-xs mt-1 opacity-80 break-words">{truncateText(error.details, 150)}</div>
                        )}
                    </div>
                </div>
                <button
                    onClick={onDismiss}
                    className="ml-4 flex-shrink-0 p-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                    title="Dismiss error and retry"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="23 4 23 10 17 10"/>
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                    </svg>
                </button>
            </div>
        </div>
    );
}

interface GameMessageItemProps {
    message: GameMessage;
    gameId: string;
    onDeleteAfter: (messageId: string) => void;
    onDeleteAfterExcluding: (messageId: string) => void;
    game: Game;
    onSpeak: (messageId: string, text: string) => void;
    speakingMessageId: string | null;
    loadingMessageId: string | null;
    pausedMessageId: string | null;
    resetsRemaining: number | null; // null = unlimited (api tier)
}

function GameMessageItem({ message, gameId, onDeleteAfter, onDeleteAfterExcluding, game, onSpeak, speakingMessageId, loadingMessageId, pausedMessageId, resetsRemaining }: GameMessageItemProps) {
    const [showDeleteMenu, setShowDeleteMenu] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!showDeleteMenu) return;
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setShowDeleteMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showDeleteMenu]);

    const isUserMessage = message.messageType === MessageType.HUMAN_PLAYER_MESSAGE || message.authorName === game.humanPlayerName;
    const isGameMaster = message.authorName === GAME_MASTER || message.messageType === MessageType.GM_COMMAND || message.messageType === MessageType.NIGHT_BEGINS;
    const isNightMessage = message.messageType === MessageType.NIGHT_BEGINS || 
        (message.messageType === MessageType.GM_COMMAND && 
         message.recipientName === RECIPIENT_ALL);
    const isBotMessage = message.messageType === MessageType.BOT_ANSWER && !isGameMaster && !isUserMessage;
    const isHumanDayDiscussionMessage =
        isUserMessage &&
        message.messageType === MessageType.HUMAN_PLAYER_MESSAGE &&
        message.recipientName === RECIPIENT_ALL &&
        message.day === game.currentDay &&
        (game.gameState === GAME_STATES.DAY_DISCUSSION || game.gameState === GAME_STATES.AFTER_GAME_DISCUSSION);
    const canShowResetButton = isBotMessage || isHumanDayDiscussionMessage;
    
    let displayContent: string;
    try {
        switch (message.messageType) {
            case MessageType.BOT_ANSWER:
            case MessageType.BOT_WELCOME: {
                const botAnswer: BotAnswer = message.msg as BotAnswer;
                displayContent = botAnswer.reply;
                break;
            }
            case MessageType.GAME_STORY:
            case MessageType.NIGHT_SUMMARY: {
                const gameStory = message.msg as GameStory;
                displayContent = gameStory.story;
                break;
            }
            case MessageType.VOTE_MESSAGE: {
                const voteMessage: VoteMessage = message.msg as VoteMessage;
                displayContent = `🗳️ Votes for ${voteMessage.who}: "${voteMessage.why}"`;
                break;
            }
            case MessageType.WEREWOLF_ACTION: {
                const werewolfAction = message.msg as { target: string; reasoning: string };
                displayContent = `🐺 Selected ${werewolfAction.target} for elimination. Reasoning: ${werewolfAction.reasoning}`;
                break;
            }
            case MessageType.DOCTOR_ACTION: {
                const doctorAction = message.msg as { target: string; reasoning: string };
                displayContent = `🏥 Protected ${doctorAction.target} from werewolf attacks. Reasoning: ${doctorAction.reasoning}`;
                break;
            }
            case MessageType.DETECTIVE_ACTION: {
                const detectiveAction = message.msg as { target: string; reasoning: string; result?: string };
                const resultText = detectiveAction.result ? ` ${detectiveAction.result}` : '';
                displayContent = `🔍 Investigated ${detectiveAction.target}. Reasoning: ${detectiveAction.reasoning}.${resultText}`;
                break;
            }
            case MessageType.MANIAC_ACTION: {
                const maniacAction = message.msg as { target: string; reasoning: string };
                displayContent = `🔪 Abducted ${maniacAction.target}. Reasoning: ${maniacAction.reasoning}`;
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
                if (typeof message.msg === 'string') {
                    displayContent = message.msg;
                } else if (message.msg && typeof message.msg === 'object' && 'reply' in message.msg) {
                    // Handle any BotAnswer-like objects that might fall through
                    displayContent = message.msg.reply;
                } else {
                    displayContent = 'Unknown message format';
                }
        }
    } catch (error) {
        console.error('Error rendering message:', error);
        displayContent = 'Error displaying message';
    }

    const isVoteMessage = message.messageType === MessageType.VOTE_MESSAGE;
    
    return (
        <div className={`${isGameMaster ? 'py-2' : 'mb-2'} ${isUserMessage ? 'text-right' : 'text-left'} group`}>
            <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold ${
                        isGameMaster ? (isNightMessage ? 'text-blue-600 dark:text-blue-300' : 'text-green-600 dark:text-green-400') :
                        isUserMessage ? 'theme-text-secondary' : ''
                    }`} style={!isUserMessage && !isGameMaster ? { color: getPlayerColor(message.authorName) } : undefined}>
                        {message.authorName}
                    </span>
                    {message.cost !== undefined && message.cost > 0 && (
                        <span className="text-xs theme-text-secondary bg-gray-200/60 dark:bg-neutral-800/30 px-1 py-0.5 rounded text-xs font-mono">
                            ${message.cost.toFixed(4)}
                        </span>
                    )}
                </div>
                {message.id && !isVoteMessage && displayContent && displayContent.trim() && (
                    <div className="flex gap-1">
                        {/* Delete menu */}
                        {canShowResetButton && (
                            <div className="relative" ref={menuRef}>
                                <button
                                    onClick={() => setShowDeleteMenu(!showDeleteMenu)}
                                    className={`opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-200 p-1 rounded hover:bg-gray-300/50 dark:hover:bg-gray-600/50 ${showDeleteMenu ? '!opacity-100' : ''} ${resetsRemaining === 0 ? '!opacity-30 cursor-not-allowed' : ''}`}
                                    title={resetsRemaining === 0 ? 'Reset limit reached for today' : 'Delete options'}
                                    disabled={resetsRemaining === 0}
                                >
                                    <svg
                                        width="16"
                                        height="16"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        className="theme-text-secondary hover:text-red-600 dark:hover:text-red-400"
                                    >
                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                    </svg>
                                </button>
                                {showDeleteMenu && (
                                    <div className="absolute right-0 top-full mt-1 w-64 bg-white dark:bg-neutral-800 theme-border border rounded shadow-lg z-50 flex flex-col overflow-hidden">
                                        {resetsRemaining !== null && (
                                            <div className="px-4 py-1.5 text-xs theme-text-secondary border-b border-gray-200 dark:border-neutral-700">
                                                {resetsRemaining > 0
                                                    ? `${resetsRemaining} reset${resetsRemaining === 1 ? '' : 's'} left today`
                                                    : 'Reset limit reached for today'}
                                            </div>
                                        )}
                                        <button
                                            onClick={() => { onDeleteAfter(message.id!); setShowDeleteMenu(false); }}
                                            className="px-4 py-2 text-left text-sm hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 flex items-center gap-2"
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                                                <circle cx="6" cy="6" r="3"/>
                                                <path d="M8.12 8.12 12 12"/>
                                                <path d="M20 4 8.12 15.88"/>
                                                <circle cx="6" cy="18" r="3"/>
                                                <path d="M14.8 14.8 20 20"/>
                                            </svg>
                                            <span>Delete from here (incl.)</span>
                                        </button>
                                        <div className="h-px bg-gray-200 dark:bg-neutral-700"></div>
                                        <button
                                            onClick={() => { onDeleteAfterExcluding(message.id!); setShowDeleteMenu(false); }}
                                            className="px-4 py-2 text-left text-sm hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-600 dark:text-orange-400 flex items-center gap-2"
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                                                <path d="M5 12h14"/>
                                                <path d="M12 5l7 7-7 7"/>
                                                <circle cx="9" cy="9" r="1.5"/>
                                                <circle cx="9" cy="15" r="1.5"/>
                                            </svg>
                                            <span>Delete after here (excl.)</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                        
                        {/* Speaker icon for TTS */}
                        <button
                            onClick={() => onSpeak(message.id!, displayContent)}
                            className="p-1 rounded hover:bg-gray-300/50 dark:hover:bg-gray-600/50"
                            disabled={loadingMessageId === message.id}
                            title={
                                loadingMessageId === message.id ? "Loading audio..." :
                                speakingMessageId === message.id ? "Pause" :
                                pausedMessageId === message.id ? "Resume" :
                                "Read message aloud"
                            }
                        >
                            {loadingMessageId === message.id ? (
                                // Loading spinner
                                <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    className="text-blue-600 dark:text-blue-400 animate-spin"
                                >
                                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
                                    <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/>
                                </svg>
                            ) : speakingMessageId === message.id ? (
                                // Pause icon (two vertical bars)
                                <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                                >
                                    <rect x="6" y="4" width="4" height="16"/>
                                    <rect x="14" y="4" width="4" height="16"/>
                                </svg>
                            ) : pausedMessageId === message.id ? (
                                // Play icon (triangle) for paused state
                                <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                                >
                                    <polygon points="5 3,19 12,5 21,5 3"/>
                                </svg>
                            ) : (
                                // Speaker icon (default state)
                                <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="theme-text-secondary hover:text-blue-600 dark:hover:text-blue-400"
                                >
                                    <polygon points="11 5,6 9,2 9,2 15,6 15,11 19"/>
                                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
                                </svg>
                            )}
                        </button>
                    </div>
                )}
            </div>
            <span className={`inline-block p-2 ${
                isGameMaster ? (isNightMessage ? 'rounded-lg bg-blue-100 dark:bg-blue-950/60 border border-blue-400 dark:border-blue-600/20' : 'rounded-lg bg-green-100 dark:bg-green-900/50 border border-green-500 dark:border-green-500/30') :
                isVoteMessage ? 'rounded-lg bg-orange-100 dark:bg-orange-900/50 border border-orange-500 dark:border-orange-500/30' :
                isUserMessage ? 'rounded-lg bg-slate-200 dark:bg-slate-700' : 'rounded-lg'
            } theme-text-primary`} style={!isUserMessage && !isGameMaster && !isVoteMessage ? { backgroundColor: `${getPlayerColor(message.authorName)}33` } : undefined}>
                {displayContent}
            </span>
        </div>
    );
}

export default function GameChat({ gameId, game, onGameStateChange, pendingMessages, onPendingMessagesConsumed, clearNightMessages, onErrorHandled, isExternalLoading, gameControls, onBeforeAction, cancelButton }: GameChatProps) {
    const [messages, setMessages] = useState<GameMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        message: string;
        onConfirm: () => void;
    }>({ isOpen: false, message: '', onConfirm: () => {} });
    const [isVoting, setIsVoting] = useState(false);
    const voteSubmittedRef = useRef(false);
    const [isPerformingNightAction, setIsPerformingNightAction] = useState(false);
    const { openModal, closeModal, isModalOpen, areControlsEnabled } = useUIControls();
    const showVotingModal = isModalOpen('voting');
    const showNightActionModal = isModalOpen('nightAction');
    const [isGettingSuggestion, setIsGettingSuggestion] = useState(false);
    const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
    const [loadingMessageId, setLoadingMessageId] = useState<string | null>(null);
    const [pausedMessageId, setPausedMessageId] = useState<string | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [textareaRows, setTextareaRows] = useState(2);
    const [isInputFocused, setIsInputFocused] = useState(false);
    const [selectedDay, setSelectedDay] = useState(game.currentDay);
    const [isLoadingMessages, setIsLoadingMessages] = useState(false);
    const [showDaySelector, setShowDaySelector] = useState(false);
    const daySelectorRef = useRef<HTMLDivElement | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const [showScrollToTop, setShowScrollToTop] = useState(false);
    
    // Mention state
    const [mentionState, setMentionState] = useState<{
        isOpen: boolean;
        query: string;
        matchIndex: number;
        selectedIndex: number;
    }>({
        isOpen: false,
        query: '',
        matchIndex: -1,
        selectedIndex: 0
    });

    const isCurrentDaySelected = selectedDay === game.currentDay;
    const availableDays = useMemo(
        () => Array.from({ length: game.currentDay }, (_, idx) => game.currentDay - idx),
        [game.currentDay]
    );

    const resetsRemaining = useMemo(() => {
        if (game.createdWithTier !== 'free') return null; // unlimited for api tier
        const used = game.chatResetCounts?.[game.currentDay] ?? 0;
        return Math.max(0, FREE_TIER_LIMITS.CHAT_RESETS_PER_GAME_DAY - used);
    }, [game.createdWithTier, game.chatResetCounts, game.currentDay]);

    const currentDayPublicMessageCount = useMemo(() => {
        return messages.filter(message =>
            message.day === selectedDay &&
            message.recipientName === RECIPIENT_ALL &&
            message.authorName !== GAME_MASTER
        ).length;
    }, [messages, selectedDay]);

    // Get mention candidates
    const mentionCandidates = useMemo(() => {
        if (!mentionState.isOpen) return [];
        
        const queryLower = mentionState.query.toLowerCase();
        
        // Combine bots and exclude current user
        const candidates = game.bots
            .filter(bot => bot.name !== game.humanPlayerName)
            .map(bot => ({ name: bot.name, isAlive: bot.isAlive }));
            
        // Filter by query
        return candidates.filter(c => c.name.toLowerCase().includes(queryLower));
    }, [game.bots, game.humanPlayerName, mentionState.isOpen, mentionState.query]);

    const handleMentionSelect = (name: string) => {
        const prefix = newMessage.slice(0, mentionState.matchIndex);
        const suffix = newMessage.slice(textareaRef.current?.selectionStart || newMessage.length);
        const insertedName = `${name} `;
        
        const updatedMessage = `${prefix}${insertedName}${suffix}`;
        setNewMessage(updatedMessage);
        setMentionState(prev => ({ ...prev, isOpen: false }));
        
        // Focus back on textarea
        if (textareaRef.current) {
            textareaRef.current.focus();
            // Note: Setting cursor position accurately requires useEffect or layout effect after render,
            // skipping for simplicity as adding at end of insertion is default behavior often sufficient.
        }
    };

    const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value;
        const newCursorPos = e.target.selectionStart;
        setNewMessage(newValue);

        // Find the active mention
        const textBeforeCursor = newValue.slice(0, newCursorPos);
        const lastAtIndex = textBeforeCursor.lastIndexOf('@');
        
        if (lastAtIndex !== -1) {
             const isStartOfLine = lastAtIndex === 0;
             const isPrecededBySpace = lastAtIndex > 0 && /[\s\n]/.test(newValue[lastAtIndex - 1]);
             
             if (isStartOfLine || isPrecededBySpace) {
                 const query = textBeforeCursor.slice(lastAtIndex + 1);
                 // Heuristic: if query is too long or contains newlines, probably not a mention
                 if (query.length < 30 && !query.includes('\n')) {
                     setMentionState({
                         isOpen: true,
                         query: query,
                         matchIndex: lastAtIndex,
                         selectedIndex: 0
                     });
                     return;
                 }
             }
        }
        
        setMentionState(prev => ({ ...prev, isOpen: false }));
    };

    const phaseLabel = game.gameState.toLowerCase().replace(/_/g, ' ');
    const headerTitle = `Day ${selectedDay}: ${isCurrentDaySelected ? phaseLabel : 'history'}`;
    const dayMessageCount = isCurrentDaySelected ? currentDayPublicMessageCount : messages.length;
    const shouldShowMessageCount = !isLoadingMessages;
    const messageCountLabel = `${dayMessageCount} message${dayMessageCount === 1 ? '' : 's'}`;

    const handleDaySelect = (day: number) => {
        setShowDaySelector(false);
        setSelectedDay(day);
    };

    const clearMessagesFromNight = useCallback(() => {
        setMessages(prev => {
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
    }, [game.currentDay]);

    const allowedRecipients = useMemo(() => {
        const recipients = new Set([RECIPIENT_ALL, game.humanPlayerName]);
        if (game.humanPlayerRole === GAME_ROLES.WEREWOLF) recipients.add(RECIPIENT_WEREWOLVES);
        else if (game.humanPlayerRole === GAME_ROLES.DOCTOR) recipients.add(RECIPIENT_DOCTOR);
        else if (game.humanPlayerRole === GAME_ROLES.DETECTIVE) recipients.add(RECIPIENT_DETECTIVE);
        else if (game.humanPlayerRole === GAME_ROLES.MANIAC) recipients.add(RECIPIENT_MANIAC);
        return recipients;
    }, [game.humanPlayerName, game.humanPlayerRole]);

    const addMessages = useCallback((newMsgs: GameMessage[]) => {
        if (newMsgs.length === 0) return;
        setMessages(prev => {
            const existingIds = new Set(prev.map(m => m.id));
            const uniqueNew = newMsgs.filter(m =>
                m.id && !existingIds.has(m.id) && allowedRecipients.has(m.recipientName)
            );
            if (uniqueNew.length === 0) return prev;
            return [...prev, ...uniqueNew];
        });
    }, [allowedRecipients]);

    // Consume pending messages from parent (GamePage)
    useEffect(() => {
        if (pendingMessages && pendingMessages.length > 0) {
            addMessages(pendingMessages);
            onPendingMessagesConsumed?.();
        }
    }, [pendingMessages, addMessages, onPendingMessagesConsumed]);

    useEffect(() => {
        setSelectedDay(prev => {
            if (game.currentDay > prev) {
                setShowDaySelector(false);
                return game.currentDay;
            }
            return prev;
        });
    }, [game.currentDay]);

    useEffect(() => {
        if (availableDays.length <= 1 && showDaySelector) {
            setShowDaySelector(false);
        }
    }, [availableDays.length, showDaySelector]);

    useEffect(() => {
        if (clearNightMessages && isCurrentDaySelected) {
            clearMessagesFromNight();
        }
    }, [clearNightMessages, clearMessagesFromNight, isCurrentDaySelected]);

    useEffect(() => {
        if (selectedDay < 1) {
            setMessages([]);
            setIsLoadingMessages(false);
            return;
        }

        let ignore = false;

        const loadMessagesForDay = async () => {
            setIsLoadingMessages(true);
            setMessages([]);
            try {
                const response = await fetch(`/api/games/${gameId}/messages?day=${selectedDay}`, { cache: 'no-store' });
                if (!response.ok) {
                    throw new Error(`Failed to fetch messages for day ${selectedDay}`);
                }
                const data: GameMessage[] = await response.json();
                if (!ignore) {
                    setMessages(data);
                }
            } catch (error) {
                if (!ignore) {
                    console.error('Failed to load messages for day', selectedDay, error);
                }
            } finally {
                if (!ignore) {
                    setIsLoadingMessages(false);
                }
            }
        };

        loadMessagesForDay();

        return () => {
            ignore = true;
        };
    }, [gameId, selectedDay]);

    useEffect(() => {
        if (!showDaySelector) {
            return;
        }

        const handleClickOutside = (event: MouseEvent) => {
            if (daySelectorRef.current && !daySelectorRef.current.contains(event.target as Node)) {
                setShowDaySelector(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showDaySelector]);

    // Auto-process queue when not empty
    useEffect(() => {
        console.log('🔍 AUTO-PROCESS QUEUE CHECK:', {
            gameState: game.gameState,
            processQueueLength: game.gameStateProcessQueue.length,
            paramQueueLength: game.gameStateParamQueue.length,
            processQueue: game.gameStateProcessQueue,
            paramQueue: game.gameStateParamQueue,
            isProcessing,
            hasError: !!game.errorState,
            gameId,
            timestamp: new Date().toISOString()
        });

        // Auto-process DAY_DISCUSSION and AFTER_GAME_DISCUSSION queue
        if ((game.gameState === GAME_STATES.DAY_DISCUSSION || game.gameState === GAME_STATES.AFTER_GAME_DISCUSSION) &&
            game.gameStateProcessQueue.length > 0 &&
            !isProcessing &&
            !game.errorState) {
            console.log('🚨 CALLING TALK_TO_ALL API', {
                gameId,
                gameState: game.gameState,
                queue: game.gameStateProcessQueue
            });
            const processQueue = async () => {
                setIsProcessing(true);
                const { game: updatedGame, messages: newMessages } = await talkToAll(gameId, '');
                console.log('✅ TalkToAll API completed');
                addMessages(newMessages);

                // Update parent game state to clear the queue
                if (onGameStateChange) {
                    console.log('🔄 UPDATING PARENT GAME STATE after auto-processing...');
                    onGameStateChange({ game: updatedGame, messages: [] });
                }
                setIsProcessing(false);
            };
            processQueue();
        }

        // Night processing is handled exclusively by GamePage's useEffect to avoid
        // duplicate calls. GameChat only handles human player modals for night actions.
    }, [game.gameState, game.gameStateProcessQueue, game.gameStateParamQueue, game.humanPlayerRole, game.humanPlayerName, gameId, isProcessing, game.errorState, onGameStateChange, addMessages]);

    // Check if it's human player's turn to vote
    useEffect(() => {
        // Reset the vote-submitted guard when human is no longer first in queue
        if (voteSubmittedRef.current &&
            (game.gameState !== GAME_STATES.VOTE ||
             game.gameStateProcessQueue.length === 0 ||
             game.gameStateProcessQueue[0] !== game.humanPlayerName)) {
            voteSubmittedRef.current = false;
        }

        if (game.gameState === GAME_STATES.VOTE &&
            game.gameStateProcessQueue.length > 0 &&
            game.gameStateProcessQueue[0] === game.humanPlayerName &&
            !showVotingModal &&
            !isVoting &&
            !voteSubmittedRef.current) {
            openModal('voting');
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
                    openModal('nightAction');
                }
                // If multiple players in param queue, enable chat for werewolf coordination
                // This will be handled by enabling the input field below
            }
        }
    }, [game.gameState, game.gameStateProcessQueue, game.gameStateParamQueue, game.humanPlayerName, game.humanPlayerRole, showNightActionModal, isPerformingNightAction]);

    // Auto-scroll to bottom when new messages arrive or processing starts
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isProcessing]);

    // Show/hide scroll-to-top button based on messages container scroll position
    useEffect(() => {
        const container = messagesContainerRef.current;
        if (!container) return;
        const handleScroll = () => {
            setShowScrollToTop(container.scrollTop > 300);
        };
        container.addEventListener('scroll', handleScroll);
        return () => container.removeEventListener('scroll', handleScroll);
    }, []);

    // Cleanup recording on component unmount
    useEffect(() => {
        return () => {
            if (isRecording) {
                sttService.cancelRecording();
            }
        };
    }, [isRecording]);

    const sendMessage = async (e?: React.FormEvent) => {
        e?.preventDefault();
        const trimmed = newMessage.trim();
        if (!trimmed || !isCurrentDaySelected) {
            return;
        }

        setIsProcessing(true);

        try {
            if (game.gameState === GAME_STATES.NIGHT &&
                game.gameStateProcessQueue.length > 0 &&
                game.gameStateParamQueue.length > 1) {

                const currentRole = game.gameStateProcessQueue[0];
                const currentPlayer = game.gameStateParamQueue[0];

                if (currentRole === game.humanPlayerRole &&
                    currentPlayer === game.humanPlayerName &&
                    currentRole === GAME_ROLES.WEREWOLF) {

                    console.log('🐺 SENDING WEREWOLF COORDINATION MESSAGE:', { message: trimmed, gameId });
                    const { game: updatedGame, messages: newMessages } = await humanPlayerTalkWerewolves(gameId, trimmed);
                    addMessages(newMessages);

                    if (onGameStateChange) {
                        console.log('🔄 UPDATING GAME STATE after werewolf coordination...');
                        onGameStateChange({ game: updatedGame, messages: [] });
                    }

                    if (!updatedGame.errorState) {
                        setNewMessage('');
                    }
                    return;
                }
            }

            onBeforeAction?.();
            const { game: updatedGame, messages: newMessages } = await talkToAll(gameId, trimmed);
            addMessages(newMessages);

            if (onGameStateChange) {
                console.log('🔄 UPDATING GAME STATE after human message...');
                onGameStateChange({ game: updatedGame, messages: [] });
            }

            // Only clear the input if the message was successfully processed (no error state)
            if (!updatedGame.errorState) {
                setNewMessage('');
            }
        } catch (error) {
            console.error('Error sending message:', error);
            alert('Failed to send message. Please try again.');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (mentionState.isOpen && mentionCandidates.length > 0) {
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setMentionState(prev => ({
                    ...prev,
                    selectedIndex: (prev.selectedIndex - 1 + mentionCandidates.length) % mentionCandidates.length
                }));
                return;
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setMentionState(prev => ({
                    ...prev,
                    selectedIndex: (prev.selectedIndex + 1) % mentionCandidates.length
                }));
                return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                handleMentionSelect(mentionCandidates[mentionState.selectedIndex].name);
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                setMentionState(prev => ({ ...prev, isOpen: false }));
                return;
            }
        }

        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void sendMessage();
        }
    };

    const handleDismissError = async () => {
        // Clear the persistent error state in the database
        try {
            console.log('🔄 CLEARING GAME ERROR STATE and refreshing...');
            const updatedGame = await clearGameErrorState(gameId);
            if (onGameStateChange) {
                onGameStateChange({ game: updatedGame, messages: [] });
            }
            console.log('✅ GAME ERROR STATE CLEARED and game state refreshed');
        } catch (error) {
            console.error('Error clearing game error state:', error);
        }
    };

    const handleDeleteAfter = (messageId: string) => {
        setConfirmModal({
            isOpen: true,
            message: 'Are you sure you want to delete this message and all messages after it? This action cannot be undone.',
            onConfirm: () => doDeleteAfter(messageId),
        });
    };

    const doDeleteAfter = async (messageId: string) => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
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
                if (response.status === 429) {
                    alert(errorData.error || 'Reset limit reached for today.');
                    return;
                }
                throw new Error(errorData.error || 'Failed to delete messages');
            }

            const result = await response.json();
            console.log(result.message);

            // Remove deleted messages from local state
            setMessages(prev => {
                const targetIndex = prev.findIndex(msg => msg.id === messageId);
                if (targetIndex === -1) return prev;
                return prev.slice(0, targetIndex);
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
                        onGameStateChange({ game: updatedGame, messages: [] });
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

    const handleDeleteAfterExcluding = (messageId: string) => {
        setConfirmModal({
            isOpen: true,
            message: 'Are you sure you want to delete all messages after this one (keeping this message)? This action cannot be undone.',
            onConfirm: () => doDeleteAfterExcluding(messageId),
        });
    };

    const doDeleteAfterExcluding = async (messageId: string) => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        try {
            setIsDeleting(true);
            const response = await fetch(`/api/games/${gameId}/messages/delete-after-excluding`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ messageId }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                if (response.status === 429) {
                    alert(errorData.error || 'Reset limit reached for today.');
                    return;
                }
                throw new Error(errorData.error || 'Failed to delete messages');
            }

            const result = await response.json();
            console.log(result.message);

            // Remove deleted messages from local state (keep the current message)
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
                        onGameStateChange({ game: updatedGame, messages: [] });
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
        voteSubmittedRef.current = true;
        try {
            const { game: updatedGame, messages: newMessages } = await humanPlayerVote(gameId, targetPlayer, reason);
            console.log('✅ Human vote API completed, closing modal and updating state');
            addMessages(newMessages);

            // Update game state if callback is provided
            if (onGameStateChange) {
                console.log('📊 Updating parent game state after vote');
                onGameStateChange({ game: updatedGame, messages: [] });
            }
        } catch (error) {
            console.error('❌ Human vote failed:', error);
        } finally {
            closeModal('voting');
            setIsVoting(false);
        }
    };

    const handleCloseVotingModal = () => {
        if (!isVoting) {
            closeModal('voting');
        }
    };

    const handleNightAction = async (targetPlayer: string, message: string, actionType?: 'protect' | 'kill') => {
        console.log('HUMAN NIGHT ACTION SUBMISSION:', {
            targetPlayer,
            message,
            actionType,
            gameId,
            currentState: game.gameState,
            role: game.humanPlayerRole,
            timestamp: new Date().toISOString()
        });

        setIsPerformingNightAction(true);
        try {
            const { performHumanPlayerNightAction } = await import("@/app/api/bot-actions");
            const { game: updatedGame, messages: newMessages } = await performHumanPlayerNightAction(gameId, targetPlayer, message, actionType);
            console.log('Human night action API completed, closing modal and updating state');
            addMessages(newMessages);

            // Update game state if callback is provided
            if (onGameStateChange) {
                onGameStateChange({ game: updatedGame, messages: [] });
            }
        } catch (error) {
            console.error('Night action failed:', error);
        } finally {
            closeModal('nightAction');
            setIsPerformingNightAction(false);
        }
    };

    const handleCloseNightActionModal = () => {
        if (!isPerformingNightAction) {
            closeModal('nightAction');
        }
    };

    const handleSpeak = async (messageId: string, text: string) => {
        try {
            // If clicking on currently playing message, pause it
            if (speakingMessageId === messageId) {
                ttsService.pauseSpeaking();
                setSpeakingMessageId(null);
                setPausedMessageId(messageId);
                return;
            }

            // If clicking on paused message, resume it
            if (pausedMessageId === messageId) {
                ttsService.resumeSpeaking();
                setPausedMessageId(null);
                setSpeakingMessageId(messageId);
                return;
            }

            // Stop any currently playing or paused audio before starting new one
            if (speakingMessageId || pausedMessageId) {
                ttsService.stopSpeaking();
                setSpeakingMessageId(null);
                setPausedMessageId(null);
            }

            // Get voice provider from game (with fallback to default)
            const voiceProvider = game.voiceProvider || getDefaultVoiceProvider();

            // Find the message to get the author name
            const message = messages.find(msg => msg.id === messageId);

            // Map author to their assigned voice and style
            let voice = 'alloy'; // default fallback
            let voiceStyle: string | undefined;

            if (!message) {
                console.error('Message not found for voice mapping:', messageId);
                voice = game.gameMasterVoice || 'alloy';
            } else if (message.authorName === GAME_MASTER) {
                // Use Game Master voice
                voice = game.gameMasterVoice || 'alloy';
                voiceStyle = game.gameMasterVoiceStyle;
            } else {
                // Find the bot with matching name
                const bot = game.bots.find(b => b.name === message.authorName);
                if (bot) {
                    voice = bot.voice || 'alloy';
                    voiceStyle = bot.voiceStyle;
                }
                // If no bot found (human player), use default voice
            }

            // Show loading state
            setLoadingMessageId(messageId);

            await ttsService.speakText(text, { voice, voiceStyle, voiceProvider, gameId });

            // Audio started playing
            setLoadingMessageId(null);
            setSpeakingMessageId(messageId);

            // Listen for when audio ends
            const checkAudioEnd = setInterval(() => {
                if (!ttsService.hasActiveAudio()) {
                    clearInterval(checkAudioEnd);
                    setSpeakingMessageId(prev => prev === messageId ? null : prev);
                    setPausedMessageId(prev => prev === messageId ? null : prev);
                }
            }, 100);

        } catch (error) {
            console.error('TTS Error:', error);
            alert(`Failed to play audio: ${error instanceof Error ? error.message : 'Unknown error'}`);
            setLoadingMessageId(null);
            setSpeakingMessageId(null);
            setPausedMessageId(null);
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

    const handleStartRecording = async () => {
        if (isRecording) {
            return;
        }
        
        try {
            setIsRecording(true);
            await sttService.startRecording();
        } catch (error) {
            console.error('Error starting recording:', error);
            alert('Failed to start recording. Please check microphone permissions.');
            setIsRecording(false);
        }
    };

    const handleStopRecording = async () => {
        if (!isRecording) {
            return;
        }
        
        try {
            // Set transcribing first, but keep recording state until we actually stop
            setIsTranscribing(true);
            
            const audioBlob = await sttService.stopRecording();
            
            // Only now set recording to false after we've actually stopped
            setIsRecording(false);
            
            const transcription = await sttService.transcribeRecording(audioBlob, { gameId });
            
            // Add transcribed text to current message
            setNewMessage(prev => {
                const separator = prev.trim() ? ' ' : '';
                return prev + separator + transcription;
            });
        } catch (error) {
            console.error('Error stopping recording:', error);
            alert(`Failed to transcribe audio: ${error instanceof Error ? error.message : 'Unknown error'}`);
            // Make sure to reset recording state on error
            setIsRecording(false);
        } finally {
            setIsTranscribing(false);
        }
    };

    const handleToggleRecording = async () => {
        // Don't allow new recording during transcription
        if (isTranscribing) {
            return;
        }
        
        if (isRecording) {
            await handleStopRecording();
        } else {
            await handleStartRecording();
        }
    };

    // Check if chat input should be enabled
    const isInputEnabled = () => {
        // Disable when any modal is open
        if (!areControlsEnabled) {
            return false;
        }
        if (!isCurrentDaySelected) {
            return false;
        }
        // Disable input during recording or transcription
        if (isRecording || isTranscribing) {
            return false;
        }
        // Disable when an external action (e.g. Keep Going) is loading
        if (isExternalLoading) {
            return false;
        }

        // After game discussion - allow chat at all times
        if (game.gameState === GAME_STATES.AFTER_GAME_DISCUSSION &&
            !isProcessing &&
            !isDeleting) {
            return true;
        }

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

    // Check if microphone should be enabled (separate from text input)
    const isMicrophoneEnabled = () => {
        // Disable when any modal is open
        if (!areControlsEnabled) {
            return false;
        }
        if (!isCurrentDaySelected) {
            return false;
        }
        // Disable during game over (but allow during after-game discussion)
        if (game.gameState === GAME_STATES.GAME_OVER) {
            return false;
        }

        // Disable during any active requests (voting, processing, deleting, etc.)
        if (isProcessing || isDeleting || isVoting || isPerformingNightAction || isGettingSuggestion) {
            return false;
        }

        // Allow microphone during day discussion, after-game discussion, voting, night phases, etc.
        return true;
    };

    const getInputPlaceholder = () => {
        if (!isCurrentDaySelected) {
            return `Viewing Day ${selectedDay} history`;
        }
        // Voice recording states take priority
        if (isRecording) {
            return "🎤 Recording in progress... Click mic to stop";
        }
        if (isTranscribing) {
            return "✨ Transcribing audio, please wait...";
        }

        if (game.gameState === GAME_STATES.AFTER_GAME_DISCUSSION) {
            if (isProcessing || game.gameStateProcessQueue.length > 0) {
                const currentBot = game.gameStateProcessQueue[0];
                return `Waiting for ${currentBot || 'bots'} to respond...`;
            }
            return "Share your thoughts about the game...";
        }
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
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
                <div className="flex items-center gap-2">
                    <span className="text-xl font-bold theme-text-primary">
                        {headerTitle}
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    {shouldShowMessageCount && (
                        <span className="text-xs theme-text-secondary">
                            {messageCountLabel}
                        </span>
                    )}
                    {availableDays.length > 1 && (
                        <div className="flex items-center gap-2" ref={daySelectorRef}>
                            <span className="text-sm theme-text-secondary hidden sm:inline">History:</span>
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setShowDaySelector(prev => !prev)}
                                    className={`flex items-center gap-1 text-sm px-3 py-1 rounded theme-border border theme-bg-card hover:opacity-90 transition-colors ${showDaySelector ? 'text-blue-600 dark:text-blue-300' : 'theme-text-primary'}`}
                                >
                                    Day {selectedDay}
                                    <span className="text-xs">{showDaySelector ? '▲' : '▼'}</span>
                                </button>
                                {showDaySelector && (
                                    <div className="absolute right-0 top-full mt-2 w-40 rounded theme-border border bg-white dark:bg-neutral-800 shadow-lg z-20 max-h-60 overflow-y-auto">
                                        {availableDays.map(day => (
                                            <button
                                                key={day}
                                                type="button"
                                                onClick={() => handleDaySelect(day)}
                                                className={`block w-full px-3 py-2 text-left text-sm hover:bg-gray-200 dark:hover:bg-white/10 ${day === selectedDay ? 'bg-gray-200 dark:bg-white/10' : ''}`}
                                            >
                                                Day {day}{day === game.currentDay ? ' (current)' : ''}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
            {!isCurrentDaySelected && (
                <div className="mb-3 text-xs theme-text-secondary italic">
                    Viewing Day {selectedDay} history (read-only)
                </div>
            )}
            {/* Error is shown inline at the bottom of the chat messages */}
            {/* Messages area - grows to fill space, scrolls internally */}
            <div ref={messagesContainerRef} className="flex-1 mb-4 p-2 theme-bg-card theme-border border rounded overflow-y-auto">
                {isLoadingMessages ? (
                    <div className="text-center theme-text-secondary text-sm py-4">
                        Loading Day {selectedDay}...
                    </div>
                ) : messages.length === 0 ? (
                    <div className="text-center theme-text-secondary text-sm py-4">
                        No messages for Day {selectedDay} yet.
                    </div>
                ) : (
                    messages.map((message, index) => {
                        const fallbackKey = message.timestamp ? `ts-${message.timestamp}-${index}` : `idx-${index}`;
                        const key = message.id ?? fallbackKey;
                        return (
                            <GameMessageItem
                                key={key}
                                message={message}
                                gameId={gameId}
                                onDeleteAfter={handleDeleteAfter}
                                onDeleteAfterExcluding={handleDeleteAfterExcluding}
                                game={game}
                                onSpeak={handleSpeak}
                                speakingMessageId={speakingMessageId}
                                loadingMessageId={loadingMessageId}
                                pausedMessageId={pausedMessageId}
                                resetsRemaining={resetsRemaining}
                            />
                        );
                    })
                )}
                {isDeleting && !isLoadingMessages && (
                    <div className="text-center text-gray-400 text-sm py-2">
                        Deleting messages...
                    </div>
                )}
                {(isProcessing || isExternalLoading || (game.gameState === GAME_STATES.VOTE && game.gameStateProcessQueue.length > 0 && !game.errorState) || (game.gameState === GAME_STATES.WELCOME && game.gameStateParamQueue.length > 0 && !game.errorState)) && !isLoadingMessages && (
                    <div className="flex items-center gap-2 py-2 px-3">
                        <div className="flex gap-1">
                            <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0ms' }}></span>
                            <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '150ms' }}></span>
                            <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '300ms' }}></span>
                        </div>
                        <span className="text-xs theme-text-secondary">
                            {game.gameState === GAME_STATES.VOTE && game.gameStateProcessQueue.length > 0
                                ? `${game.gameStateProcessQueue[0]} is voting...`
                                : game.gameState === GAME_STATES.WELCOME && game.gameStateParamQueue.length > 0
                                    ? `${game.gameStateParamQueue[0]} is thinking...`
                                    : game.gameStateProcessQueue.length > 0
                                        ? `${game.gameStateProcessQueue[0]} is thinking...`
                                        : 'Processing...'}
                        </span>
                    </div>
                )}
                {!isProcessing && game.errorState && !isLoadingMessages && (
                    <div className="mx-2 my-2 p-3 rounded-lg border bg-red-900/50 border-red-500/30 text-red-200">
                        <div className="flex items-start gap-2">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 mt-0.5 text-red-400">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="15" y1="9" x2="9" y2="15"/>
                                <line x1="9" y1="9" x2="15" y2="15"/>
                            </svg>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium break-words">
                                    {(() => {
                                        const failedBot = game.gameState === GAME_STATES.WELCOME
                                            ? game.gameStateParamQueue[0]
                                            : game.gameStateProcessQueue[0];
                                        return failedBot ? `${failedBot} failed to respond` : 'An error occurred';
                                    })()}
                                </div>
                                {game.errorState.details && (
                                    <div className="text-xs mt-1 opacity-80 break-words">
                                        {game.errorState.details.length > 150 ? game.errorState.details.substring(0, 150) + '...' : game.errorState.details}
                                    </div>
                                )}
                                <div className="text-xs mt-1.5 opacity-60">
                                    If this keeps happening, try changing the AI model for this bot in the game settings.
                                </div>
                            </div>
                            <button
                                onClick={handleDismissError}
                                className="flex-shrink-0 px-3 py-1.5 rounded text-btn-text-transparent bg-btn-transparent border border-card-border hover:bg-btn-transparent-hover text-xs font-medium transition-colors flex items-center gap-1.5"
                                title="Dismiss error and retry"
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="23 4 23 10 17 10"/>
                                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                                </svg>
                                Retry
                            </button>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>
            {showScrollToTop && (
                <button
                    type="button"
                    onClick={() => messagesContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
                    className="fixed bottom-20 right-6 w-7 h-7 flex items-center justify-center rounded-full theme-bg-card theme-border border theme-text-secondary hover:opacity-80 shadow transition-colors z-20"
                    title="Scroll to top"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="18 15 12 9 6 15"/>
                    </svg>
                </button>
            )}

            {/* Input area */}
            <form onSubmit={sendMessage} className="flex-shrink-0 z-10 mt-auto bg-[rgb(var(--color-page-bg-start))] pt-1">
                <div className="relative">
                    {isInputEnabled() && (
                        <MentionDropdown
                            candidates={mentionCandidates}
                            selectedIndex={mentionState.selectedIndex}
                            onSelect={handleMentionSelect}
                            onClose={() => setMentionState(prev => ({ ...prev, isOpen: false }))}
                        />
                    )}
                    <textarea
                        ref={textareaRef}
                        value={newMessage}
                        onChange={handleTextareaChange}
                        onKeyDown={handleTextareaKeyDown}
                        onFocus={() => setIsInputFocused(true)}
                        onBlur={() => {
                            // Delay to allow button clicks to register before hiding toolbar
                            setTimeout(() => setIsInputFocused(false), 150);
                        }}
                        disabled={!isInputEnabled()}
                        rows={textareaRows}
                        className={`w-full p-3 rounded bg-input border border-input-border text-input-text placeholder-input-placeholder focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none ${!isInputEnabled() ? 'opacity-50 cursor-not-allowed' : ''}`}
                        placeholder={getInputPlaceholder()}
                    />
                    {cancelButton && (
                        <div className="absolute top-1 right-1">
                            {cancelButton}
                        </div>
                    )}
                </div>

                {/* Toolbar row: text buttons left, icon buttons right */}
                <div className={`flex items-center justify-between mt-1 ${isInputEnabled() ? (isInputFocused ? 'flex' : 'hidden lg:flex') : 'flex'}`}>
                    {/* Left group: text buttons (Send + game controls) */}
                    <div className="flex items-center gap-1">
                        {/* Send button - only when input is enabled */}
                        {isInputEnabled() && (
                            <button
                                type="submit"
                                disabled={isProcessing}
                                className={`h-10 px-4 ${buttonTransparentStyle} ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                                title={isProcessing ? "Waiting for response..." : "Send your message to all players"}
                            >
                                {isProcessing ? (
                                    <div className="flex items-center gap-2">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                                            <path d="M21 12a9 9 0 11-6.219-8.56"/>
                                        </svg>
                                        <span className="text-sm">Sending...</span>
                                    </div>
                                ) : <span className="text-sm">Send</span>}
                            </button>
                        )}

                        {/* Game controls (Vote, Keep Going, etc.) */}
                        {gameControls}
                    </div>

                    {/* Right group: icon buttons (Mic, Suggestion, Expand) - visible when input is enabled OR during recording/transcribing */}
                    {(isInputEnabled() || isRecording || isTranscribing) && (
                        <div className="flex items-center gap-1">
                            {/* Microphone button */}
                            <button
                                type="button"
                                onClick={handleToggleRecording}
                                disabled={!isMicrophoneEnabled() || isTranscribing}
                                className={`h-10 w-10 !p-0 flex items-center justify-center transition-colors ${
                                    isRecording
                                        ? `${buttonTransparentStyle} border-red-500 bg-red-500/10 hover:bg-red-500/20 text-red-500`
                                        : buttonTransparentStyle
                                } ${!isMicrophoneEnabled() || isTranscribing ? 'opacity-50 cursor-not-allowed' : ''}`}
                                title={
                                    isTranscribing
                                        ? "Transcribing audio..."
                                        : isRecording
                                            ? "Stop recording"
                                            : "Start voice recording"
                                }
                            >
                                {isTranscribing ? (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                                        <path d="M21 12a9 9 0 11-6.219-8.56"/>
                                    </svg>
                                ) : isRecording ? (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="animate-pulse">
                                        <rect x="4" y="4" width="16" height="16" rx="2"/>
                                    </svg>
                                ) : (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                                        <line x1="12" y1="19" x2="12" y2="23"/>
                                        <line x1="8" y1="23" x2="16" y2="23"/>
                                    </svg>
                                )}
                            </button>

                            {/* AI Suggestion button */}
                            {game.gameState === GAME_STATES.DAY_DISCUSSION && (
                                <button
                                    type="button"
                                    onClick={handleGetSuggestion}
                                    disabled={isGettingSuggestion}
                                    className={`h-10 w-10 !p-0 flex items-center justify-center ${buttonTransparentStyle} ${isGettingSuggestion ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    title={isGettingSuggestion ? "Getting suggestion..." : "Get AI suggestion for your response"}
                                >
                                    {isGettingSuggestion ? (
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                                            <path d="M21 12a9 9 0 11-6.219-8.56"/>
                                        </svg>
                                    ) : (
                                        <span className="text-sm">💡</span>
                                    )}
                                </button>
                            )}

                            {/* Expand/Shrink button */}
                            <button
                                type="button"
                                onClick={() => setTextareaRows(prev => prev === 2 ? 10 : 2)}
                                className={`h-10 w-10 !p-0 flex items-center justify-center ${buttonTransparentStyle}`}
                                title="Expand/shrink text area"
                            >
                                <span className="text-sm">
                                    {textareaRows === 2 ? '⬆️' : '⬇️'}
                                </span>
                            </button>
                        </div>
                    )}
                </div>
            </form>
            <VotingModal
                game={game}
                onVote={handleVote}
                onClose={handleCloseVotingModal}
                isSubmitting={isVoting}
            />
            <NightActionModal
                game={game}
                currentRole={game.humanPlayerRole}
                isLastInQueue={game.gameStateParamQueue.length === 1}
                onAction={handleNightAction}
                onClose={handleCloseNightActionModal}
                isSubmitting={isPerformingNightAction}
            />
            <ConfirmModal
                isOpen={confirmModal.isOpen}
                title="Confirm Deletion"
                message={confirmModal.message}
                onConfirm={confirmModal.onConfirm}
                onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
            />
        </div>
    );
}
