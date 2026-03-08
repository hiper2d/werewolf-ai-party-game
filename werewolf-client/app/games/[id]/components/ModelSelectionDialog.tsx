'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { LLM_CONSTANTS, SupportedAiModels, getModelDisplayName } from '@/app/ai/ai-models';
import { getCandidateModelsForTier, getPerGameModelLimit, FREE_TIER_UNLIMITED } from '@/app/ai/model-limit-utils';
import { UserTier, USER_TIERS } from '@/app/api/game-models';
import { buttonTransparentStyle } from '@/app/constants';
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
                // Ensure current assignments remain visible even if capacity is exhausted.
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
    
    // Helper function to check if a model has thinking capabilities
    const hasThinkingMode = (aiType: string): boolean => {
        const modelConfig = SupportedAiModels[aiType];
        return modelConfig?.hasThinking === true;
    };

    const [selectedModel, setSelectedModel] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);

    // Update state when dialog opens with new bot data
    useEffect(() => {
        if (isOpen) {
            const fallbackModel = selectableModels[0] ?? modelOptions[0]?.model ?? '';
            const validModel = currentModel && modelOptions.some(option => option.model === currentModel)
                ? currentModel
                : fallbackModel;

            console.log('ModelSelectionDialog opening:', {
                botName,
                currentModel,
                validModel,
                tier: gameTier,
                selectableModels,
            });

            setSelectedModel(validModel ?? '');
        }
    }, [isOpen, currentModel, botName, gameTier, modelOptions, selectableModels]);

    const handleConfirm = async () => {
        // Only skip update if we have a valid currentModel and it matches selectedModel
        if (!selectedModel) {
            onClose();
            return;
        }

        if (currentModel && selectedModel === currentModel) {
            onClose();
            return;
        }

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

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-neutral-900 border theme-border rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
                <h3 className="text-xl font-bold theme-text-primary mb-4">
                    Change AI Model for {botName}
                </h3>

                <div className="mb-6">
                    <label className="block theme-text-primary text-sm mb-2">Select AI Model:</label>
                    <ModelSelectDropdown
                        options={modelOptions}
                        value={selectedModel}
                        onChange={setSelectedModel}
                        disabled={isUpdating}
                        className="w-full"
                    />
                </div>


                <div className="flex space-x-3 justify-end">
                    <button
                        className={`${buttonTransparentStyle} bg-neutral-200 dark:bg-neutral-600 hover:bg-neutral-300 dark:hover:bg-neutral-700 border-neutral-300 dark:border-neutral-500`}
                        onClick={onClose}
                        disabled={isUpdating}
                    >
                        Cancel
                    </button>
                    <button
                        className={`${buttonTransparentStyle} ${isUpdating ? 'opacity-50 cursor-not-allowed' : ''}`}
                        onClick={handleConfirm}
                        disabled={isUpdating}
                    >
                        {isUpdating ? 'Updating...' : 'Update Model'}
                    </button>
                </div>
            </div>
        </div>
    );
}
