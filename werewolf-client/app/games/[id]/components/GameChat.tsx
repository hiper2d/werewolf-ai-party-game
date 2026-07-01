'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { talkToAll, humanPlayerVote, getSuggestion } from "@/app/api/bot-actions";
import { humanPlayerTalkWerewolves } from "@/app/api/night-actions";
import { GAME_STATES, MessageType, RECIPIENT_ALL, RECIPIENT_WEREWOLVES, RECIPIENT_DOCTOR, RECIPIENT_DETECTIVE, RECIPIENT_MANIAC, GameMessage, Game, GameActionResponse, SystemErrorMessage, BotResponseError, GAME_MASTER, ROLE_CONFIGS, GAME_ROLES, FREE_TIER_LIMITS } from "@/app/api/game-models";
import PlayerAvatar from "@/app/components/PlayerAvatar";
import { clearGameErrorState } from "@/app/api/game-actions";
import VotingModal from "./VotingModal";
import NightActionModal from "./NightActionModal";
import MentionDropdown from "./MentionDropdown";
import ConfirmModal from "./ConfirmModal";
import { ttsService } from "@/app/services/tts-service";
import { sttService } from "@/app/services/stt-service";
import { getDefaultVoiceProvider } from "@/app/ai/voice-config";
import { getModelDisplayName } from "@/app/ai/ai-models";
import { DISCORD_URL } from "@/app/config/external-links";
import { useUIControls } from '../context/UIControlsContext';

