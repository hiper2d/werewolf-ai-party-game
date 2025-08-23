'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { LLM_CONSTANTS, SupportedAiModels } from '@/app/ai/ai-models';
import { buttonTransparentStyle } from '@/app/constants';

interface ModelSelectionDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (model: string, enableThinking?: boolean) => void;
    currentModel: string;
    currentThinkingMode?: boolean;
    botName: string;
}

export default function ModelSelectionDialog({
    isOpen,
    onClose,
    onSelect,
    currentModel,
    currentThinkingMode = false,
    botName
}: ModelSelectionDialogProps) {
    const availableModels = useMemo(() => 
        Object.values(LLM_CONSTANTS).filter(model => model !== LLM_CONSTANTS.RANDOM), 
    []);
    
    // Helper function to check if a model supports thinking mode
    const supportsThinkingMode = (aiType: string): boolean => {
        const modelConfig = SupportedAiModels[aiType];
        return modelConfig?.supportsThinking === true;
    };

    const [selectedModel, setSelectedModel] = useState('');
    const [enableThinking, setEnableThinking] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);

    // Update state when dialog opens with new bot data
    useEffect(() => {
        if (isOpen) {
            const validModel = currentModel && availableModels.includes(currentModel) 
                ? currentModel 
                : availableModels[0];
            
            console.log('ModelSelectionDialog opening:', {
                botName,
                currentModel,
                currentThinkingMode,
                validModel,
                supportsThinking: supportsThinkingMode(validModel)
            });
            
            setSelectedModel(validModel);
            setEnableThinking(currentThinkingMode);
        }
    }, [isOpen, currentModel, currentThinkingMode, botName]);

    const handleConfirm = async () => {
        // Only skip update if we have a valid currentModel and it matches selectedModel and thinking mode hasn't changed
        if (currentModel && selectedModel === currentModel && enableThinking === currentThinkingMode) {
            onClose();
            return;
        }

        setIsUpdating(true);
        try {
            await onSelect(selectedModel, enableThinking);
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
                        onChange={(e) => {
                            const newModel = e.target.value;
                            setSelectedModel(newModel);
                            // Only disable thinking mode if new model doesn't support it
                            // Otherwise preserve the current checkbox state
                            if (!supportsThinkingMode(newModel)) {
                                setEnableThinking(false);
                            }
                            // If switching back to the original model, restore original thinking mode
                            else if (newModel === currentModel && supportsThinkingMode(newModel)) {
                                setEnableThinking(currentThinkingMode);
                            }
                        }}
                        disabled={isUpdating}
                    >
                        {availableModels.map(model => (
                            <option key={model} value={model}>
                                {model}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Thinking Mode Checkbox */}
                {supportsThinkingMode(selectedModel) && (
                    <div className="mb-4">
                        <label className="flex items-center">
                            <input
                                type="checkbox"
                                checked={enableThinking}
                                onChange={(e) => setEnableThinking(e.target.checked)}
                                disabled={isUpdating}
                                className="mr-2"
                            />
                            <span className="text-white text-sm">Enable thinking mode</span>
                        </label>
                    </div>
                )}

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