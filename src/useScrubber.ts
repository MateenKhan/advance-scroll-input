import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as React from 'react';
import type { ChangeSource, ScrollComponentEvents, ScrubEventMeta, ScrubTarget } from './events';
import { isFormula } from './expression';

/**
 * Default display formatter: rounds to 2 decimals for display only — the
 * underlying value keeps full precision. Normalizes undefined/null to ''.
 */
export const formatDisplay = (v: number | string | ''): string => {
  if (v === '' || v === undefined || v === null) return '';
  if (typeof v === 'string' && (v === 'undefined' || v === 'null' || v.trim() === '')) return '';
  const n = typeof v === 'number' ? v : parseFloat(v);
  if (isNaN(n)) return String(v);
  return String(Math.round(n * 100) / 100);
};

export interface UseScrubberOptions extends ScrollComponentEvents {
  value: number | string | '';
  /** Canonical change callback, shaped like a native input event. */
  onChange: (e: { target: { value: string } }) => void;
  step?: number;
  min?: number;
  max?: number;
  /**
   * Permit values below zero. Default `false` — the value is floored at 0
   * however it arrives (typed, scrubbed, stepped, or pasted).
   *
   * When `false`, an explicit negative `min` is ignored in favour of 0; set
   * `allowNegative` to honour it.
   */
  allowNegative?: boolean;
  /** Pixels of drag per one `step`. Lower = more sensitive. Default 6. */
  pixelsPerTick?: number;
  disabled?: boolean;
  readOnly?: boolean;
  /** ArrowUp/ArrowDown adjust the value while focused. Default true. */
  enableKeyboardStep?: boolean;
  /** Mouse wheel adjusts the value while hovered. Default false — opt in so
   *  the control never hijacks page scrolling by surprise. */
  enableWheel?: boolean;
  /** Suffix rendered after the number when idle, e.g. `mm`. */
  unit?: string;
  /** Override the display formatter. */
  format?: (v: number | string | '') => string;
  /**
   * Converts typed text into a number in *display* units. Defaults to
   * `parseFloat`. Unit-aware wrappers override this so `"10ft"` reports 3048
   * (mm) rather than 10 when the field is displaying millimetres.
   */
  parseValue?: (text: string) => number;
  /** Called on each keystroke so wrappers can sniff a typed unit. */
  inspectText?: (text: string) => void;
  /**
   * Turns the field into a formula editor: `100*2`, `(190*120)/144`,
   * `100 * length`. Default `true`.
   */
  formula?: boolean;
  /**
   * Resolves the field's text to a number. Supplied by the wrapper because
   * only it knows the display unit and the caller's variables. Falls back to
   * `parseValue` / `parseFloat`.
   */
  resolveText?: (text: string) => { ok: boolean; value?: number; error?: string };
  /** Select the whole value on focus instead of placing the caret at the end. */
  selectOnFocus?: boolean;
  /** Reject non-integer results. */
  integerOnly?: boolean;
  /** Extra validation. Return `true` to accept, or a message to reject. */
  validate?: (value: number) => true | string;
}

export interface ScrubberState {
  isDragging: boolean;
  isFocused: boolean;
  isHovered: boolean;
  hoveredArrow: 'up' | 'down' | null;
  visualPhase: number;
  pullDistance: number;
  localText: string;
  /** What the input element should display right now (adds the unit suffix). */
  displayText: string;
  /** Live validity of the draft while editing: null when it isn't a formula. */
  isValidDraft: boolean | null;
  /** Why the draft is invalid, while editing. */
  draftError: string | null;
  /** Error kept on screen after a failed commit, with the text that caused it. */
  committedError: string | null;
  /** True when a bad entry can be rolled back to the last good value. */
  canRevert: boolean;
  /** True while the field holds a formula rather than a bare number. */
  isFormulaDraft: boolean;
  /** The formula behind the current value, replayed on focus. */
  activeFormula: string | null;
  isDraggingUp: boolean;
  isDraggingDown: boolean;
  /** Which way the roller is currently travelling, or null when at rest. */
  direction: 'up' | 'down' | null;
}

/**
 * Headless engine behind every visual variant: physics, pointer capture,
 * keyboard stepping, and the full event surface. Returns prop getters so the
 * CSS and Tailwind shells stay purely presentational.
 */