interface GameChatProps {
    gameId: string;
    game: Game;
    onGameStateChange?: (response: GameActionResponse) => void;
    pendingMessages?: GameMessage[];
    onPendingMessagesConsumed?: () => void;
    clearNightMessages?: boolean;
    onErrorHandled?: () => void;
    onChangeModel?: (botName: string) => void;
    isExternalLoading?: boolean;
    gameControls?: React.ReactNode;
    chatControls?: React.ReactNode;
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
    const bgColor = isWarning ? 'bg-[oklch(75%_0.10_65_/_0.08)] border-[oklch(75%_0.10_65_/_0.3)]' : 'bg-[oklch(70%_0.13_25_/_0.08)] border-[oklch(70%_0.13_25_/_0.3)]';
    const textColor = 'text-[var(--fg-0)]';
    const iconColor = isWarning ? 'text-[oklch(75%_0.10_65)]' : 'text-[var(--danger)]';

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
                        {/* Only the user-facing summary is shown; technical `error.details`
                            is intentionally not rendered — read it from the logs instead. */}
                        <div className="font-medium text-sm break-words">{truncateText(error.error)}</div>
                    </div>
                </div>
                <button
                    onClick={onDismiss}
                    className="ml-4 flex-shrink-0 p-1.5 rounded-[var(--radius-md)] bg-[var(--bg-3)] border border-[var(--line-3)] text-[var(--fg-0)] hover:bg-[var(--bg-4)] transition-all duration-[120ms]"
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

function renderMessageContent(content: string) {
    // Detect voting results and render as a formatted table
    const voteMatch = content.match(/^Voting results(?:\s*\(tie\))?:\n([\s\S]+?)\n\n(.+)$/);
    if (voteMatch) {
        const lines = voteMatch[1].split('\n').filter(l => l.trim());
        const conclusion = voteMatch[2];
        // Parse "Name: N votes" lines
        const votes = lines.map(line => {
            const m = line.match(/^(.+?):\s*(\d+)\s*vote/);
            return m ? { name: m[1].trim(), count: parseInt(m[2]) } : null;
        }).filter(Boolean) as { name: string; count: number }[];

        if (votes.length > 0) {
            const maxVotes = Math.max(...votes.map(v => v.count));
            const sorted = [...votes].sort((a, b) => b.count - a.count);
            return (
                <div className="space-y-2">
                    <div className="text-[12px] font-semibold uppercase tracking-[0.04em] text-[var(--fg-2)] mb-1">Voting Results</div>
                    <div className="space-y-1">
                        {sorted.map(({ name, count }) => {
                            const pct = maxVotes > 0 ? (count / maxVotes) * 100 : 0;
                            const isTop = count === maxVotes;
                            return (
                                <div key={name} className="flex items-center gap-2">
                                    <span className={`text-[13px] w-24 truncate ${isTop ? 'font-semibold text-[var(--fg-0)]' : 'text-[var(--fg-1)]'}`}>{name}</span>
                                    <div className="flex-1 h-[6px] rounded-full bg-[var(--bg-3)] overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all duration-300 ${isTop ? 'bg-[var(--werewolf-fg)]' : 'bg-[var(--fg-3)]'}`}
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                    <span className={`text-[12px] font-mono w-8 text-right ${isTop ? 'text-[var(--fg-0)] font-semibold' : 'text-[var(--fg-2)]'}`}>{count}</span>
                                </div>
                            );
                        })}
                    </div>
                    <div className="text-[13px] text-[var(--fg-1)] pt-1 border-t border-[var(--line-1)]">{conclusion}</div>
                </div>
            );
        }
    }

    // Default: render as text with newlines preserved
    if (content.includes('\n')) {
        return <span className="whitespace-pre-wrap">{content}</span>;
    }
    return content;
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
        <div className={`${isGameMaster ? 'py-1.5' : 'mb-2'} group`}>
            <div className="flex gap-2.5">
                <PlayerAvatar name={message.authorName} size={36} isGM={isGameMaster} className="mt-0.5" />
                <div className="flex-1 min-w-0 text-left">
            <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                    <span className={`text-[12px] font-semibold ${
                        isGameMaster ? 'text-[var(--gm-fg)]' :
                        isUserMessage ? 'text-[var(--you-fg)]' : 'text-[var(--fg-0)]'
                    }`}>
                        {message.authorName}
                    </span>
                    {message.cost !== undefined && message.cost > 0 && (
                        <span className="text-[10px] font-mono text-[var(--fg-3)] opacity-0 group-hover:opacity-100 transition-opacity duration-[120ms]">
                            ${message.cost.toFixed(4)}
                        </span>
                    )}
                </div>
                {message.id && !isVoteMessage && displayContent && displayContent.trim() && (
                    <div className="flex gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-[120ms]">
                        {/* Delete menu */}
                        {canShowResetButton && (
                            <div className="relative" ref={menuRef}>
                                <button
                                    onClick={() => setShowDeleteMenu(!showDeleteMenu)}
                                    className={`p-1 rounded-[var(--radius-sm)] hover:bg-[var(--bg-3)] transition-colors duration-[120ms] ${showDeleteMenu ? 'bg-[var(--bg-3)]' : ''} ${resetsRemaining === 0 ? 'opacity-30 cursor-not-allowed' : ''}`}
                                    title={resetsRemaining === 0 ? 'Reset limit reached for today' : 'Delete options'}
                                    disabled={resetsRemaining === 0}
                                >
                                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--fg-2)] hover:text-[var(--danger)]">
                                        <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" />
                                    </svg>
                                </button>
                                {showDeleteMenu && (
                                    <div className="absolute right-0 top-full mt-1 w-56 bg-[var(--bg-1)] border border-[var(--line-2)] rounded-[var(--radius-lg)] shadow-pop z-50 flex flex-col overflow-hidden">
                                        {resetsRemaining !== null && (
                                            <div className="px-3 py-1.5 text-[11px] text-[var(--fg-2)] border-b border-[var(--line-1)]">
                                                {resetsRemaining > 0
                                                    ? `${resetsRemaining} reset${resetsRemaining === 1 ? '' : 's'} left today`
                                                    : 'Reset limit reached for today'}
                                            </div>
                                        )}
                                        <button
                                            onClick={() => { onDeleteAfter(message.id!); setShowDeleteMenu(false); }}
                                            className="px-3 py-2 text-left text-[13px] hover:bg-[var(--bg-3)] text-[var(--danger)] flex items-center gap-2 transition-colors duration-[120ms]"
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                                                <circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>
                                            </svg>
                                            <span>Delete from here (incl.)</span>
                                        </button>
                                        <div className="h-px bg-[var(--line-1)]"></div>
                                        <button
                                            onClick={() => { onDeleteAfterExcluding(message.id!); setShowDeleteMenu(false); }}
                                            className="px-3 py-2 text-left text-[13px] hover:bg-[var(--bg-3)] text-[var(--fg-1)] flex items-center gap-2 transition-colors duration-[120ms]"
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                                                <path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>
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
                            className="p-1 rounded-[var(--radius-sm)] hover:bg-[var(--bg-3)] transition-colors duration-[120ms]"
                            disabled={loadingMessageId === message.id}
                            title={
                                loadingMessageId === message.id ? "Loading audio..." :
                                speakingMessageId === message.id ? "Pause" :
                                pausedMessageId === message.id ? "Resume" :
                                "Read message aloud"
                            }
                        >
                            {loadingMessageId === message.id ? (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--accent)] animate-spin">
                                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/>
                                </svg>
                            ) : speakingMessageId === message.id ? (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--accent)]">
                                    <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
                                </svg>
                            ) : pausedMessageId === message.id ? (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--accent)]">
                                    <polygon points="5 3,19 12,5 21,5 3"/>
                                </svg>
                            ) : (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--fg-2)] hover:text-[var(--accent)]">
                                    <polygon points="11 5,6 9,2 9,2 15,6 15,11 19"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
                                </svg>
                            )}
                        </button>
                    </div>
                )}
            </div>
            <span className={`inline-block px-3.5 py-2.5 text-[13.5px] leading-[1.55] rounded-[var(--radius-lg)] border transition-colors duration-[120ms] ${
                isGameMaster ? 'bg-[var(--gm-bg)] border-[var(--gm-border)] pl-4 border-l-[3px] border-l-[var(--gm-rail)]' :
                isVoteMessage ? 'bg-[var(--bg-2)] border-[var(--line-1)] pl-4 border-l-[3px] border-l-[var(--werewolf-fg)]' :
                isUserMessage ? 'bg-[var(--accent-soft)] border-[var(--accent-line)] pl-4 border-l-[3px] border-l-[var(--accent)]' : 'bg-[var(--bg-2)] border-[var(--line-1)] hover:border-[var(--line-2)]'
            } text-[var(--fg-0)]`}>
                {renderMessageContent(displayContent)}
            </span>
                </div>{/* end message column */}
            </div>{/* end avatar + message row */}
        </div>
    );
}

