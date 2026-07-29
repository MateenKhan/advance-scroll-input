# Event reference

Every handler below is optional and available on **all four components** —
`DimensionInput`, `DimensionInputTw`, `DraggableNumberInput`,
`DraggableNumberInputTw` — as well as the `useScrubber` hook.

**Composition guarantee:** the component attaches its own logic to the same DOM
events you're listening to, and always calls your handler *in addition to* its
own. Passing `onKeyDown` does not break Enter/Escape; passing `onPointerDown`
does not break scrubbing. Two handlers where you can cancel the built-in
behaviour are called out explicitly below.

---

## 1. Value events

Fired when the number itself changes. Prefer these over raw DOM events.

| Handler          | Signature                                          | Fires when                                                     |
| ---------------- | -------------------------------------------------- | -------------------------------------------------------------- |
| `onChange`       | `(e: { target: { value: string } }) => void`        | **Required.** Any value change. Shaped like a native input event so existing form code drops in. |
| `onChangeMm`     | `(mm: number) => void`                              | *(DimensionInput only)* **Required.** Any change, in millimetres. |
| `onValueChange`  | `(value: number, source: ChangeSource) => void`     | Any value change, already parsed, with its cause.               |
| `onInput`        | `(rawText: string, e: React.ChangeEvent) => void`   | Every keystroke, with the raw unparsed text (`"10f"` mid-typing). |
| `onCommit`       | `(value: number, source: ChangeSource) => void`     | A value is finalised: blur, Enter, arrow, key, wheel, or the end of a drag. Use this to push to undo history. |
| `onCommitMm`     | `(mm: number, source: ChangeSource) => void`        | *(DimensionInput only)* Same, in millimetres.                   |
| `onParseError`   | `(rawText: string) => void`                         | Typed text could not be parsed. The value is left unchanged.    |
| `onUnitDetected` | `(unit: Unit, rawText: string) => void`             | *(DimensionInput only)* The user typed an explicit unit — `10ft` fires `Unit.FEET`. Useful for auto-switching the panel's display unit. |
| `onClamp`        | `(clamped: number, requested: number, bound: 'min' \| 'max') => void` | A change was limited by `min`, `max`, or the default zero floor. |
| `onRevert`       | `(value: number) => void`                           | A rejected entry was rolled back to the last good value.        |
| `onDraftValidityChange` | `(valid: boolean, error: string \| null, text: string) => void` | The draft flipped between valid and invalid while typing. Fires on transitions only, not per keystroke. |

> **`onClamp` fires for the default zero floor too.** Inputs are positive-only
> unless `allowNegative` is set, so typing `-5` reports
> `onClamp(0, -5, 'min')` and the value settles at `0`. While a scrub is held
> against a bound, `onClamp` fires once per animation frame — throttle with
> `onDraggingChange` if the handler is expensive.

> **Formulas commit their result, and a rejection keeps its text.** Typing
> `100*2` reports `onCommit(200, 'enter')`. Typing `100 *asdf` reports
> `onParseError('100 *asdf')`, leaves the value untouched, and keeps the text
> on screen with a revert button — see [FORMULAS.md](./FORMULAS.md).

> **Typed units are resolved before reporting.** With a field displaying mm,
> typing `10ft` reports `onValueChange(3048, 'enter')` and
> `onCommitMm(3048, 'enter')` — not `10`. The value callbacks always speak the
> field's display unit, never the unit the user happened to type.

### `ChangeSource`

Every value callback tells you *why* it fired:

| Value        | Cause                                       |
| ------------ | ------------------------------------------- |
| `'type'`     | Typed into the field                        |
| `'scrub'`    | Dragged the field, roller, or an arrow      |
| `'arrow'`    | Tapped an arrow                             |
| `'key'`      | `ArrowUp` / `ArrowDown`                     |
| `'wheel'`    | Mouse wheel (needs `enableWheel`)           |
| `'blur'`     | Field lost focus and committed              |
| `'enter'`    | `Enter` pressed                             |
| `'external'` | The `value` prop changed from outside       |

```tsx
<DimensionInput
  valueMm={widthMm}
  onChangeMm={setWidthMm}
  unit={unit}
  onValueChange={(v, source) => {
    // Skip the flood of intermediate values during a drag.
    if (source !== 'scrub') analytics.track('width_changed', { v, source });
  }}
  onCommit={(v, source) => undoStack.push({ v, source })}
  onUnitDetected={(u) => setUnit(u)}
  onParseError={(raw) => setError(`Can't read "${raw}"`)}
