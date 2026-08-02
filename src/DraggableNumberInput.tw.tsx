import * as React from 'react';
import { forwardRef, useCallback, useImperativeHandle, useState } from 'react';
import { RollerIcon } from './RollerIcon';
import { FormulaHighlight, InvalidIcon, RevertIcon, ValidIcon } from './FormulaHighlight';
import { useScrubber } from './useScrubber';
import { useResizePin } from './useResizePin';
import { builtinNames } from './expression';
import { DEFAULT_MAX, type DraggableNumberInputProps, type ScrollComponentHandle } from './DraggableNumberInput';

/**
 * Tailwind build of {@link DraggableNumberInput} — identical behaviour and
 * API, styled with utility classes instead of `scroll-component.css`.
 *
 * Requires Tailwind in the consuming app, with the default `slate` / `cyan`
 * palette available. Make sure this package is scanned by your Tailwind
 * content globs, otherwise the classes get purged:
 *
 *   content: ['./src/**\/*.{ts,tsx}', './node_modules/@jugaaadi/advance-scroll-input/dist/**\/*.js']
 */
export const DraggableNumberInputTw = forwardRef<ScrollComponentHandle, DraggableNumberInputProps>(
  function DraggableNumberInputTw(props, ref) {
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

    const borderClass = borderFeedback && invalid
      ? 'border-red-500 focus:border-red-500'
      : borderFeedback && valid
        ? 'border-green-500 focus:border-green-500'
        : 'border-slate-700 focus:border-cyan-500';

    const resizeValue =
      resizable === true ? 'horizontal' : resizable === false ? undefined : resizable;

    const fieldRef = React.useRef<HTMLDivElement>(null);
    useResizePin(fieldRef, resizeValue);

    const injected = getInputProps();

    return (
      <div
        className={`group w-full min-w-0 flex items-center gap-1.5 ${className || ''}`}
        style={style}
        data-feature-id={props['data-feature-id']}
      >
        {/* Font is set here for the overlay to inherit, and repeated on the
            input itself — relying on inheritance breaks when a consumer
            disables Tailwind's preflight, since the browser's default input
            font then wins and the overlay drifts out of alignment. */}
        <div
          ref={fieldRef}
          className={`relative flex-1 min-w-0 flex items-center text-sm max-sm:text-base ${
            resizeValue ? 'overflow-hidden min-w-16 max-w-full' : ''
          }`}
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
            className={`${
              resizeValue && resizeValue !== 'horizontal' ? 'h-full' : 'h-8 max-sm:h-11'
            } text-sm max-sm:text-base bg-slate-950 border rounded px-2 outline-none transition-all duration-150 touch-none disabled:opacity-50 disabled:cursor-not-allowed ${borderClass} ${
              state.isDragging ? 'font-bold text-white tracking-wide shadow-inner' : 'text-slate-200'
            } ${showOverlay ? 'text-transparent bg-transparent caret-cyan-400' : ''} ${
              invalid || valid ? 'pr-7' : ''
            } ${inputClassName || ''} w-full min-w-0`}
            style={{ cursor: state.isFocused ? 'text' : 'ns-resize', ...inputStyle }}
          />

          {iconFeedback && (valid || (state.isFocused && state.isValidDraft === false)) && (
            <span
              className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center pointer-events-none leading-none"
              title={state.draftError ?? 'Valid'}
            >
              {valid ? <ValidIcon /> : <InvalidIcon />}
            </span>
          )}

          {showRevert && state.canRevert && !state.isFocused && (
            <button
              type="button"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center justify-center w-5 h-5 max-sm:w-8 max-sm:h-8 p-0 border-none rounded bg-transparent text-amber-500 hover:text-amber-400 cursor-pointer"
              title={`${state.committedError} — click to restore`}
              aria-label="Revert to the last valid value"
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
            className={`shrink-0 w-7 h-8 max-sm:w-10 max-sm:h-11 flex items-center justify-center transition-all duration-300 cursor-ns-resize touch-none select-none ${
              state.isDragging
                ? 'opacity-100 scale-105'
                : state.isFocused
                  ? 'opacity-60'
                  : 'opacity-80 group-hover:opacity-100'
            } ${rollerClassName || ''}`}
            {...getRollerProps()}
          >
            {/* `w-full h-full`: the graphic is fitted to the roller's box in
                this build too, so it can never paint outside it. The CSS build
                does the same from `scroll-component.css`, which this one never
                loads. */}
            <RollerIcon
              state={state}
              showArrows={showArrows}
              pixelsPerTick={pixelsPerTick}
              getArrowProps={getArrowProps}
              className="w-full h-full"
            />
          </div>
        )}
      </div>
    );
  },
);