export default function GameChat({ gameId, game, onGameStateChange, pendingMessages, onPendingMessagesConsumed, clearNightMessages, onErrorHandled, onChangeModel, isExternalLoading, gameControls, chatControls, onBeforeAction, cancelButton }: GameChatProps) {
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
    const [composerExpanded, setComposerExpanded] = useState(false);
    const composerRef = useRef<HTMLFormElement>(null);
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

    // Collapse composer when input gets disabled (voting, night phase, etc.)
    useEffect(() => {
        if (!isInputEnabled()) {
            setComposerExpanded(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [game.gameState, isProcessing, isExternalLoading]);

    // Composer outside-click collapse
    useEffect(() => {
        if (!composerExpanded) return;
        const handleOutsideClick = (e: MouseEvent) => {
            if (composerRef.current && !composerRef.current.contains(e.target as Node)) {
                setComposerExpanded(false);
            }
        };
        document.addEventListener('mousedown', handleOutsideClick);
        return () => document.removeEventListener('mousedown', handleOutsideClick);
    }, [composerExpanded]);

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

            await ttsService.speakText(text, {
                voice, voiceStyle, voiceProvider, gameId,
                // Playback failures (autoplay policy, codec) fire after this await
                // resolves, so surface them through the same alert + reset path.
                onPlaybackError: (error) => {
                    alert(`Failed to play audio: ${error.message}`);
                    setLoadingMessageId(null);
                    setSpeakingMessageId(null);
                    setPausedMessageId(null);
                },
            });

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
        if (game.gameState === GAME_STATES.NIGHT_IMPRESSION) {
            return "Starting the day...";
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
            <div className="flex items-center justify-between mb-3 flex-shrink-0 px-1 max-[720px]:gap-2 max-[720px]:px-3 max-[720px]:py-[10px]">
                <div className="flex items-center gap-2 max-[720px]:flex-1 max-[720px]:min-w-0">
                    <span className="text-[10px] font-mono font-semibold uppercase tracking-[0.06em] px-2 py-1 rounded-[var(--radius-sm)] bg-[oklch(80%_0.10_85_/_0.10)] border border-[oklch(80%_0.10_85_/_0.35)] text-[oklch(82%_0.10_85)] max-[720px]:text-[9px] max-[720px]:px-1.5 max-[720px]:py-0.5 max-[720px]:tracking-[0.05em] max-[720px]:whitespace-nowrap max-[720px]:flex-shrink-0">
                        Day {game.currentDay}
                    </span>
                    <span className="text-[16px] font-semibold text-[var(--fg-0)] max-[720px]:text-[14px] max-[720px]:flex-1 max-[720px]:min-w-0 max-[720px]:truncate">
                        {headerTitle}
                    </span>
                </div>
                <div className="flex items-center gap-3 max-[720px]:gap-2 max-[720px]:flex-shrink-0">
                    {shouldShowMessageCount && (
                        <span className="msg-count text-[12px] font-mono text-[var(--fg-2)] max-[720px]:hidden">
                            {messageCountLabel}
                        </span>
                    )}
                    {availableDays.length > 1 && (
                        <div className="flex items-center gap-2" ref={daySelectorRef}>
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setShowDaySelector(prev => !prev)}
                                    className={`flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-[var(--radius-md)] border transition-all duration-[120ms] max-[720px]:text-[12px] max-[720px]:px-2 max-[720px]:py-1 max-[720px]:whitespace-nowrap ${showDaySelector ? 'border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent)]' : 'border-[var(--line-2)] bg-[var(--bg-2)] text-[var(--fg-1)] hover:border-[var(--line-3)]'}`}
                                >
                                    Day {selectedDay}
                                    <svg className={`w-3 h-3 transition-transform duration-[160ms] ${showDaySelector ? 'rotate-180' : ''}`} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3.5 5.25L7 8.75L10.5 5.25" /></svg>
                                </button>
                                {showDaySelector && (
                                    <div className="absolute right-0 top-full mt-1.5 w-40 bg-[var(--bg-1)] border border-[var(--line-2)] rounded-[var(--radius-lg)] shadow-pop z-20 max-h-60 overflow-y-auto">
                                        {availableDays.map(day => (
                                            <button
                                                key={day}
                                                type="button"
                                                onClick={() => handleDaySelect(day)}
                                                className={`block w-full px-3 py-2 text-left text-[13px] transition-colors duration-[120ms] ${day === selectedDay ? 'bg-[var(--accent-soft)] text-[var(--fg-0)]' : 'text-[var(--fg-1)] hover:bg-[var(--bg-3)]'}`}
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
                <div className="mb-3 text-xs text-[var(--fg-2)] italic">
                    Viewing Day {selectedDay} history (read-only)
                </div>
            )}
            {/* Error is shown inline at the bottom of the chat messages */}
            {/* Messages area - grows to fill space, scrolls internally */}
            <div ref={messagesContainerRef} className="flex-1 mb-3 px-3 py-2 overflow-y-auto">
                {isLoadingMessages ? (
                    <div className="text-center text-[var(--fg-2)] text-[13px] py-4">
                        Loading Day {selectedDay}...
                    </div>
                ) : messages.length === 0 ? (
                    <div className="text-center text-[var(--fg-2)] text-[13px] py-4">
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
                    <div className="text-center text-[var(--fg-2)] text-[13px] py-2">
                        Deleting messages...
                    </div>
                )}
                {(isProcessing || isExternalLoading || (game.gameState === GAME_STATES.VOTE && game.gameStateProcessQueue.length > 0 && !game.errorState) || (game.gameState === GAME_STATES.WELCOME && game.gameStateParamQueue.length > 0 && !game.errorState) || (game.gameState === GAME_STATES.NIGHT_IMPRESSION && !game.errorState)) && !isLoadingMessages && (
                    <div className="flex items-center gap-2 py-2 px-3">
                        <div className="flex gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-bounce" style={{ animationDelay: '0ms' }}></span>
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-bounce" style={{ animationDelay: '150ms' }}></span>
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-bounce" style={{ animationDelay: '300ms' }}></span>
                        </div>
                        <span className="text-[12px] italic text-[var(--fg-2)]">
                            {game.gameState === GAME_STATES.VOTE && game.gameStateProcessQueue.length > 0
                                ? `${game.gameStateProcessQueue[0]} is voting...`
                                : game.gameState === GAME_STATES.WELCOME && game.gameStateParamQueue.length > 0
                                    ? `${game.gameStateParamQueue[0]} is thinking...`
                                    : game.gameState === GAME_STATES.NIGHT_IMPRESSION
                                        ? 'Starting the day...'
                                        : game.gameStateProcessQueue.length > 0
                                            ? `${game.gameStateProcessQueue[0]} is thinking...`
                                            : 'Processing...'}
                        </span>
                    </div>
                )}
                {!isProcessing && game.errorState && !isLoadingMessages && (() => {
                    const failedBot = game.gameState === GAME_STATES.WELCOME
                        ? game.gameStateParamQueue[0]
                        : game.gameStateProcessQueue[0];
                    const who = failedBot || (game.errorState.context?.botName as string | undefined);
                    const model = game.errorState.context?.model as string | undefined;
                    return (
                        <div className="mx-2 my-2 p-3 rounded-[var(--radius-lg)] border bg-[oklch(70%_0.13_25_/_0.08)] border-[oklch(70%_0.13_25_/_0.3)]">
                            <div className="flex items-start gap-2">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 mt-0.5 text-[var(--danger)]">
                                    <circle cx="12" cy="12" r="10"/>
                                    <line x1="15" y1="9" x2="9" y2="15"/>
                                    <line x1="9" y1="9" x2="15" y2="15"/>
                                </svg>
                                <div className="flex-1 min-w-0">
                                    <div className="text-[13px] font-medium text-[var(--fg-0)] break-words">
                                        {who ? `${who}'s AI model call failed` : 'An AI model call failed'}
                                    </div>
                                    <div className="text-[12px] mt-1 text-[var(--fg-1)] break-words">
                                        {who ? `${who} couldn't generate a response` : 'The AI model couldn\'t generate a response'}
                                        {model ? ` (${getModelDisplayName(model)})` : ''}. You can retry the same model, or switch {who ? `${who}` : 'this bot'} to a different model and try again.
                                    </div>
                                    <div className="text-[12px] mt-1 text-[var(--fg-2)] break-words">
                                        Keeps happening? Let us know on{' '}
                                        <a
                                            href={DISCORD_URL}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[var(--accent)] hover:underline"
                                        >
                                            Discord
                                        </a>
                                        {' '}and we'll take a look.
                                    </div>
                                </div>
                                <div className="flex-shrink-0 flex flex-col gap-1.5">
                                    <button
                                        onClick={handleDismissError}
                                        className="px-3 py-1.5 rounded-[var(--radius-md)] bg-[var(--bg-3)] border border-[var(--line-3)] text-[var(--fg-0)] hover:bg-[var(--bg-4)] text-[12px] font-medium transition-all duration-[120ms] flex items-center justify-center gap-1.5"
                                        title="Retry the same model"
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="23 4 23 10 17 10"/>
                                            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                                        </svg>
                                        Retry
                                    </button>
                                    {who && onChangeModel && (
                                        <button
                                            onClick={() => onChangeModel(who)}
                                            className="px-3 py-1.5 rounded-[var(--radius-md)] bg-[var(--bg-2)] border border-[var(--line-2)] text-[var(--fg-1)] hover:bg-[var(--bg-3)] hover:text-[var(--fg-0)] text-[12px] font-medium transition-all duration-[120ms] flex items-center justify-center gap-1.5"
                                            title="Switch this bot to a different AI model"
                                        >
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M12 20h9"/>
                                                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
                                            </svg>
                                            Change model
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })()}
                <div ref={messagesEndRef} />
            </div>
            {showScrollToTop && (
                <button
                    type="button"
                    onClick={() => messagesContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
                    className="fixed bottom-20 right-6 w-7 h-7 flex items-center justify-center rounded-full bg-[var(--bg-1)] border border-[var(--line-2)] text-[var(--fg-2)] hover:text-[var(--fg-0)] hover:border-[var(--line-3)] shadow-subtle transition-all duration-[120ms] z-20"
                    title="Scroll to top"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="18 15 12 9 6 15"/>
                    </svg>
                </button>
            )}

            {/* Game controls bar — always visible outside the composer */}
            {gameControls && (
                <div className="flex-shrink-0 flex items-center gap-2 px-1 py-1.5">
                    {gameControls}
                </div>
            )}

            {/* Input area */}
            <form ref={composerRef} onSubmit={sendMessage} className="flex-shrink-0 z-10 pt-1">
                <div
                    className={`relative rounded-[var(--radius-lg)] bg-[var(--bg-2)] border transition-all duration-200 ${!isInputEnabled() ? 'opacity-50 border-[var(--line-2)] pointer-events-none' : composerExpanded ? 'border-[var(--accent-line)] shadow-[0_0_0_3px_var(--accent-soft)]' : 'border-[var(--line-2)] cursor-text'}`}
                    onClick={() => { if (isInputEnabled() && !composerExpanded) { setComposerExpanded(true); textareaRef.current?.focus(); } }}
                >
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
                        onFocus={() => setComposerExpanded(true)}
                        disabled={!isInputEnabled()}
                        rows={composerExpanded ? 5 : 1}
                        className={`w-full px-4 bg-transparent text-[14px] leading-[1.5] text-[var(--fg-0)] placeholder:text-[var(--fg-3)] focus:outline-none resize-none transition-all duration-200 ${
                            composerExpanded ? 'pt-3.5 pb-1.5 min-h-[140px] max-h-[280px]' : 'py-2.5 min-h-[40px] max-h-[56px]'
                        } ${!isInputEnabled() ? 'cursor-not-allowed' : ''}`}
                        placeholder={getInputPlaceholder()}
                    />
                    {cancelButton && (
                        <div className="absolute top-1 right-1">
                            {cancelButton}
                        </div>
                    )}

                {/* Toolbar row inside composer — hidden when collapsed */}
                <div className={`flex items-center justify-between px-3 overflow-hidden transition-all duration-200 ${composerExpanded ? 'max-h-[60px] opacity-100 pb-2' : 'max-h-0 opacity-0 pb-0'}`}>
                    {/* Left group: text buttons (Send + game controls) */}
                    <div className="flex items-center gap-1">
                        {/* Send button - only when input is enabled */}
                        {isInputEnabled() && (
                            <button
                                type="submit"
                                disabled={isProcessing || !newMessage.trim()}
                                className={`h-[34px] px-3.5 rounded-[var(--radius-md)] bg-[var(--accent)] text-[var(--on-accent)] text-[13px] font-medium flex items-center gap-2 transition-all duration-[120ms] hover:bg-[var(--accent-strong)] ${isProcessing || !newMessage.trim() ? 'opacity-50 cursor-not-allowed' : ''}`}
                                title={isProcessing ? "Waiting for response..." : "Send your message to all players"}
                            >
                                {isProcessing ? (
                                    <>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                                            <path d="M21 12a9 9 0 11-6.219-8.56"/>
                                        </svg>
                                        <span>Sending...</span>
                                    </>
                                ) : (
                                    <>
                                        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M1.5 1.5L12.5 7L1.5 12.5V8L8.5 7L1.5 6V1.5Z"/></svg>
                                        <span>Send</span>
                                    </>
                                )}
                            </button>
                        )}

                        {/* Chat controls (Vote, Go on) — inside composer alongside Send */}
                        {chatControls}
                    </div>

                    {/* Right group: icon buttons (Mic, Suggestion) - visible when input is enabled OR during recording/transcribing */}
                    {(isInputEnabled() || isRecording || isTranscribing) && (
                        <div className="flex items-center gap-1">
                            {/* Microphone button */}
                            <button
                                type="button"
                                onClick={handleToggleRecording}
                                disabled={!isMicrophoneEnabled() || isTranscribing}
                                className={`w-8 h-8 rounded-[var(--radius-md)] flex items-center justify-center transition-all duration-[120ms] ${
                                    isRecording
                                        ? 'bg-[oklch(70%_0.13_25_/_0.12)] border border-[oklch(70%_0.13_25_/_0.4)] text-[var(--danger)]'
                                        : 'hover:bg-[var(--bg-3)] text-[var(--fg-2)] hover:text-[var(--fg-0)]'
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
                                    className={`w-8 h-8 rounded-[var(--radius-md)] flex items-center justify-center hover:bg-[var(--bg-3)] text-[var(--fg-2)] hover:text-[var(--fg-0)] transition-all duration-[120ms] ${isGettingSuggestion ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    title={isGettingSuggestion ? "Getting suggestion..." : "Get AI suggestion for your response"}
                                >
                                    {isGettingSuggestion ? (
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                                            <path d="M21 12a9 9 0 11-6.219-8.56"/>
                                        </svg>
                                    ) : (
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M9 18h6M10 22h4M12 2a7 7 0 0 1 4 12.7V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.3A7 7 0 0 1 12 2z"/>
                                        </svg>
                                    )}
                                </button>
                            )}
                        </div>
                    )}
                </div>
                </div>{/* end composer wrapper */}
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
