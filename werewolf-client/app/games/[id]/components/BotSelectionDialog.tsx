'use client';

import React, { useState, useEffect } from 'react';
import { BOT_SELECTION_CONFIG } from '@/app/api/game-models';
import { getPlayerColor } from '@/app/utils/color-utils';
import DraggableDialog from './DraggableDialog';
import { useUIControls } from '../context/UIControlsContext';

interface Bot {
    name: string;
    isAlive: boolean;
}

interface BotSelectionDialogProps {
    onClose: () => void;
    onConfirm: (selectedBots: string[]) => void;
    bots: Bot[];
    dayActivityCounter: Record<string, number>;
    humanPlayerName: string;
}

export default function BotSelectionDialog({
    onClose,
    onConfirm,
    bots,
    dayActivityCounter,
    humanPlayerName
}: BotSelectionDialogProps) {
    const { isModalOpen } = useUIControls();
    const isOpen = isModalOpen('botSelection');
    const [selectedBots, setSelectedBots] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const aliveBots = bots
        .filter(bot => bot.isAlive && bot.name !== humanPlayerName)
        .sort((a, b) => {
            const countA = dayActivityCounter[a.name] || 0;
            const countB = dayActivityCounter[b.name] || 0;
            return countA - countB;
        });

    useEffect(() => {
        if (isOpen) {
            setSelectedBots([]);
        }
    }, [isOpen]);

    const handleToggleBot = (botName: string) => {
        setSelectedBots(prev => {
            if (prev.includes(botName)) {
                return prev.filter(name => name !== botName);
            } else if (prev.length < BOT_SELECTION_CONFIG.MAX) {
                return [...prev, botName];
            }
            return prev;
        });
    };

    const handleConfirm = async () => {
        if (selectedBots.length < BOT_SELECTION_CONFIG.MIN) return;
        setIsSubmitting(true);
        try {
            await onConfirm(selectedBots);
            onClose();
        } catch (error) {
            console.error('Error selecting bots:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    const canConfirm = selectedBots.length >= BOT_SELECTION_CONFIG.MIN && selectedBots.length <= BOT_SELECTION_CONFIG.MAX;

    return (
        <DraggableDialog
            isOpen={isOpen}
            title="Select Bots to Respond"
            className="max-w-md w-full mx-4 max-h-[80vh] flex flex-col"
        >
            <p className="text-[13px] text-[var(--fg-2)] mb-4">
                Pick which bots respond next, in what order. Select {BOT_SELECTION_CONFIG.MIN}-{BOT_SELECTION_CONFIG.MAX} bots.
            </p>

            <div className="flex-1 overflow-y-auto mb-4 max-h-[50vh] space-y-1.5">
                {aliveBots.map((bot) => {
                    const messageCount = dayActivityCounter[bot.name] || 0;
                    const selectionIndex = selectedBots.indexOf(bot.name);
                    const isSelected = selectionIndex !== -1;
                    const isDisabled = !isSelected && selectedBots.length >= BOT_SELECTION_CONFIG.MAX;

                    return (
                        <button
                            key={bot.name}
                            onClick={() => handleToggleBot(bot.name)}
                            disabled={isDisabled || isSubmitting}
                            className={`w-full px-3 py-2.5 rounded-[var(--radius-md)] border transition-all duration-[120ms] flex items-center justify-between ${
                                isSelected
                                    ? 'bg-[var(--accent-soft)] border-[var(--accent-line)]'
                                    : isDisabled
                                        ? 'bg-[var(--bg-2)] border-[var(--line-1)] opacity-40 cursor-not-allowed'
                                        : 'bg-[var(--bg-2)] border-[var(--line-1)] hover:border-[var(--line-3)] cursor-pointer'
                            }`}
                        >
                            <div className="flex items-center gap-3">
                                {/* Order badge */}
                                <div className={`w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center text-[11px] font-bold transition-all duration-[120ms] ${
                                    isSelected
                                        ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
                                        : 'border-[var(--line-2)] text-[var(--fg-3)]'
                                }`}>
                                    {isSelected ? selectionIndex + 1 : ''}
                                </div>
                                <span
                                    className="text-[13px] font-medium"
                                    style={{ color: getPlayerColor(bot.name) }}
                                >
                                    {bot.name}
                                </span>
                            </div>
                            <span className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
                                messageCount === 0
                                    ? 'bg-[var(--tag-std-bg)] border-[var(--tag-std-border)] text-[var(--tag-std-text)]'
                                    : 'bg-[var(--bg-3)] border-[var(--line-2)] text-[var(--fg-2)]'
                            }`}>
                                {messageCount} msg{messageCount !== 1 ? 's' : ''}
                            </span>
                        </button>
                    );
                })}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-[var(--line-1)]">
                <span className="text-[11px] font-mono text-[var(--fg-2)]">
                    {selectedBots.length} selected
                </span>
                <div className="flex gap-2">
                    <button
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="px-4 py-2 text-[13px] font-medium rounded-[var(--radius-md)] bg-[var(--bg-3)] border border-[var(--line-3)] text-[var(--fg-0)] hover:bg-[var(--bg-4)] transition-all duration-[120ms]"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={!canConfirm || isSubmitting}
                        className={`px-4 py-2 text-[13px] font-medium rounded-[var(--radius-md)] bg-[var(--accent)] text-[var(--on-accent)] hover:brightness-110 transition-all duration-[120ms] ${!canConfirm || isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        {isSubmitting ? 'Starting...' : 'Start'}
                    </button>
                </div>
            </div>
        </DraggableDialog>
    );
}