/>
```

---

## 2. Keyboard events

| Handler      | Signature                                                   | Notes                                                        |
| ------------ | ----------------------------------------------------------- | ------------------------------------------------------------ |
| `onKeyDown`  | `React.KeyboardEventHandler<HTMLInputElement>`               | Called **before** internal handling. Call `e.preventDefault()` to suppress the built-in Enter/Escape/arrow behaviour. |
| `onKeyUp`    | `React.KeyboardEventHandler<HTMLInputElement>`               | Pass-through.                                                |
| `onKeyPress` | `React.KeyboardEventHandler<HTMLInputElement>`               | Legacy alias, kept for parity with native inputs. React deprecates it; prefer `onKeyDown`. |
| `onEnter`    | `(value: number, e: React.KeyboardEvent) => void`            | After the value is committed and the field blurred.          |
| `onEscape`   | `(e: React.KeyboardEvent) => void`                           | After the edit is reverted and the field blurred.            |
| `onArrowKey` | `(direction: 'up' \| 'down', value: number, e) => void`      | After the value has stepped. Needs `enableKeyboardStep` (default on). |

Built-in key bindings:

| Key                   | Action                  |
| --------------------- | ----------------------- |
| `Enter`               | Commit, blur            |
| `Escape`              | Revert, blur            |
| `ArrowUp` / `Down`    | Step by `step`          |
| `Shift` + arrow       | Step ×10                |
| `Alt` + arrow         | Step ×0.1               |

```tsx
<DraggableNumberInput
  value={v}
  onChange={onChange}
  onKeyDown={(e) => {
    if (e.key === 'Tab') focusNextField();
    if (e.key === 'Enter' && e.metaKey) {
      e.preventDefault(); // suppresses the built-in commit
      submitForm();
    }
  }}
  onEnter={(value) => console.log('committed', value)}
  onEscape={() => console.log('reverted')}
  onArrowKey={(dir, value) => console.log(dir, value)}
/>
```

---

## 3. Focus events

| Handler   | Signature                                     | Fires                                              |
| --------- | --------------------------------------------- | -------------------------------------------------- |
| `onFocus` | `React.FocusEventHandler<HTMLInputElement>`    | After the field enters edit mode. The unit suffix is dropped and the raw number shown. |
| `onBlur`  | `React.FocusEventHandler<HTMLInputElement>`    | After the value has committed (or been reverted, if Escape caused the blur). |
| `onSelect`| `React.ReactEventHandler<HTMLInputElement>`    | Text selection changed inside the field.           |

A tap without movement focuses the field **and selects all** — so typing immediately replaces the value.

---

## 4. Mouse events

| Handler         | Signature                            |
| --------------- | ------------------------------------ |
| `onClick`       | `React.MouseEventHandler<HTMLElement>` |
| `onDoubleClick` | `React.MouseEventHandler<HTMLElement>` |
| `onContextMenu` | `React.MouseEventHandler<HTMLElement>` |
| `onMouseDown`   | `React.MouseEventHandler<HTMLElement>` |
| `onMouseUp`     | `React.MouseEventHandler<HTMLElement>` |
| `onMouseMove`   | `React.MouseEventHandler<HTMLElement>` |
| `onMouseEnter`  | `React.MouseEventHandler<HTMLElement>` |
| `onMouseLeave`  | `React.MouseEventHandler<HTMLElement>` |
| `onMouseOver`   | `React.MouseEventHandler<HTMLElement>` |
| `onMouseOut`    | `React.MouseEventHandler<HTMLElement>` |

> **Note.** The drag gesture is built on **Pointer Events**, not mouse events.
> Mouse handlers are for your own logic (tooltips, context menus, hover
> highlights); they never interfere with scrubbing. If you need drag data, use
> the scrub lifecycle in §7.

### `onHoverChange` — the convenient one

The control has four hoverable regions. Rather than wiring four pairs of
enter/leave handlers, use:

```ts
onHoverChange?: (hovered: boolean, target: ScrubTarget) => void;
```

`ScrubTarget` is `'input' | 'roller' | 'arrow-up' | 'arrow-down'`.

```tsx
<DimensionInput
  valueMm={v}
  onChangeMm={setV}
  unit={unit}
  onHoverChange={(hovered, target) => {
    if (target === 'roller') setTooltip(hovered ? 'Drag to scrub' : null);
    if (target === 'arrow-up') setTooltip(hovered ? 'Increase' : null);
  }}
