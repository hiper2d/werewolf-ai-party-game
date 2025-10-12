'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { LLM_CONSTANTS, SupportedAiModels } from '@/app/ai/ai-models';
import { getCandidateModelsForTier, getPerGameModelLimit, FREE_TIER_UNLIMITED } from '@/app/ai/model-limit-utils';
import type { UserTier } from '@/app/api/game-models';
import { buttonTransparentStyle } from '@/app/constants';

interface ModelSelectionDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (model: string, enableThinking?: boolean) => void;
    currentModel: string;
    currentThinkingMode?: boolean;
    botName: string;
    gameTier: UserTier;
    usageCounts: Record<string, number>;
}

export default function ModelSelectionDialog({
    isOpen,
    onClose,
    onSelect,
    currentModel,
    botName,
    gameTier,
    usageCounts
}: ModelSelectionDialogProps) {
    const tierFilteredModels = useMemo(() => {
        if (gameTier === 'free') {
            const models = new Set(getCandidateModelsForTier('free'));
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
                if (gameTier !== 'free') {
                    return { model, disabled: false };
                }

                if (model === LLM_CONSTANTS.RANDOM) {
                    return { model, disabled: true };
                }

                let disabled = false;

                try {
                    const limit = getPerGameModelLimit(model, 'free');
                    if (limit !== FREE_TIER_UNLIMITED) {
                        const used = usageCounts[model] ?? 0;
                        const adjustedUsage = model === currentModel ? Math.max(0, used - 1) : used;
                        disabled = adjustedUsage >= limit;
                    }
                } catch (err) {
                    // If the model is not supported for free tier usage, hide it unless it's the current assignment.
                    disabled = model !== currentModel;
                }

                return { model, disabled };
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
            <div className="bg-gray-900 border border-white border-opacity-30 rounded-lg p-6 max-w-md w-full mx-4">
                <h3 className="text-xl font-bold text-white mb-4">
                    Change AI Model for {botName}
                </h3>
                
                <div className="mb-6">
                    <label className="block text-white text-sm mb-2">Select AI Model:</label>
                    <select
                        className="w-full p-2 rounded bg-black bg-opacity-30 text-white border border-white border-opacity-30 focus:outline-none focus:border-white focus:border-opacity-50"
                        value={selectedModel}
                        onChange={(e) => setSelectedModel(e.target.value)}
                        disabled={isUpdating}
                    >
                        {modelOptions.map(({ model, disabled }) => (
                            <option key={model} value={model} disabled={disabled}>
                                {disabled && model !== currentModel ? `${model} (limit reached)` : model}
                            </option>
                        ))}
                    </select>
                </div>


                <div className="flex space-x-3 justify-end">
                    <button
                        className={`${buttonTransparentStyle} bg-gray-600 hover:bg-gray-700 border-gray-500`}
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
