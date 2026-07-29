import type * as React from 'react';
import type { Unit } from './units';

/** What caused a value to change. Passed to `onValueChange` / `onCommit`. */
export type ChangeSource =
  | 'type' // user typed into the field
  | 'scrub' // dragged the roller / input
  | 'arrow' // tapped an arrow
  | 'key' // ArrowUp / ArrowDown on the keyboard
  | 'wheel' // mouse wheel over the control
  | 'blur' // field lost focus and committed
  | 'enter' // Enter pressed
  | 'external'; // value prop changed from outside

/** Which sub-element an interaction originated from. */
export type ScrubTarget = 'input' | 'roller' | 'arrow-up' | 'arrow-down';

/** Snapshot handed to every scrub lifecycle callback. */
export interface ScrubEventMeta {
  /** Current numeric value, in display units. */
  value: number;
  /** Value when the drag began. */
  startValue: number;
  /** `value - startValue`. */
  delta: number;
  /** Vertical pointer offset in px (negative = dragged up). */
  dy: number;
  /** Internal roller velocity, in phase-units/second. */
  velocity: number;
  /** `'mouse' | 'touch' | 'pen'` from the originating PointerEvent. */
  pointerType: string;
  /** Element the drag started on. */
  target: ScrubTarget;
}

/**
 * The complete event surface. Every handler is optional; every native DOM
 * handler is invoked *in addition to* the component's own internal logic, so
 * attaching one never disables built-in behaviour.
 *
 * See EVENTS.md for the full reference table.
 */
export interface ScrollComponentEvents {
  /* ---------------------------------------------------------------- value */

  /** Fires on every value change, whatever the cause. */
  onValueChange?: (value: number, source: ChangeSource) => void;
  /** Fires on every keystroke with the raw, unparsed text. */
  onInput?: (rawText: string, event: React.ChangeEvent<HTMLInputElement>) => void;
  /** Fires when a value is finalised: blur, Enter, or the end of a drag. */
  onCommit?: (value: number, source: ChangeSource) => void;
  /** Fires when typed text could not be parsed into a number. */
  onParseError?: (rawText: string) => void;
  /** Fires when the user types an explicit unit, e.g. `10ft` -> `Unit.FEET`. */
  onUnitDetected?: (unit: Unit, rawText: string) => void;
  /** Fires when a change is clamped by `min` / `max`. */
  onClamp?: (clamped: number, requested: number, bound: 'min' | 'max') => void;
  /** Fires when a rejected entry is rolled back to the last good value. */
  onRevert?: (value: number) => void;
  /** Fires as the draft's validity flips while typing a formula. */
  onDraftValidityChange?: (valid: boolean, error: string | null, text: string) => void;

  /* ------------------------------------------------------------- keyboard */

  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  onKeyUp?: React.KeyboardEventHandler<HTMLInputElement>;
  /** Legacy alias kept for parity with native inputs. */
  onKeyPress?: React.KeyboardEventHandler<HTMLInputElement>;
  /** Enter pressed — fires after the value is committed. */
  onEnter?: (value: number, event: React.KeyboardEvent<HTMLInputElement>) => void;
  /** Escape pressed — fires after the edit is reverted. */
  onEscape?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  /** ArrowUp / ArrowDown pressed while focused. */
  onArrowKey?: (
    direction: 'up' | 'down',
    value: number,
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => void;

  /* ---------------------------------------------------------------- focus */

  onFocus?: React.FocusEventHandler<HTMLInputElement>;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  onSelect?: React.ReactEventHandler<HTMLInputElement>;

  /* ---------------------------------------------------------------- mouse */

  onClick?: React.MouseEventHandler<HTMLElement>;
  onDoubleClick?: React.MouseEventHandler<HTMLElement>;
  onContextMenu?: React.MouseEventHandler<HTMLElement>;
  onMouseDown?: React.MouseEventHandler<HTMLElement>;
  onMouseUp?: React.MouseEventHandler<HTMLElement>;
  onMouseMove?: React.MouseEventHandler<HTMLElement>;
  onMouseEnter?: React.MouseEventHandler<HTMLElement>;
  onMouseLeave?: React.MouseEventHandler<HTMLElement>;
  onMouseOver?: React.MouseEventHandler<HTMLElement>;
  onMouseOut?: React.MouseEventHandler<HTMLElement>;
  /** Consolidated hover state, told which sub-element was entered or left. */
  onHoverChange?: (hovered: boolean, target: ScrubTarget) => void;

  /* -------------------------------------------------------------- pointer */

  onPointerDown?: React.PointerEventHandler<HTMLElement>;
  onPointerMove?: React.PointerEventHandler<HTMLElement>;
  onPointerUp?: React.PointerEventHandler<HTMLElement>;
  onPointerCancel?: React.PointerEventHandler<HTMLElement>;
  onPointerEnter?: React.PointerEventHandler<HTMLElement>;
  onPointerLeave?: React.PointerEventHandler<HTMLElement>;

  /* ---------------------------------------------------------------- touch */

  onTouchStart?: React.TouchEventHandler<HTMLElement>;
  onTouchMove?: React.TouchEventHandler<HTMLElement>;
  onTouchEnd?: React.TouchEventHandler<HTMLElement>;
  onTouchCancel?: React.TouchEventHandler<HTMLElement>;

  /* ---------------------------------------------------------------- wheel */

  onWheel?: React.WheelEventHandler<HTMLElement>;

  /* -------------------------------------------------------- scrub gesture */

  /** A drag began on the input, the roller, or an arrow. */
  onScrubStart?: (meta: ScrubEventMeta) => void;
  /** Fires on each animation frame while dragging. */
  onScrub?: (meta: ScrubEventMeta) => void;
  /** The drag ended and the roller settled. */
  onScrubEnd?: (meta: ScrubEventMeta) => void;
  /** An arrow was tapped (not dragged), stepping the value by `step`. */
  onArrowClick?: (direction: 'up' | 'down', value: number) => void;
  /** Drag state flipped. Handy for pausing expensive downstream work. */
  onDraggingChange?: (isDragging: boolean) => void;
}
