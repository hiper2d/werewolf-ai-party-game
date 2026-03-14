import React from 'react';
import { SupportedAiModels, MODEL_PRICING, ModelPricing } from '@/app/ai/ai-models';

type PriceDisplay = {
    base: string;
    extended?: string;
};

function getPriceDisplay(pricing: ModelPricing | undefined, type: 'input' | 'output'): PriceDisplay {
    if (!pricing) {
        return { base: '$0.00' };
    }

    const basePrice = type === 'input' ? pricing.inputPrice : pricing.outputPrice;
    if (basePrice === undefined) {
        return { base: '$0.00' };
    }

    const extendedPrice = type === 'input' ? pricing.extendedContextInputPrice : pricing.extendedContextOutputPrice;
    const threshold = pricing.extendedContextThresholdTokens;

    if (extendedPrice !== undefined && threshold !== undefined) {
        return {
            base: `$${basePrice.toFixed(2)}`,
            extended: `Extended (>${threshold.toLocaleString()} ctx tokens): $${extendedPrice.toFixed(2)}`
        };
    }

    return { base: `$${basePrice.toFixed(2)}` };
}

export default function ModelPricingTable() {
    const allModels = Object.entries(SupportedAiModels)
        .map(([modelName, config]) => {
            const pricing = MODEL_PRICING[config.modelApiName];
            const baseInputPrice = pricing?.inputPrice || 0;
            const baseOutputPrice = pricing?.outputPrice || 0;
            const inputDisplay = getPriceDisplay(pricing, 'input');
            const outputDisplay = getPriceDisplay(pricing, 'output');

            return {
                name: config.displayName,
                baseInputPrice,
                baseOutputPrice,
                inputDisplay,
                outputDisplay
            };
        })
        .filter(model => model.baseInputPrice > 0 || model.baseOutputPrice > 0);

    return (
        <div>
            <h3 className="text-xl font-bold mb-4">Model Pricing</h3>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b theme-border">
                            <th className="text-left py-2">Model</th>
                            <th className="text-right py-2">Input Cost*</th>
                            <th className="text-right py-2">Output Cost*</th>
                        </tr>
                    </thead>
                    <tbody>
                        {allModels.map((model, index) => (
                            <tr key={index} className="border-b theme-border-subtle">
                                <td className="py-2">{model.name}</td>
                                <td className="py-2 text-right">
                                    <div>{model.inputDisplay.base}</div>
                                    {model.inputDisplay.extended && (
                                        <div className="text-xs theme-text-secondary">{model.inputDisplay.extended}</div>
                                    )}
                                </td>
                                <td className="py-2 text-right">
                                    <div>{model.outputDisplay.base}</div>
                                    {model.outputDisplay.extended && (
                                        <div className="text-xs theme-text-secondary">{model.outputDisplay.extended}</div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="text-xs theme-text-secondary mt-2">* Per million tokens (extended context rates shown when available)</p>
        </div>
    );
}
