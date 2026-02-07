'use client';

import React, { useState, useEffect } from 'react';
import { buttonTransparentStyle } from '@/app/constants';
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

    // Get alive bots (excluding human player)
    const aliveBots = bots
        .filter(bot => bot.isAlive && bot.name !== humanPlayerName)
        .sort((a, b) => {
            // Sort by message count ascending (least active first)
            const countA = dayActivityCounter[a.name] || 0;
            const countB = dayActivityCounter[b.name] || 0;
            return countA - countB;
        });

    // Reset selection when dialog opens
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
        if (selectedBots.length < BOT_SELECTION_CONFIG.MIN) {
            return;
        }

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
            <p className="text-sm theme-text-secondary mb-4">
                Select {BOT_SELECTION_CONFIG.MIN}-{BOT_SELECTION_CONFIG.MAX} bots in the order they should respond. Selected: {selectedBots.length}
            </p>

            <div className="flex-1 overflow-y-auto mb-4 max-h-[50vh]">
                <div className="space-y-2">
                    {aliveBots.map((bot) => {
                        const messageCount = dayActivityCounter[bot.name] || 0;
                        const selectionIndex = selectedBots.indexOf(bot.name);
                        const isSelected = selectionIndex !== -1;
                        const isDisabled = !isSelected && selectedBots.length >= BOT_SELECTION_CONFIG.MAX;
                        const playerColor = getPlayerColor(bot.name);

                        return (
                            <button
                                key={bot.name}
                                onClick={() => handleToggleBot(bot.name)}
                                disabled={isDisabled || isSubmitting}
                                className={`w-full p-3 rounded-lg border transition-all flex items-center justify-between ${
                                    isSelected
                                        ? 'bg-blue-100 dark:bg-blue-600/30 border-blue-400 dark:border-blue-400'
                                        : isDisabled
                                        ? 'bg-neutral-100 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 opacity-50 cursor-not-allowed'
                                        : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600 hover:border-neutral-400 dark:hover:border-neutral-400'
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <div
                                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold ${
                                            isSelected
                                                ? 'bg-blue-500 border-blue-400 text-white'
                                                : 'border-neutral-400 dark:border-neutral-500 text-neutral-400 dark:text-neutral-500'
                                        }`}
                                    >
                                        {isSelected ? selectionIndex + 1 : ''}
                                    </div>
                                    <span
                                        className="font-medium"
                                        style={{ color: playerColor }}
                                    >
                                        {bot.name}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`text-sm px-2 py-1 rounded ${
                                        messageCount === 0
                                            ? 'bg-yellow-100 dark:bg-yellow-600/30 text-yellow-700 dark:text-yellow-400'
                                            : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400'
                                    }`}>
                                        {messageCount} msg{messageCount !== 1 ? 's' : ''}
                                    </span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="flex space-x-3 justify-end pt-3 border-t border-neutral-200 dark:border-neutral-700">
                <button
                    className={`${buttonTransparentStyle} bg-neutral-200 dark:bg-neutral-600 hover:bg-neutral-300 dark:hover:bg-neutral-700 border-neutral-300 dark:border-neutral-500`}
                    onClick={onClose}
                    disabled={isSubmitting}
                >
                    Cancel
                </button>
                <button
                    className={`${buttonTransparentStyle} ${!canConfirm || isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={handleConfirm}
                    disabled={!canConfirm || isSubmitting}
                >
                    {isSubmitting ? 'Selecting...' : `Select ${selectedBots.length} Bot${selectedBots.length !== 1 ? 's' : ''}`}
                </button>
            </div>
        </DraggableDialog>
    );
}
