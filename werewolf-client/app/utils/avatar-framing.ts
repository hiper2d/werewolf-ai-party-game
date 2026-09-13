/**
 * Framing geometry now lives in the library's images entry (pure, browser-safe);
 * this shim keeps the app's import path. See @hiper2d/ai-agents/images.
 */
export {
    cardInCell, defaultFraming, fitCircle, fitCard, fitFraming, isFramingShape,
    circleFocus, cardFocus, circleFocusOnSheet, focusToBackground,
} from "@hiper2d/ai-agents/images";
export type {ImageFocus, ImageSize} from "@hiper2d/ai-agents/images";
