import { DraggableNumberInputTw } from './DraggableNumberInput.tw';
import { createDimensionInput } from './createDimensionInput';

/**
 * Millimetre-backed dimension input, Tailwind build.
 * No stylesheet import needed — requires Tailwind in the consuming app.
 */
export const DimensionInputTw = createDimensionInput(DraggableNumberInputTw, 'DimensionInputTw');

export type { DimensionInputProps } from './createDimensionInput';
