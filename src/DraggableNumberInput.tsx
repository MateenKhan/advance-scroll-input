import * as React from 'react';
import { forwardRef, useCallback, useImperativeHandle, useState } from 'react';
import { RollerIcon } from './RollerIcon';
import { FormulaHighlight, InvalidIcon, RevertIcon, ValidIcon } from './FormulaHighlight';
import { useScrubber, type UseScrubberOptions } from './useScrubber';
import { useResizePin } from './useResizePin';
import type { ScrollComponentEvents } from './events';
import { builtinNames } from './expression';

export interface ScrollComponentHandle {
  focus: () => void;
  blur: () => void;
  select: () => void;
  stepUp: () => number;
  stepDown: () => number;
  /** Roll a rejected entry back to the last good value. */
  revert: () => number;
  /** The underlying `<input>`, for anything the handle doesn't cover. */
  input: HTMLInputElement | null;
}

/** How validity is surfaced while editing. */
export type FeedbackMode = 'both' | 'icon' | 'border' | 'none';

export interface DraggableNumberInputProps extends ScrollComponentEvents {
  value: number | string | '';
  onChange: (e: { target: { value: string } }) => void;
  step?: number;
  min?: number;
  /** Upper bound. Defaults to 9,999,999 — a CAD-friendly cap. */
  max?: number;
  /**
   * Permit values below zero. Default `false` — positive-only, floored at 0
   * however the value arrives. A negative `min` is ignored unless this is set.
   */
  allowNegative?: boolean;
  /** Reject non-integer results. */
  integerOnly?: boolean;
  /** Extra validation. Return `true` to accept, or a message to reject. */
  validate?: (value: number) => true | string;
  /** Pixels of drag per one `step`. Lower = more sensitive. Default 6. */
  pixelsPerTick?: number;
  /** Suffix shown after the number when the field is idle. */
  unit?: string;
  disabled?: boolean;
  readOnly?: boolean;

  /** Accept arithmetic formulas, not just numbers. Default `true`. */
  formula?: boolean;
  /** Scalar variables usable in formulas, e.g. `{ qty: 3 }`. */
  variables?: Record<string, number>;
  /** How live validity is shown while editing. Default `'both'`. */
  feedback?: FeedbackMode;
  /** Show the revert button after a rejected entry. Default `true`. */
  showRevert?: boolean;
  /** Colour the formula as you type. Default `true`. */
  highlight?: boolean;
  /** Select all on focus instead of placing the caret at the end. */
  selectOnFocus?: boolean;
  /** Let the user drag-resize the field. Default `false` (fixed). */
  resizable?: boolean | 'horizontal' | 'vertical' | 'both';

  /** Hide the roller entirely and keep only the typed input. */
  hideRoller?: boolean;
  /** Show the tap-to-step arrows above and below the roller. Default true. */
  showArrows?: boolean;
  /** Let the mouse wheel change the value while hovered. Default false. */
  enableWheel?: boolean;
  /** Let ArrowUp/ArrowDown change the value while focused. Default true. */
  enableKeyboardStep?: boolean;
  format?: UseScrubberOptions['format'];
  resolveText?: UseScrubberOptions['resolveText'];
  inspectText?: UseScrubberOptions['inspectText'];
  parseValue?: UseScrubberOptions['parseValue'];
  /** Names the highlighter should treat as resolvable. */
  knownNames?: string[];

  className?: string;
  style?: React.CSSProperties;
  inputClassName?: string;
  inputStyle?: React.CSSProperties;
  rollerClassName?: string;

  id?: string;
  name?: string;
  placeholder?: string;
  title?: string;
  tabIndex?: number;
  autoFocus?: boolean;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'data-testid'?: string;
  'data-feature-id'?: string;
  /** Escape hatch for any native attribute not surfaced above. */
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
}

/** CAD-friendly ceiling, applied unless the caller overrides `max`. */
export const DEFAULT_MAX = 9_999_999;

/**
 * A number input with a vertical roller scrubber and a formula editor.
 *
 * Drag up or down anywhere on the field to scrub, tap an arrow to step, or
 * click to type — plain numbers, dimensions (`10ft`, `5' 6"`), or full
 * expressions (`(190*120)/144`, `100 * length`). Validity is shown live while
 * you type; a rejected entry stays on screen with a revert button.
 *
 * Styled by `scroll-component.css` — import it once in your app.
 */