/>
```

---

## 5. Pointer events

| Handler           | Signature                                | Notes                                        |
| ----------------- | ---------------------------------------- | -------------------------------------------- |
| `onPointerDown`   | `React.PointerEventHandler<HTMLElement>` | Fires for the field, roller, **and** arrows — check `e.currentTarget` if you need to tell them apart, or use `onScrubStart`'s `target`. |
| `onPointerMove`   | `React.PointerEventHandler<HTMLElement>` | Fires on every move, dragging or not.        |
| `onPointerUp`     | `React.PointerEventHandler<HTMLElement>` | Fires before the drag is torn down.          |
| `onPointerCancel` | `React.PointerEventHandler<HTMLElement>` | The OS stole the gesture (a system swipe, a call). The drag aborts cleanly. |
| `onPointerEnter`  | `React.PointerEventHandler<HTMLElement>` | Roller only.                                 |
| `onPointerLeave`  | `React.PointerEventHandler<HTMLElement>` | Roller only.                                 |

The component calls `setPointerCapture` on drag start, so a drag keeps
tracking even when the pointer leaves the element — including off-window.

---

## 6. Touch and wheel events

| Handler         | Signature                              | Notes                                          |
| --------------- | -------------------------------------- | ---------------------------------------------- |
| `onTouchStart`  | `React.TouchEventHandler<HTMLElement>` | Pass-through. Scrubbing itself runs on pointer events, which cover touch. |
| `onTouchMove`   | `React.TouchEventHandler<HTMLElement>` |                                                |
| `onTouchEnd`    | `React.TouchEventHandler<HTMLElement>` |                                                |
| `onTouchCancel` | `React.TouchEventHandler<HTMLElement>` |                                                |
| `onWheel`       | `React.WheelEventHandler<HTMLElement>` | Called **before** internal handling. `e.preventDefault()` suppresses the built-in wheel step. |

Wheel stepping is **off by default** — a control that eats page scroll on hover
is a bad neighbour. Turn it on per instance:

```tsx
<DimensionInput valueMm={v} onChangeMm={setV} unit={unit} enableWheel />
```

With it on: wheel up increases, `Shift` gives ×10, `Alt` gives ×0.1.

---

## 7. Scrub lifecycle events

The drag-specific API. All four receive a `ScrubEventMeta`.

| Handler            | Signature                                          | Fires                                            |
| ------------------ | -------------------------------------------------- | ------------------------------------------------ |
| `onScrubStart`     | `(meta: ScrubEventMeta) => void`                    | A drag begins on the field, roller, or an arrow.  |
| `onScrub`          | `(meta: ScrubEventMeta) => void`                    | Every animation frame while dragging **and** while the roller settles. |
| `onScrubEnd`       | `(meta: ScrubEventMeta) => void`                    | The roller has fully settled into its detent.     |
| `onArrowClick`     | `(direction: 'up' \| 'down', value: number) => void`| An arrow was tapped, not dragged.                 |
| `onDraggingChange` | `(isDragging: boolean) => void`                     | Drag state flipped. Cheapest way to pause expensive downstream work. |

### `ScrubEventMeta`

```ts
interface ScrubEventMeta {
  value: number;       // current value, in display units
  startValue: number;  // value when the drag began
  delta: number;       // value - startValue
  dy: number;          // vertical pointer offset in px (negative = dragged up)
  velocity: number;    // roller velocity, phase-units/second
  pointerType: string; // 'mouse' | 'touch' | 'pen'
  target: ScrubTarget; // 'input' | 'roller' | 'arrow-up' | 'arrow-down'
}
```

```tsx
<DimensionInput
  valueMm={widthMm}
  onChangeMm={setWidthMm}
  unit={unit}
  onDraggingChange={(dragging) => setLivePreviewEnabled(!dragging)}
  onScrubStart={(m) => beginTransaction(m.startValue)}
  onScrub={(m) => showGhost(m.value)}
  onScrubEnd={(m) => commitTransaction(m.startValue, m.value)}
/>
```

> `onScrub` fires per frame. Keep the handler cheap, or throttle downstream
> work with `onDraggingChange`.

---

## Firing order

Typical sequences, so you know what lands when:

**Typing `10ft` then pressing Enter**

```
onFocus
onInput("1") → onUnitDetected? no
onInput("10")
onInput("10f")
onInput("10ft") → onUnitDetected(Unit.FEET, "10ft")
onKeyDown(Enter)
  onChange / onValueChange(10, 'enter') / onCommit(10, 'enter')
onEnter(10)
onBlur
```

**Dragging the roller down two detents**

```
onPointerDown
onScrubStart({ target: 'roller', startValue: 12 })
onDraggingChange(true)
onPointerMove ×N
onScrub ×N  →  onChange / onValueChange(v, 'scrub') as each detent is crossed
onPointerUp
onDraggingChange(false)
onCommit(10, 'scrub')
onScrub ×N   (settle animation)
onScrubEnd({ delta: -2 })
```

**Tapping the up arrow**

```
onPointerDown
onScrubStart({ target: 'arrow-up' })
onDraggingChange(true)
onPointerUp
onDraggingChange(false)
onChange / onValueChange(13, 'arrow') / onCommit(13, 'arrow')
onArrowClick('up', 13)
```

---

## Full TypeScript surface

Everything above is exported as one interface:

```ts
import type {
  ScrollComponentEvents,
  ChangeSource,
  ScrubTarget,
  ScrubEventMeta,
} from '@jugaaadi/advance-scroll-input';
```

`ScrollComponentEvents` is extended by `DraggableNumberInputProps`, which is in
turn extended by `DimensionInputProps` — so a single `Omit<>` or `Pick<>` gets
you any subset when wrapping the component in your own design system.

## Seeing it live

`npm run dev` opens a demo with a scrolling log wired to nearly every handler
here. Drag, tap, type, and watch the order events actually arrive in.
