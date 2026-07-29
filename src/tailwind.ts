/**
 * @jugaaadi/advance-scroll-input — Tailwind build.
 *
 *   import { DimensionInputTw } from '@jugaaadi/advance-scroll-input/tailwind';
 *
 * No stylesheet import. Requires Tailwind in the consuming app with the
 * default `slate` / `cyan` palette, and this package included in your
 * `content` globs so the classes survive purging.
 */

export { DraggableNumberInputTw } from './DraggableNumberInput.tw';
export { DimensionInputTw } from './DimensionInput.tw';

export { DEFAULT_MAX } from './DraggableNumberInput';
export type {
  DraggableNumberInputProps,
  ScrollComponentHandle,
  FeedbackMode,
} from './DraggableNumberInput';
export type { DimensionInputProps } from './createDimensionInput';

export { FormulaHighlight, ValidIcon, InvalidIcon, RevertIcon } from './FormulaHighlight';
export {
  evaluateExpression,
  isFormula,
  isPlainDimension,
  builtinNames,
  tokenize,
  matchingParens,
} from './expression';
export type { EvalContext, EvalResult, Token, TokenType } from './expression';

export { useScrubber, formatDisplay } from './useScrubber';
export type { UseScrubberOptions, ScrubberState } from './useScrubber';

export type {
  ChangeSource,
  ScrubTarget,
  ScrubEventMeta,
  ScrollComponentEvents,
} from './events';

export {
  Unit,
  MM_PER_UNIT,
  toMm,
  fromMm,
  parseDimensionToMm,
  parseUnitFromString,
  isParsableDimension,
  formatFromMm,
} from './units';
