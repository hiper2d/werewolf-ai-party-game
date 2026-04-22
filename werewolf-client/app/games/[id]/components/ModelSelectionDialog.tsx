'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { LLM_CONSTANTS, SupportedAiModels, getModelDisplayName } from '@/app/ai/ai-models';
import { getCandidateModelsForTier, getPerGameModelLimit, FREE_TIER_UNLIMITED } from '@/app/ai/model-limit-utils';
import { UserTier, USER_TIERS } from '@/app/api/game-models';
import ModelSelectDropdown from '@/app/components/ModelSelectDropdown';
import { useUIControls } from '../context/UIControlsContext';

interface ModelSelectionDialogProps {
    onClose: () => void;
    onSelect: (model: string, enableThinking?: boolean) => void;
    currentModel: string;
    currentThinkingMode?: boolean;
    botName: string;
    gameTier: UserTier;
    usageCounts: Record<string, number>;
}

export default function ModelSelectionDialog({
    onClose,
    onSelect,
    currentModel,
    botName,
    gameTier,
    usageCounts
}: ModelSelectionDialogProps) {
    const { isModalOpen } = useUIControls();
    const isOpen = isModalOpen('modelSelection');
    const tierFilteredModels = useMemo(() => {
        if (gameTier === USER_TIERS.FREE) {
            const models = new Set(getCandidateModelsForTier(USER_TIERS.FREE));
            if (currentModel && currentModel !== '' && currentModel !== LLM_CONSTANTS.RANDOM) {
                models.add(currentModel);
            }
            return Array.from(models);
        }
        return Object.values(LLM_CONSTANTS).filter(model => model !== LLM_CONSTANTS.RANDOM);
    }, [gameTier, currentModel]);

    const modelOptions = useMemo(() => {
        return tierFilteredModels
            .map(model => {
                if (gameTier !== USER_TIERS.FREE) {
                    const name = getModelDisplayName(model);
                    return { model, disabled: false, label: name, displayLabel: name };
                }
                if (model === LLM_CONSTANTS.RANDOM) {
                    const name = getModelDisplayName(model);
                    return { model, disabled: true, label: name, displayLabel: name };
                }
                let disabled = false;
                const displayLabel = getModelDisplayName(model);
                let label = displayLabel;
                try {
                    const limit = getPerGameModelLimit(model, USER_TIERS.FREE);
                    if (limit === FREE_TIER_UNLIMITED) {
                        label = `${displayLabel} (unlimited)`;
                    } else {
                        const used = usageCounts[model] ?? 0;
                        const adjustedUsage = model === currentModel ? Math.max(0, used - 1) : used;
                        const remaining = Math.max(0, limit - adjustedUsage);
                        disabled = remaining === 0;
                        label = `${displayLabel} (${remaining} left)`;
                    }
                } catch (err) {
                    disabled = model !== currentModel;
                }
                return { model, disabled, label, displayLabel };
            })
            .filter(option => !(option.disabled && option.model !== currentModel));
    }, [tierFilteredModels, usageCounts, gameTier, currentModel]);

    const selectableModels = useMemo(() => modelOptions.filter(option => !option.disabled).map(option => option.model), [modelOptions]);

    const hasThinkingMode = (aiType: string): boolean => {
        const modelConfig = SupportedAiModels[aiType];
        return modelConfig?.hasThinking === true;
    };

    const [selectedModel, setSelectedModel] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);

    useEffect(() => {
        if (isOpen) {
            const fallbackModel = selectableModels[0] ?? modelOptions[0]?.model ?? '';
            const validModel = currentModel && modelOptions.some(option => option.model === currentModel)
                ? currentModel
                : fallbackModel;
            setSelectedModel(validModel ?? '');
        }
    }, [isOpen, currentModel, botName, gameTier, modelOptions, selectableModels]);

    const handleConfirm = async () => {
        if (!selectedModel) { onClose(); return; }
        if (currentModel && selectedModel === currentModel) { onClose(); return; }

        setIsUpdating(true);
        try {
            await onSelect(selectedModel, hasThinkingMode(selectedModel));
            onClose();
        } catch (error) {
            console.error('Error updating model:', error);
        } finally {
            setIsUpdating(false);
        }
    };

    if (!isOpen) return null;

    const accent = 'var(--ember-moon-2)';

    return (
        <div
            style={{
                position: 'fixed', inset: 0,
                background: 'rgba(5,5,10,0.78)',
                backdropFilter: 'blur(2px)',
                zIndex: 1000,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onClick={onClose}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    width: 440, maxWidth: '92vw',
                    background: 'var(--ember-bg-2)',
                    border: `2px solid ${accent}`,
                    boxShadow: `0 0 0 2px var(--ember-bg-0), 0 0 0 4px ${accent}, 8px 8px 0 rgba(0,0,0,0.6)`,
                    display: 'flex', flexDirection: 'column',
                    overflow: 'hidden',
                }}
            >
                {/* Header */}
                <div style={{
                    padding: '12px 16px',
                    background: 'var(--ember-bg-0)',
                    borderBottom: `2px solid ${accent}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                    <div className="pixel-text" style={{ fontSize: 11, color: accent, letterSpacing: 2 }}>
                        ▸ CHANGE AI MODEL
                    </div>
                    <button onClick={onClose} className="pixel-text" style={{ fontSize: 12, color: 'var(--ember-ink-2)', cursor: 'pointer', background: 'none', border: 'none' }}>
                        ✕
                    </button>
                </div>

                {/* Body */}
                <div style={{ padding: 20 }}>
                    <p className="console-text" style={{
                        fontSize: 14, color: 'var(--ember-ink-2)',
                        margin: '0 0 16px 0',
                    }}>
                        Changing model for <span style={{ color: 'var(--ember-fire-4)' }}>{botName}</span>
                    </p>

                    <div style={{ marginBottom: 20 }}>
                        <label className="pixel-text" style={{
                            display: 'block', fontSize: 9,
                            color: 'var(--ember-ink-2)', marginBottom: 6, letterSpacing: 1,
                        }}>
                            SELECT AI MODEL
                        </label>
                        <ModelSelectDropdown
                            options={modelOptions}
                            value={selectedModel}
                            onChange={setSelectedModel}
                            disabled={isUpdating}
                            className="w-full"
                        />
                    </div>

                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                        <button className="pbtn pbtn-ghost" onClick={onClose} disabled={isUpdating}>
                            CANCEL
                        </button>
                        <button
                            className="pbtn pbtn-primary"
                            disabled={isUpdating}
                            style={{ opacity: isUpdating ? 0.4 : 1 }}
                            onClick={handleConfirm}
                        >
                            {isUpdating ? '▸ UPDATING...' : '▸ UPDATE MODEL'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
