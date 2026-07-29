import { DraggableNumberInput } from './DraggableNumberInput';
import { createDimensionInput } from './createDimensionInput';

/**
 * Millimetre-backed dimension input, CSS build.
 * Requires `import '@jugaaadi/advance-scroll-input/styles.css'`.
 */
export const DimensionInput = createDimensionInput(DraggableNumberInput, 'DimensionInput');

export type { DimensionInputProps } from './createDimensionInput';
