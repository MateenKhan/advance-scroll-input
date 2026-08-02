/**
 * @jugaaadi/advance-scroll-input — default (CSS) build.
 *
 *   import { DimensionInput, Unit } from '@jugaaadi/advance-scroll-input';
 *   import '@jugaaadi/advance-scroll-input/styles.css';
 *
 * For the Tailwind-classed build, import from
 * `@jugaaadi/advance-scroll-input/tailwind` instead.
 */

export { DraggableNumberInput, DEFAULT_MAX } from './DraggableNumberInput';
export type {
  DraggableNumberInputProps,
  ScrollComponentHandle,
  FeedbackMode,
} from './DraggableNumberInput';

export { FormulaHighlight, ValidIcon, InvalidIcon, RevertIcon } from './FormulaHighlight';
export type { FormulaHighlightProps } from './FormulaHighlight';

export { DimensionInput } from './DimensionInput';
export type { DimensionInputProps } from './createDimensionInput';

export { RollerIcon } from './RollerIcon';
export type { RollerIconProps } from './RollerIcon';

/**
 * The roller's geometry, exported so a consumer (or a headless test) can ask
 * how much room the graphic takes before laying anything out next to it.
 */
export {
  ROLLER_VIEWBOX,
  ROLLER_BODY,
  ROLLER_BODY_STROKE,
  ROLLER_ARROW,
  ROLLER_ARROW_POP,
  ROLLER_ARROW_LIFT,
  ROLLER_ARROW_HOT_STROKE,
  ROLLER_HIT,
  ROLLER_GLOW,
  rollerArrowPath,
  rollerArrowOrigin,
  rollerArrowTransform,
  rollerArrowExtent,
  rollerPaintedExtent,
  rollerFit,
  rollerArrowTapTarget,
} from './rollerGeometry';
export type { RollerBox } from './rollerGeometry';

/** Headless engine, for building your own visual shell. */
export { useScrubber, formatDisplay } from './useScrubber';
export type { UseScrubberOptions, ScrubberState } from './useScrubber';
export { createDimensionInput } from './createDimensionInput';

export type {
  ChangeSource,
  ScrubTarget,
  ScrubEventMeta,
  ScrollComponentEvents,
} from './events';

/** Expression engine — usable standalone, no React required. */
export {
  evaluateExpression,
  isFormula,
  isPlainDimension,
  builtinNames,
  FUNCTIONS,
  CONSTANTS,
  tokenize,
  meaningful,
  matchingParens,
} from './expression';
export type { EvalContext, EvalResult, Token, TokenType } from './expression';

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