export const DraggableNumberInput = forwardRef<ScrollComponentHandle, DraggableNumberInputProps>(
  function DraggableNumberInput(props, ref) {
    const {
      hideRoller = false,
      showArrows = true,
      pixelsPerTick = 6,
      max = DEFAULT_MAX,
      feedback = 'both',
      showRevert = true,
      highlight = true,
      resizable = false,
      variables,
      knownNames,
      className,
      style,
      inputClassName,
      inputStyle,
      rollerClassName,
      id,
      name,
      placeholder,
      title,
      tabIndex,
      autoFocus,
      inputProps,
      disabled = false,
      ...rest
    } = props;

    const { state, inputRef, getInputProps, getRollerProps, getArrowProps, actions } = useScrubber({
      ...rest,
      max,
      disabled,
      pixelsPerTick,
    });

    useImperativeHandle(ref, () => ({ ...actions, input: inputRef.current }), [actions, inputRef]);

    // Caret and scroll position drive paren matching and overlay alignment.
    const [caret, setCaret] = useState<number | null>(null);
    const [scrollLeft, setScrollLeft] = useState(0);

    const syncCaret = useCallback(() => {
      const el = inputRef.current;
      if (!el) return;
      setCaret(el.selectionStart);
      setScrollLeft(el.scrollLeft);
    }, [inputRef]);

    const resolvableNames = React.useMemo(() => {
      const s = new Set(builtinNames());
      for (const k of Object.keys(variables ?? {})) s.add(k);
      for (const k of knownNames ?? []) s.add(k);
      return s;
    }, [variables, knownNames]);

    const showOverlay = highlight && state.isFocused && state.isFormulaDraft;
    const invalid =
      state.committedError !== null || (state.isFocused && state.isValidDraft === false);
    const valid = state.isFocused && state.isValidDraft === true;
    const borderFeedback = feedback === 'both' || feedback === 'border';
    const iconFeedback = feedback === 'both' || feedback === 'icon';

    const rootClasses = [
      'sc-root',
      state.isDragging && 'sc-root--dragging',
      state.isFocused && 'sc-root--focused',
      disabled && 'sc-root--disabled',
      borderFeedback && invalid && 'sc-root--invalid',
      borderFeedback && valid && 'sc-root--valid',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    const inputClasses = [
      'sc-input',
      state.isDragging && 'sc-input--dragging',
      showOverlay && 'sc-input--transparent',
      inputClassName,
    ]
      .filter(Boolean)
      .join(' ');

    const resizeValue =
      resizable === true ? 'horizontal' : resizable === false ? undefined : resizable;

    const fieldRef = React.useRef<HTMLDivElement>(null);
    useResizePin(fieldRef, resizeValue);

    const injected = getInputProps();

    return (
      <div className={rootClasses} style={style} data-feature-id={props['data-feature-id']}>
        <div
          ref={fieldRef}
          className={[
            'sc-field',
            resizeValue && 'sc-field--resizable',
            resizeValue && resizeValue !== 'horizontal' && 'sc-field--resize-y',
          ]
            .filter(Boolean)
            .join(' ')}
          style={resizeValue ? { resize: resizeValue } : undefined}
        >
          {showOverlay && (
            <FormulaHighlight
              text={state.localText}
              caret={caret}
              knownNames={resolvableNames}
              scrollLeft={scrollLeft}
            />
          )}

          <input
            {...inputProps}
            {...injected}
            onSelect={(e) => {
              syncCaret();
              injected.onSelect?.(e);
            }}
            onKeyUp={(e) => {
              syncCaret();
              injected.onKeyUp?.(e);
            }}
            onScroll={() => setScrollLeft(inputRef.current?.scrollLeft ?? 0)}
            id={id}
            name={name}
            placeholder={placeholder}
            title={state.draftError ?? state.committedError ?? title}
            tabIndex={tabIndex}
            autoFocus={autoFocus}
            aria-label={props['aria-label']}
            aria-labelledby={props['aria-labelledby']}
            aria-invalid={invalid || undefined}
            data-testid={props['data-testid']}
            className={inputClasses}
            style={{ cursor: state.isFocused ? 'text' : 'ns-resize', ...inputStyle }}
          />

          {/* Live validity indicator, and the revert affordance once rejected. */}
          {iconFeedback && (valid || (state.isFocused && state.isValidDraft === false)) && (
            <span className="sc-status" title={state.draftError ?? 'Valid'}>
              {valid ? <ValidIcon /> : <InvalidIcon />}
            </span>
          )}

          {showRevert && state.canRevert && !state.isFocused && (
            <button
              type="button"
              className="sc-revert"
              title={`${state.committedError} — click to restore`}
              aria-label="Revert to the last valid value"
              // Fires before blur/focus churn can swallow the click.
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                actions.revert();
              }}
            >
              <RevertIcon />
            </button>
          )}
        </div>

        {!hideRoller && (
          <div
            className={[
              'sc-roller',
              state.isDragging && 'sc-roller--dragging',
              state.isFocused && 'sc-roller--focused',
              rollerClassName,
            ]
              .filter(Boolean)
              .join(' ')}
            {...getRollerProps()}
          >
            <RollerIcon
              state={state}
              showArrows={showArrows}
              pixelsPerTick={pixelsPerTick}
              getArrowProps={getArrowProps}
            />
          </div>
        )}
      </div>
    );
  },
);
