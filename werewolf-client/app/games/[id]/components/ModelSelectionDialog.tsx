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
            const validModel = currentModel && availableModels.includes(currentModel) 
                ? currentModel 
                : availableModels[0];
            
            console.log('ModelSelectionDialog opening:', {
                botName,
                currentModel,
                validModel
            });
            
            setSelectedModel(validModel);
        }
    }, [isOpen, currentModel, botName]);

    const handleConfirm = async () => {
        // Only skip update if we have a valid currentModel and it matches selectedModel
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
                        {availableModels.map(model => (
                            <option key={model} value={model}>
                                {model}
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