'use client';

import React, { useState, useEffect } from 'react';
import { BOT_SELECTION_CONFIG } from '@/app/api/game-models';
import { getColor } from '@/utils/ember-colors';
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
            className="w-[440px]"
            accent="var(--ember-fire-3)"
            onClose={onClose}
        >
            <p className="console-text" style={{
                fontSize: 14, color: 'var(--ember-ink-2)',
                margin: '0 0 12px 0',
            }}>
                Select {BOT_SELECTION_CONFIG.MIN}-{BOT_SELECTION_CONFIG.MAX} bots in the order they should respond.
                <span style={{ color: 'var(--ember-fire-4)', marginLeft: 8 }}>
                    {selectedBots.length} SELECTED
                </span>
            </p>

            {/* Bot list */}
            <div style={{ maxHeight: '50vh', overflowY: 'auto', marginBottom: 14 }}>
                {aliveBots.map((bot, i) => {
                    const messageCount = dayActivityCounter[bot.name] || 0;
                    const selectionIndex = selectedBots.indexOf(bot.name);
                    const isSelected = selectionIndex !== -1;
                    const isDisabled = !isSelected && selectedBots.length >= BOT_SELECTION_CONFIG.MAX;
                    const colorIdx = (i + 1) % 16;
                    const color = getColor(colorIdx);

                    return (
                        <button
                            key={bot.name}
                            onClick={() => handleToggleBot(bot.name)}
                            disabled={isDisabled || isSubmitting}
                            data-c={colorIdx}
                            style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '7px 10px',
                                border: `1px solid ${isSelected ? color : 'var(--ember-border)'}`,
                                background: isSelected ? color : 'var(--ember-bg-2)',
                                marginBottom: 4,
                                cursor: (isDisabled || isSubmitting) ? 'not-allowed' : 'pointer',
                                opacity: isDisabled ? 0.4 : 1,
                                color: isSelected ? '#0a0a14' : 'var(--ember-ink-1)',
                                textAlign: 'left' as const,
                            }}
                        >
                            {/* Selection index */}
                            <div style={{
                                width: 20, height: 20,
                                background: isSelected ? 'var(--ember-bg-0)' : 'var(--ember-bg-3)',
                                border: `2px solid ${isSelected ? color : 'var(--ember-border)'}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0,
                            }}>
                                {isSelected && (
                                    <span className="pixel-text" style={{ fontSize: 8, color }}>
                                        {selectionIndex + 1}
                                    </span>
                                )}
                            </div>

                            {/* Color swatch */}
                            <div style={{
                                width: 12, height: 12,
                                background: color,
                                border: '1px solid var(--ember-bg-0)',
                                flexShrink: 0,
                            }} />

                            {/* Name */}
                            <span className="pixel-text" style={{ fontSize: 9, flex: 1 }}>
                                {bot.name}
                            </span>

                            {/* Message count badge */}
                            <span className="console-text" style={{
                                fontSize: 12,
                                color: isSelected ? '#0a0a14' : (messageCount === 0 ? 'var(--ember-fire-4)' : 'var(--ember-ink-3)'),
                            }}>
                                {messageCount} msg{messageCount !== 1 ? 's' : ''}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Divider */}
            <div className="hr-pixel" style={{ margin: '12px 0' }} />

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="pbtn pbtn-ghost" onClick={onClose} disabled={isSubmitting}>
                    CANCEL
                </button>
                <button
                    className="pbtn pbtn-primary"
                    disabled={!canConfirm || isSubmitting}
                    style={{ opacity: (canConfirm && !isSubmitting) ? 1 : 0.4 }}
                    onClick={handleConfirm}
                >
                    {isSubmitting
                        ? '▸ SELECTING...'
                        : `▸ SELECT ${selectedBots.length} BOT${selectedBots.length !== 1 ? 'S' : ''}`
                    }
                </button>
            </div>
        </DraggableDialog>
    );
}