export function useScrubber(options: UseScrubberOptions) {
  const {
    value,
    onChange,
    step = 1,
    min,
    max,
    allowNegative = false,
    pixelsPerTick = 6,
    disabled = false,
    readOnly = false,
    enableKeyboardStep = true,
    enableWheel = false,
    unit,
    format = formatDisplay,
    inspectText,
    parseValue,
    formula = true,
    resolveText,
    selectOnFocus = false,
    integerOnly = false,
    validate,
  } = options;

  const inputRef = useRef<HTMLInputElement>(null);

  // Latest handlers, so the rAF loop never closes over a stale render.
  const handlers = useRef(options);
  handlers.current = options;

  const dragState = useRef<{
    startY: number;
    startValue: number;
    dragging: boolean;
    hasMoved: boolean;
    pointerType: string;
    target: ScrubTarget;
  } | null>(null);

  const animationRef = useRef<number | null>(null);
  const currentDyRef = useRef(0);
  const pendingArrowClickRef = useRef<'up' | 'down' | null>(null);
  const physicsRef = useRef({
    phase: 0,
    velocity: 0,
    targetVelocity: 0,
    dragging: false,
    startValue: 0,
  });

  const [isDragging, setIsDragging] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [visualPhase, setVisualPhase] = useState(0);
  const [hoveredArrow, setHoveredArrow] = useState<'up' | 'down' | null>(null);

  const [localText, setLocalText] = useState(format(value));
  const cancelNextBlur = useRef(false);
  const lastEmittedText = useRef<string | null>(null);

  /** Text kept on screen after a failed commit; the value itself is untouched. */
  const [committedError, setCommittedError] = useState<string | null>(null);
  /** The formula that produced the current value, replayed when refocusing. */
  const [committedFormula, setCommittedFormula] = useState<string | null>(null);

  // Mirrored in a ref so the per-frame scrub loop can skip redundant updates.
  const formulaRef = useRef<{ f: string | null; e: string | null }>({ f: null, e: null });
  const setFormulaState = useCallback((f: string | null, e: string | null) => {
    if (formulaRef.current.f === f && formulaRef.current.e === e) return;
    formulaRef.current = { f, e };
    setCommittedFormula(f);
    setCommittedError(e);
  }, []);
  /** A gesture changed the value, so any stale formula no longer describes it. */
  const clearFormula = useCallback(() => setFormulaState(null, null), [setFormulaState]);

  useEffect(() => {
    // A rejected entry stays on screen verbatim until it's corrected or
    // reverted — resyncing from `value` here would silently discard it.
    if (formulaRef.current.e !== null) return;
    if (!isFocused && !dragState.current?.dragging) {
      setLocalText(format(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, isFocused]);

  const numericValue =
    typeof value === 'number' ? value : typeof value === 'string' ? parseFloat(value) : 0;
  const safeValue = isNaN(numericValue) ? 0 : numericValue;

  // Positive-only by default: an absent `min` becomes 0, and a negative one is
  // lifted to 0 unless the caller opts into negatives.
  const effectiveMin = allowNegative ? min : Math.max(min ?? 0, 0);

  const clamp = useCallback(
    (v: number) => {
      let result = v;
      if (effectiveMin !== undefined && result < effectiveMin) {
        result = effectiveMin;
        handlers.current.onClamp?.(effectiveMin, v, 'min');
      }
      if (max !== undefined && result > max) {
        result = max;
        handlers.current.onClamp?.(max, v, 'max');
      }
      return result;
    },
    [effectiveMin, max],
  );

  /**
   * The value the field is holding RIGHT NOW, readable from inside `emitChange`
   * without putting it in the dependency list (which would rebuild the callback
   * on every frame of a drag).
   */
  const valueRef = useRef(safeValue);
  valueRef.current = safeValue;

  const emitChange = useCallback(
    (newVal: number, source: ChangeSource, forceInteger = false) => {
      const clamped = clamp(newVal);
      /*
       * ---------------------------------------------------------------------
       * A GESTURE THAT LANDED ON THE VALUE YOU ALREADY HAVE EMITS NOTHING.
       * ---------------------------------------------------------------------
       *
       * `beginDrag` runs on POINTER-DOWN and starts the rAF loop, which fires
       * its first frame ~16ms later — sooner than any human releases a click.
       * That frame computes `startValue + Math.round(0 / pixelsPerTick) * step`,
       * which is the start value exactly, and then emitted it. Whatever the
       * formatting below did to that number — round it, fix it to three
       * decimals — became a WRITE to the consumer's model, from a click that
       * moved nothing.
       *
       * The guard is an identity test rather than a tolerance: it fires only
       * when the arithmetic produced the same double the field already holds,
       * which is precisely the no-op case. A real detent differs by `step` and
       * falls straight through.
       */
      if (clamped === valueRef.current) return;
      let strVal: string;
      if (forceInteger) {
        strVal = String(Math.round(clamped));
      } else {
        const decimals = step < 1 ? Math.max(String(step).split('.')[1]?.length || 0, 3) : 3;
        strVal = String(parseFloat(clamped.toFixed(decimals)));
      }

      if (lastEmittedText.current !== strVal) {
        lastEmittedText.current = strVal;
        setLocalText(strVal);
        // A scrub replaces whatever formula produced the old value.
        clearFormula();
        onChange({ target: { value: strVal } });
        handlers.current.onValueChange?.(parseFloat(strVal), source);
      }
    },
    [onChange, clamp, step, clearFormula],
  );

  /**
   * Resolves text to a number *without* committing it — used for both the
   * live draft indicator and the final commit, so what you see while typing
   * is exactly what you get on blur.
   */
  const resolve = useCallback(
    (text: string): { ok: boolean; value?: number; error?: string } => {
      if (!text.trim()) return { ok: false, error: 'Empty' };

      let base: { ok: boolean; value?: number; error?: string };
      if (resolveText) {
        base = resolveText(text);
      } else {
        const n = parseValue ? parseValue(text) : parseFloat(text);
        base = isNaN(n) ? { ok: false, error: 'Not a number' } : { ok: true, value: n };
      }
      if (!base.ok || base.value === undefined) return base;

      if (integerOnly && !Number.isInteger(base.value)) {
        return { ok: false, error: 'Must be a whole number' };
      }
      const verdict = validate?.(base.value);
      if (verdict !== undefined && verdict !== true) {
        return { ok: false, error: String(verdict) };
      }
      return base;
    },
    [resolveText, parseValue, integerOnly, validate],
  );

  /** Commits typed text, keeping a bad entry on screen instead of losing it. */
  const emitText = useCallback(
    (text: string, source: ChangeSource) => {
      const r = resolve(text);

      if (!r.ok || r.value === undefined) {
        // The value is left untouched; the revert button restores the display.
        setFormulaState(null, r.error ?? 'Invalid entry');
        handlers.current.onParseError?.(text);
        return;
      }

      // Remember the formula so refocusing shows `(190*120)/144`, not 158.33.
      setFormulaState(formula && isFormula(text) ? text : null, null);

      // Typed values clamp like every other source, so `allowNegative` and
      // min/max hold however the value arrived — including paste.
      const clamped = clamp(r.value);
      const out = String(parseFloat(clamped.toFixed(6)));
      setLocalText(out);
      lastEmittedText.current = out;
      onChange({ target: { value: out } });
      handlers.current.onValueChange?.(clamped, source);
      handlers.current.onCommit?.(clamped, source);
    },
    [resolve, clamp, onChange, formula, setFormulaState],
  );

  const buildMeta = useCallback(
    (overrides: Partial<ScrubEventMeta> = {}): ScrubEventMeta => {
      const p = physicsRef.current;
      const d = dragState.current;
      /*
       * `p.startValue` IS NOT AN INTEGER, AND ROUNDING IT CORRUPTS THE VALUE.
       *
       * It is the value in DISPLAY units — a consumer hands this component
       * whatever its own unit shows — so `Math.round` here is only harmless when
       * one display unit happens to equal one `step`. That is true in
       * millimetres, which is why this survived: the default unit hides it
       * completely.
       *
       * In every other unit it silently rewrites the number on a plain CLICK,
       * because `beginDrag` runs on pointer-down and the first animation frame
       * lands ~16ms later — sooner than any human releases. Measured worst case
       * for a single click, in a millimetre-modelled app:
       *
       *     cm  +/- 5mm      in  +/- 12.7mm      ft  +/- 152mm      m  +/- 500mm
       *
       * 2100 shown as `2.1 m` rounds to `2` and commits 2000. A different
       * wardrobe and a different price, from a click, leaving a plausible number
       * on screen.
       *
       * `startValue` is already quantised to the detent grid where it is written
       * (`startVal - Math.round(currentPhase / pixelsPerTick) * step` below), so
       * it needs no rounding here at all — the phase term is the only part that
       * should snap.
       */
      const current = p.startValue + Math.round(p.phase / pixelsPerTick) * step;
      return {
        value: current,
        startValue: d?.startValue ?? p.startValue,
        delta: current - (d?.startValue ?? p.startValue),
        dy: currentDyRef.current,
        velocity: p.velocity,
        pointerType: d?.pointerType ?? 'mouse',
        target: d?.target ?? 'input',
        ...overrides,
      };
    },
    [pixelsPerTick, step],
  );

  const startAnimationLoop = useCallback(
    (startVal: number) => {
      currentDyRef.current = 0;

      const currentPhase = physicsRef.current.phase;
      physicsRef.current = {
        phase: currentPhase, // resume from current phase so a re-drag doesn't jump
        velocity: 0,
        targetVelocity: 0,
        dragging: true,
        startValue: startVal - Math.round(currentPhase / pixelsPerTick) * step,
      };

      setPullDistance(0);

      let lastTime = performance.now();
      const loop = (time: number) => {
        const dt = Math.min(time - lastTime, 50) / 1000;
        lastTime = time;

        const p = physicsRef.current;
        const targetPhase = Math.round(p.phase / pixelsPerTick) * pixelsPerTick;

        if (p.dragging) {
          const dy = currentDyRef.current;
          if (Math.abs(dy) > 2) {
            const sign = Math.sign(dy);
            // Non-linear speed curve: smooth for fine tuning, fast at the edges.
            p.targetVelocity = -sign * Math.pow(Math.abs(dy), 1.3) * 1.5;
          } else {
            p.targetVelocity = 0;
          }
          p.velocity += (p.targetVelocity - p.velocity) * 8 * dt;
          p.phase += p.velocity * dt;
        } else {
          // Instant air brake, then snap aggressively into detent.
          p.velocity = 0;
          p.phase += (targetPhase - p.phase) * 40 * dt;
        }

        const isSettled = !p.dragging && Math.abs(targetPhase - p.phase) < 0.1;
        if (isSettled) {
          p.phase = targetPhase;
          p.velocity = 0;
        }

        // Value follows the visual phase exactly: one detent = one `step`.
        /* Same correction as the scrub path above — see the note there. */
        const newValue = p.startValue + Math.round(p.phase / pixelsPerTick) * step;
        /*
         * -------------------------------------------------------------------
         * `step === 1` DOES NOT MEAN THE VALUE IS AN INTEGER.
         * -------------------------------------------------------------------
         *
         * This argument used to be `step === 1`, and it rounded the emitted
         * value to a whole number whenever the caller's step happened to be one.
         * A step of 1 says how far ONE DETENT travels. It says nothing at all
         * about where the value currently sits, and a consumer whose model is
         * millimetres passes `step: 1` for its millimetre field while holding
         * derived values like 1367.0929, 824.6 and 490.8.
         *
         * So a plain CLICK — which starts the rAF loop and emits the start value
         * before anybody lets go — silently rewrote 1367.0929 to 1367, and a
         * single detent turned 1367.1 into 1368 rather than 1368.1. Up to half a
         * millimetre per click, in the one unit everybody assumed was safe.
         * (The other units escaped because their step is below 1, so this branch
         * was never taken there — which is exactly why it went unseen.)
         *
         * `integerOnly` is the option that actually means "this value is a whole
         * number" — it is the flag `resolve` already refuses fractions under —
         * so that is what decides it.
         */
        emitChange(newValue, 'scrub', integerOnly);

        setVisualPhase(p.phase);
        handlers.current.onScrub?.(buildMeta({ value: newValue }));

        if (!isSettled) {
          animationRef.current = requestAnimationFrame(loop);
        } else {
          animationRef.current = null;
          handlers.current.onScrubEnd?.(buildMeta({ value: newValue, dy: 0, velocity: 0 }));
        }
      };

      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
      animationRef.current = requestAnimationFrame(loop);
    },
    [emitChange, buildMeta, pixelsPerTick, step, integerOnly],
  );

  const beginDrag = useCallback(
    (e: React.PointerEvent<HTMLElement>, target: ScrubTarget) => {
      const startVal = safeValue;
      dragState.current = {
        startY: e.clientY,
        startValue: startVal,
        dragging: true,
        hasMoved: false,
        pointerType: e.pointerType,
        target,
      };
      setIsDragging(true);
      handlers.current.onDraggingChange?.(true);
      startAnimationLoop(startVal);
      handlers.current.onScrubStart?.(
        buildMeta({ value: startVal, startValue: startVal, delta: 0, dy: 0, target, pointerType: e.pointerType }),
      );
      try {
        (e.target as Element).setPointerCapture(e.pointerId);
      } catch {
        /* capture is best-effort */
      }
    },
    [safeValue, startAnimationLoop, buildMeta],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      handlers.current.onPointerDown?.(e);
      if (disabled || readOnly) return;
      if (e.button !== 0 || isFocused) return;
      e.preventDefault();
      e.stopPropagation();
      pendingArrowClickRef.current = null;
      beginDrag(e, 'input');
    },
    [disabled, readOnly, isFocused, beginDrag],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      handlers.current.onPointerMove?.(e);
      if (!dragState.current?.dragging) return;
      const dy = e.clientY - dragState.current.startY;
      if (Math.abs(dy) > 2) {
        dragState.current.hasMoved = true;
        pendingArrowClickRef.current = null; // moved, so it is not a tap
      }
      currentDyRef.current = dy;
      setPullDistance(dy);
    },
    [],
  );

  const stepValue = useCallback(
    (direction: 'up' | 'down', source: ChangeSource, multiplier = 1) => {
      const delta = step * multiplier;
      const next = direction === 'up' ? safeValue + delta : safeValue - delta;
      const clamped = clamp(parseFloat(next.toFixed(6)));
      const strVal = String(clamped);
      lastEmittedText.current = strVal;
      setLocalText(strVal);
      clearFormula();
      onChange({ target: { value: strVal } });
      handlers.current.onValueChange?.(clamped, source);
      handlers.current.onCommit?.(clamped, source);
      return clamped;
    },
    [safeValue, step, clamp, onChange, clearFormula],
  );

  const handleArrowClick = useCallback(
    (direction: 'up' | 'down') => {
      const next = stepValue(direction, 'arrow');
      handlers.current.onArrowClick?.(direction, next);
    },
    [stepValue],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      handlers.current.onPointerUp?.(e);
      if (!dragState.current) return;

      const wasDragging = dragState.current.hasMoved;
      const pendingArrow = pendingArrowClickRef.current;
      pendingArrowClickRef.current = null;

      physicsRef.current.dragging = false; // triggers the settle phase
      dragState.current = null;
      setIsDragging(false);
      handlers.current.onDraggingChange?.(false);
      setPullDistance(0);

      if (!wasDragging) {
        if (animationRef.current !== null) {
          cancelAnimationFrame(animationRef.current);
          animationRef.current = null;
        }
        if (pendingArrow) {
          handleArrowClick(pendingArrow); // tap on an arrow = step
        } else if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      } else {
        handlers.current.onCommit?.(safeValue, 'scrub');
      }
    },
    [handleArrowClick, safeValue],
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      handlers.current.onPointerCancel?.(e);
      if (!dragState.current) return;
      physicsRef.current.dragging = false;
      dragState.current = null;
      setIsDragging(false);
      handlers.current.onDraggingChange?.(false);
      setPullDistance(0);
    },
    [],
  );

  const handleArrowPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>, direction: 'up' | 'down') => {
      handlers.current.onPointerDown?.(e);
      if (disabled || readOnly) return;
      if (e.button !== 0 && e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
      e.preventDefault();
      e.stopPropagation();
      if (isFocused && inputRef.current) inputRef.current.blur();
      pendingArrowClickRef.current = direction;
      beginDrag(e, direction === 'up' ? 'arrow-up' : 'arrow-down');
    },
    [disabled, readOnly, isFocused, beginDrag],
  );

  const handleRollerPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      handlers.current.onPointerDown?.(e);
      if (disabled || readOnly) return;
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      if (isFocused && inputRef.current) inputRef.current.blur(); // let the drag take over
      pendingArrowClickRef.current = null;
      beginDrag(e, 'roller');
    },
    [disabled, readOnly, isFocused, beginDrag],
  );

  const handleFocus = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);

      // Focusing replays the formula behind the value rather than the result,
      // and keeps a rejected entry on screen so it can be corrected.
      const next =
        formulaRef.current.e !== null ? localText : (formulaRef.current.f ?? format(value));
      setLocalText(next);

      // Caret lands after the value so you can just type `*2`.
      const el = inputRef.current;
      if (el) {
        requestAnimationFrame(() => {
          if (!inputRef.current) return;
          if (selectOnFocus) inputRef.current.select();
          else inputRef.current.setSelectionRange(next.length, next.length);
        });
      }
      handlers.current.onFocus?.(e);
    },
    [format, value, localText, selectOnFocus],
  );

  /** Rolls a rejected entry back to the last good value. */
  const revert = useCallback(() => {
    setFormulaState(null, null);
    const restored = format(value);
    setLocalText(restored);
    lastEmittedText.current = null;
    handlers.current.onRevert?.(safeValue);
    return safeValue;
  }, [format, value, safeValue, setFormulaState]);

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      if (cancelNextBlur.current) {
        cancelNextBlur.current = false;
        setIsFocused(false);
        handlers.current.onBlur?.(e);
        return;
      }
      emitText(localText, 'blur');
      setIsFocused(false);
      handlers.current.onBlur?.(e);
    },
    [localText, emitText],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      handlers.current.onKeyDown?.(e);
      if (e.defaultPrevented) return;

      if (e.key === 'Enter') {
        emitText(localText, 'enter');
        // Enter already committed; stop the blur it triggers from doing it again.
        cancelNextBlur.current = true;
        inputRef.current?.blur();
        handlers.current.onEnter?.(parseValue ? parseValue(localText) : parseFloat(localText), e);
      } else if (e.key === 'Escape') {
        cancelNextBlur.current = true;
        setLocalText(format(value));
        inputRef.current?.blur();
        handlers.current.onEscape?.(e);
      } else if (enableKeyboardStep && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        const direction = e.key === 'ArrowUp' ? 'up' : 'down';
        // Shift = coarse (x10), Alt = fine (x0.1), matching design-tool convention.
        const multiplier = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
        const next = stepValue(direction, 'key', multiplier);
        setLocalText(String(next));
        handlers.current.onArrowKey?.(direction, next, e);
      }
    },
    [localText, emitText, format, value, enableKeyboardStep, stepValue, parseValue],
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLElement>) => {
      handlers.current.onWheel?.(e);
      if (!enableWheel || disabled || readOnly || e.defaultPrevented) return;
      if (e.deltaY === 0) return;
      e.preventDefault();
      const multiplier = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
      stepValue(e.deltaY < 0 ? 'up' : 'down', 'wheel', multiplier);
    },
    [enableWheel, disabled, readOnly, stepValue],
  );

  const setHover = useCallback((hovered: boolean, target: ScrubTarget) => {
    if (target === 'input' || target === 'roller') setIsHovered(hovered);
    handlers.current.onHoverChange?.(hovered, target);
  }, []);

  useEffect(() => {
    return () => {
      dragState.current = null;
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  // Live validity of what is being typed, so the indicator and the eventual
  // commit always agree.
  const draft = useMemo(
    () => (isFocused && localText.trim() ? resolve(localText) : null),
    [isFocused, localText, resolve],
  );

  const isFormulaDraft = formula && isFormula(localText);

  // Report validity flips rather than every keystroke.
  const lastValidity = useRef<boolean | null>(null);
  useEffect(() => {
    const valid = draft ? draft.ok : null;
    if (valid === lastValidity.current) return;
    lastValidity.current = valid;
    if (valid !== null) {
      handlers.current.onDraftValidityChange?.(valid, draft?.error ?? null, localText);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.ok, draft?.error]);

  // The unit suffix is only appended to a settled, valid number — never to a
  // formula being edited, and never to a rejected entry.
  const displayText =
    !isFocused && !isDragging && committedError === null && unit && localText !== ''
      ? `${localText} ${unit}`
      : localText;

  const isDraggingUp = isDragging && pullDistance < -2;
  const isDraggingDown = isDragging && pullDistance > 2;

  const state: ScrubberState = {
    isDragging,
    isFocused,
    isHovered,
    hoveredArrow,
    visualPhase,
    pullDistance,
    localText,
    displayText,
    isDraggingUp,
    isDraggingDown,
    isValidDraft: draft ? draft.ok : null,
    draftError: draft && !draft.ok ? (draft.error ?? 'Invalid') : null,
    committedError,
    canRevert: committedError !== null,
    isFormulaDraft,
    activeFormula: committedFormula,
    // A tapped arrow counts as travel too, so a tap flashes the same colour.
    direction: isDraggingUp
      ? 'up'
      : isDraggingDown
        ? 'down'
        : isDragging && pendingArrowClickRef.current
          ? pendingArrowClickRef.current
          : null,
  };

  /** Props for the `<input>`, with every DOM handler composed. */
  const getInputProps = () => ({
    ref: inputRef,
    type: 'text' as const,
    value: displayText,
    disabled,
    readOnly,
    inputMode: 'decimal' as const,
    autoComplete: 'off',
    spellCheck: false,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setLocalText(e.target.value);
      // Editing supersedes a previous rejection; the live draft takes over.
      if (formulaRef.current.e !== null) setFormulaState(formulaRef.current.f, null);
      handlers.current.onInput?.(e.target.value, e);
      inspectText?.(e.target.value);
    },
    onKeyDown: handleKeyDown,
    onKeyUp: (e: React.KeyboardEvent<HTMLInputElement>) => handlers.current.onKeyUp?.(e),
    onKeyPress: (e: React.KeyboardEvent<HTMLInputElement>) => handlers.current.onKeyPress?.(e),
    onFocus: handleFocus,
    onBlur: handleBlur,
    onSelect: (e: React.SyntheticEvent<HTMLInputElement>) => handlers.current.onSelect?.(e),
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerCancel,
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      setHover(true, 'input');
      handlers.current.onMouseEnter?.(e);
    },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      setHover(false, 'input');
      handlers.current.onMouseLeave?.(e);
    },
    onMouseOver: (e: React.MouseEvent<HTMLElement>) => handlers.current.onMouseOver?.(e),
    onMouseOut: (e: React.MouseEvent<HTMLElement>) => handlers.current.onMouseOut?.(e),
    onMouseDown: (e: React.MouseEvent<HTMLElement>) => handlers.current.onMouseDown?.(e),
    onMouseUp: (e: React.MouseEvent<HTMLElement>) => handlers.current.onMouseUp?.(e),
    onMouseMove: (e: React.MouseEvent<HTMLElement>) => handlers.current.onMouseMove?.(e),
    onClick: (e: React.MouseEvent<HTMLElement>) => handlers.current.onClick?.(e),
    onDoubleClick: (e: React.MouseEvent<HTMLElement>) => handlers.current.onDoubleClick?.(e),
    onContextMenu: (e: React.MouseEvent<HTMLElement>) => handlers.current.onContextMenu?.(e),
    onTouchStart: (e: React.TouchEvent<HTMLElement>) => handlers.current.onTouchStart?.(e),
    onTouchMove: (e: React.TouchEvent<HTMLElement>) => handlers.current.onTouchMove?.(e),
    onTouchEnd: (e: React.TouchEvent<HTMLElement>) => handlers.current.onTouchEnd?.(e),
    onTouchCancel: (e: React.TouchEvent<HTMLElement>) => handlers.current.onTouchCancel?.(e),
    onWheel: handleWheel,
  });

  const getRollerProps = () => ({
    onPointerDown: handleRollerPointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerCancel,
    onPointerEnter: (e: React.PointerEvent<HTMLElement>) => handlers.current.onPointerEnter?.(e),
    onPointerLeave: (e: React.PointerEvent<HTMLElement>) => handlers.current.onPointerLeave?.(e),
    onMouseEnter: () => setHover(true, 'roller'),
    onMouseLeave: () => setHover(false, 'roller'),
    onWheel: handleWheel,
  });

  const getArrowProps = (direction: 'up' | 'down') => ({
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => handleArrowPointerDown(e, direction),
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerCancel,
    onMouseEnter: () => {
      setHoveredArrow(direction);
      setHover(true, direction === 'up' ? 'arrow-up' : 'arrow-down');
    },
    onMouseLeave: () => {
      setHoveredArrow(null);
      setHover(false, direction === 'up' ? 'arrow-up' : 'arrow-down');
    },
  });

  return {
    state,
    inputRef,
    getInputProps,
    getRollerProps,
    getArrowProps,
    /** Imperative helpers, also surfaced through the component ref. */
    actions: {
      stepUp: () => stepValue('up', 'arrow'),
      stepDown: () => stepValue('down', 'arrow'),
      revert,
      focus: () => inputRef.current?.focus(),
      blur: () => inputRef.current?.blur(),
      select: () => inputRef.current?.select(),
    },
  };
}
