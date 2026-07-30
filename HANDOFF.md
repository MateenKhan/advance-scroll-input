# Handoff — advance-scroll-input

Context for whoever (human or agent) works on this next. Read this before changing behaviour; several decisions here look arbitrary and are not.

- **npm:** [`@jugaaadi/advance-scroll-input`](https://www.npmjs.com/package/@jugaaadi/advance-scroll-input) — published 2026-07-31, v0.0.1, MIT, zero runtime deps
- **GitHub:** [MateenKhan/advance-scroll-input](https://github.com/MateenKhan/advance-scroll-input)
- **Origin:** extracted from the Open CNC Forge CAD app (`remote_manufacturing`), where the ancestors still live at `src/components/ui/DraggableNumberInput.tsx` and `src/components/ui/DimensionInput.tsx`

---

## 1. The rule that governs every decision

**The users are designers, carpenters and CAD operators — not programmers.**

A wrong-but-believable number is far more dangerous than a visible error, because someone will trust a bad dimension and cut material to it. So anything ambiguous fails loudly instead of guessing.

This is why:

- **No bitwise operators.** `5&3` returning `1` is programmer knowledge; a stray `&` now errors.
- **No `^` or `**`.** Removed on user instruction: *"I have never seen any carpenter or a CAD designer doing 2^3 and expecting 8."* Powers exist as `pow(a,b)` — spelled out, so it reads as what it does.
- **Do not reintroduce punctuation operators by appealing to Excel or calculator convention.** That argument was made for `^` and explicitly rejected.
- Positive-only by default, `max` capped at 9,999,999.

When adding a feature, ask: *would a carpenter predict this behaviour?* If not, it either needs a spelled-out name or it doesn't belong.

---

## 2. Architecture

Logic lives in one headless hook; the visual shells are thin and interchangeable. That is what keeps the CSS and Tailwind builds from drifting.

| File | Responsibility |
| --- | --- |
| `src/useScrubber.ts` | **The engine.** Drag physics, pointer capture, keyboard/wheel stepping, formula draft state, commit/revert, the entire event surface. Returns prop getters. |
| `src/expression/tokenize.ts` | Lexer. Emits tokens covering *every* character including whitespace, so the highlighter can rebuild the source verbatim. Also `matchingParens`. |
| `src/expression/engine.ts` | Pratt parser + evaluator + `evaluateExpression`, `isPlainDimension`, `isFormula`. No `eval()`, ever. |
| `src/units.ts` | mm ↔ unit conversion, `parseDimensionToMm`, unit alias table. |
| `src/RollerIcon.tsx` | The roller SVG. Direction-aware colouring. |
| `src/FormulaHighlight.tsx` | Syntax-colour overlay + validity/revert icons. |
| `src/useResizePin.ts` | Makes `resize` actually work inside a flex row (see §4). |
| `src/DraggableNumberInput.tsx` / `.tw.tsx` | Presentational shells — CSS build and Tailwind build. |
| `src/createDimensionInput.tsx` | Factory wrapping any shell with mm/unit logic. Both `DimensionInput` variants come from it, so the wrapper exists once. |
| `src/scroll-component.css` | 106 custom properties. The CSS build's entire appearance. |

**Values are canonically millimetres.** The display unit is a view concern; `DimensionInput` converts on the way in and out so switching units never loses precision.

---

## 3. Traps that cost real debugging time

Every one of these was hit and fixed. Don't reintroduce them.

### SVG colours must go through `style`, not attributes

`fill="var(--x)"` **does not work** — CSS custom properties aren't resolved in SVG presentation attributes. It fails silently. Everything in `RollerIcon` and `FormulaHighlight` uses `style={{ fill: 'var(--x, #fallback)' }}`. This is also why the Tailwind build looks right without a stylesheet: the fallbacks carry it.

### `resize` is inert on a flex-grow child

Setting `resize: horizontal` inside a flex row does nothing: the browser writes an inline width as you drag, then flex re-expands the element every frame. Fixing it needs a specific order, which is what `useResizePin` does — **measure while still flexing → pin that width → only then set `flex: 0 0 auto`**. Do it in CSS instead and the field starts collapsed to its content width instead of matching its siblings.

### Dimension shorthand vs arithmetic

`3/4"` means three-quarters of an inch, not a division. Text that is *purely* dimension shorthand routes to `parseDimensionToMm`; everything else goes to the expression engine. The classifier is `isPlainDimension`.

**Compound parts join on whitespace only** (`5' 6"`, `1 1/2 in`). A sign between parts is arithmetic. Allowing `[-+]` on trailing parts made `158-9` classify as two dimensions and collapse to `158` via `parseFloat("158-9")` — a shipped bug caught by the user. Regression tests guard this; don't loosen that regex.

### Rejected entries must survive blur

A `useEffect` resyncs `localText` from `value` when focus is lost. It **must** bail when `formulaRef.current.e !== null`, or a rejected entry like `100 *asdf` is silently replaced by the old number and the user loses what they typed.

### Typed text must clamp

Early on, `min`/`max` were enforced on scrub and arrow steps but not on typing or paste — `max={99}` could be defeated by typing `500`. `emitText` now clamps like every other source.

---

## 4. Testing

```bash
npm test        # build + 129 engine assertions
npm run dev     # demo at :5178, with a live event log
npm run typecheck
```

`test/engine.test.mjs` runs against **`dist/`**, i.e. the packaged artifact consumers get. Add assertions there for any parser change. Precedence, associativity, unit routing, error ranges and the `158-9` regression are all covered.

### What is *not* verified

Be honest about this rather than assuming it works:

- **Touch behaviour** was confirmed by the user on a real phone once, before the formula feature landed. The formula overlay has **never** been tested on touch.
- **Caret alignment of the highlight overlay** depends on real font metrics. It was reasoned about, not measured.
- **Scrub-path clamping** could not be driven in automation — Chrome pauses `requestAnimationFrame` when the tab isn't foreground, and the scrub value comes entirely from that loop. It shares the same `clamp()` as the verified paths.

If you have a device, these three are the highest-value things to check.

### Automation gotcha

When driving the demo from a background tab, `rAF` is paused and focus events aren't dispatched. Dispatch `focusin`/`focusout` manually to exercise focus-dependent UI, and don't trust anything that depends on the physics loop.

---

## 5. Releasing

```bash
npm version patch          # never hand-edit the version
npm test
npm publish
```

- Publishing needs a **granular access token with 2FA bypass** (npmjs.com → Access Tokens), scoped read+write on the `jugaaadi` org. Interactive OTP does not work from a non-TTY shell.
- `dist/` is gitignored and built by `prepublishOnly`.
- npm versions are immutable after 72 hours. Fixes ship as a new patch.

---

## 6. Relationship to the CAD app

`remote_manufacturing` still contains the **original** `DraggableNumberInput` / `DimensionInput` under `src/components/ui/`. They are now ancestors, not the same code — this package has diverged substantially (formula engine, direction colouring, validation, resize, 106 theme tokens).

If you fix a bug in one, check whether the other has it. The long-term move is for the CAD app to depend on the published package and delete its local copies, but that migration has not been done.

---

## 7. Open items

- Migrate `remote_manufacturing` onto the published package and remove the duplicated components
- Verify formula overlay + caret alignment on a real touch device
- Sourcemaps are ~500 kB of the 825 kB unpacked size — consider dropping them if size matters
- No CI. A GitHub Action running `npm test` on PRs would be cheap and worthwhile
- `angleMode` is only plumbed through `DimensionInput`, not `DraggableNumberInput`

---

## 8. Docs map

| Doc | Contents |
| --- | --- |
| [README.md](./README.md) | Install, props, 106 theming tokens, touch/responsive notes, disclaimer |
| [FORMULAS.md](./FORMULAS.md) | Operators, precedence, functions, variables, editing behaviour, standalone engine use |
| [EVENTS.md](./EVENTS.md) | ~40 event handlers by category, `ChangeSource`, firing-order traces |
| **HANDOFF.md** | This file — architecture, rationale, traps |
