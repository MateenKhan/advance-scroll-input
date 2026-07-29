# Formulas

Every input accepts arithmetic, not just numbers. Click the field, put the caret after the value, type `*2`, click away — it becomes `200`.

Formulas are on by default. Turn them off per instance with `formula={false}`.

```tsx
<DimensionInput valueMm={v} onChangeMm={setV} unit={Unit.MM} />
// type: (190*120)/144  ->  158.333
```

## No `eval()`

The engine is a hand-written tokenizer → Pratt parser → evaluator. Nothing is executed as JavaScript, so an input box can never run code. It also means the parser can hand back tokens for syntax highlighting and report *where* an error is, which `eval()` cannot.

Operator precedence is real precedence, not left-to-right: `1+2*3` is `7` and `(1+2)*3` is `9`.

## What you can type

| Kind | Examples |
| --- | --- |
| Plain number | `123`, `.5`, `1e3` |
| Dimension | `10ft`, `123"`, `5' 6"`, `1 1/2 in`, `45cm` |
| Arithmetic | `100*2`, `(190*120)/144`, `10%3` |
| Mixed units | `1m+500mm`, `2ft*3`, `(3+2)mm` |
| Variables | `100 * length`, `width*qty`, `max(length,width)` |
| Functions | `sqrt(pow(3,2)+pow(4,2))`, `round(2.567,2)` |
| Comparison | `length>500`, `a==b` |
| Logical | `a>0 && b>0`, `!0` |
| Conditional | `length>500 ? 100 : 50` |
| Constants | `pi`, `tau`, `e` |

## Operators

Listed loosest-binding first. Within a row, evaluation is left-to-right unless noted.

| Precedence | Operators | Notes |
| --- | --- | --- |
| 1 | `\|\|` | logical or, short-circuits |
| 2 | `&&` | logical and, short-circuits |
| 5 | `==` `!=` `===` `!==` | equality |
| 6 | `<` `<=` `>` `>=` | comparison |
| 8 | `+` `-` | |
| 9 | `*` `/` `%` | |
| 10 | unary `-` `+` `!` | binds tightest |

Comparisons and logic yield `1` or `0`, so they compose with arithmetic: `(a>b)*100`.

### Deliberately unsupported

This field is used by designers, carpenters and CAD operators — not programmers. Operators whose behaviour only a software engineer would predict are **rejected outright** and highlighted red, because a plausible-but-wrong number is far more dangerous than a visible error: someone will trust a bad dimension and cut material to it.

| Not supported | Why |
| --- | --- |
| `&` `\|` `~` `<<` `>>` | Bitwise. Nobody outside programming reads `5&3` as `1`. |
| `^` `**` | Exponent. Nobody types `2^3` expecting `8`. |

Powers are still available, spelled out so they read as what they do:

```
pow(2, 10)     ->  1024
sqrt(81)       ->  9
```

`&&` and `||` remain — those are logical, not bitwise.

## Functions

| Function | Arity | |
| --- | --- | --- |
| `abs` `sign` `sqrt` `cbrt` | 1 | |
| `floor` `ceil` `trunc` | 1 | |
| `round(x)` / `round(x, decimals)` | 1–2 | `round(2.567,2)` → `2.57` |
| `min(...)` `max(...)` `hypot(...)` | 1+ | variadic |
| `clamp(x, lo, hi)` | 3 | |
| `pow(a,b)` `atan2(y,x)` | 2 | |
| `log` `log10` `log2` `exp` | 1 | |
| `sin` `cos` `tan` `asin` `acos` `atan` | 1 | radians by default |

Wrong arity is an error, not a silent `NaN`: `max()` and `sqrt(1,2)` both fail.

Set `angleMode="deg"` to work in degrees — then `sin(90)` is `1`.

Constants: `pi` (also `PI`), `tau`, `e`.

## Variables

Two props, one namespace, because a CAD field has two kinds of named value.

| Prop | Meaning | Used as |
| --- | --- | --- |
| `variables` | unitless scalars — counts, multipliers | the number as given |
| `variablesMm` | dimensions, stored in millimetres | converted into the field's display unit |

```tsx
<DimensionInput
  valueMm={v}
  onChangeMm={setV}
  unit={unit}
  variables={{ qty: 4 }}
  variablesMm={{ length: 1000, width: 600 }}
/>
```

With the field showing **mm**, `length` is `1000`. Switch it to **cm** and the same `length` is `100` — the formula keeps meaning the same physical size. That is the whole point of routing dimensions through `variablesMm`.

`variablesMm` wins if a name appears in both. Unknown names are an error and get a red wavy underline as you type.

`DraggableNumberInput` is unitless, so it only takes `variables`.

## Dimension shorthand still wins

`3/4"` means three-quarters of an inch — not "3 divided by 4 inches". Text that is *purely* dimension shorthand is routed to the dimension parser and keeps its historical meaning:

```
123        10ft       123"      123'
5' 6"      5ft 6in    1 1/2 in  3/4"
45 cm      2 feet
```

Anything containing an operator, parenthesis, function or variable goes to the expression engine. `190/144` gives the same answer either way, so the split is invisible in practice.

## Editing behaviour

**Focus shows the formula, blur shows the value.** Commit `(190*120)/144` and the field reads `158.33 mm`. Click back in and it reads `(190*120)/144` again, so you can edit the formula rather than reverse-engineer it. Scrubbing, arrows or keyboard stepping replace the value and drop the stored formula, since it no longer describes the number.

**The caret lands at the end**, not selecting everything — so clicking a field showing `100` and typing `*2` gives `100*2`. Pass `selectOnFocus` for the old select-all behaviour.

**Live validity while typing:** a green tick when the draft evaluates, a red no-entry sign when it doesn't, plus a matching border. The green is the same `--sc-valid` as the scroll-up arrow. Control it with `feedback`:

| `feedback` | Shows |
| --- | --- |
| `'both'` *(default)* | icon and border |
| `'icon'` | icon only |
| `'border'` | border only |
| `'none'` | neither |

**A rejected entry is never thrown away.** Blur with `100 *asdf` and the field keeps that exact text, turns its border red, and shows a small revert button. The underlying value is untouched. Click revert — or call `ref.current.revert()` — to restore the last good number. Hovering the button shows why it was rejected (`Unknown variable "asdf"`). Hide it with `showRevert={false}`.

## Syntax highlighting

While editing a formula, a coloured mirror renders behind a transparent input. The input keeps native caret, selection, IME and touch behaviour — only the painting is custom.

- Numbers, units, functions, variables and each operator family get their own colour
- Unknown variables get a red wavy underline
- Parentheses are rainbow-coloured by nesting depth, cycling every four levels
- The pair around the caret is highlighted

Disable with `highlight={false}`. Every colour is a CSS variable — see the theming table in the README.

## Validation

| Prop | Default | Effect |
| --- | --- | --- |
| `min` | `0` | Lower bound. See `allowNegative`. |
| `max` | `9999999` | CAD-friendly ceiling. |
| `allowNegative` | `false` | Permit values below zero. |
| `integerOnly` | `false` | Reject fractional results. |
| `validate` | — | `(value) => true \| string`. Return a message to reject. |

Validation runs on the *result*, so it applies identically whether the number was typed, computed, scrubbed or stepped. It also runs on the live draft, so the indicator you see while typing is exactly what commit will do.

```tsx
<DimensionInput
  valueMm={v}
  onChangeMm={setV}
  unit={unit}
  integerOnly
  validate={(n) => (n % 5 === 0 ? true : 'Must be a multiple of 5')}
/>
```

## Using the engine on its own

It has no React dependency.

```ts
import { evaluateExpression, isFormula, tokenize, Unit } from '@jugaaadi/advance-scroll-input';

evaluateExpression('(190*120)/144');
// { ok: true, value: 158.333…, tokens: [...] }

evaluateExpression('10ft + 6in', { displayUnit: Unit.MM });
// { ok: true, value: 3200.4 }

evaluateExpression('100 * length', { variablesMm: { length: 1000 }, displayUnit: Unit.CM });
// { ok: true, value: 10000 }

evaluateExpression('100 * nope');
// { ok: false, error: 'Unknown variable "nope"', errorStart: 6, errorEnd: 10 }
```

`evaluateExpression` never throws. Failures come back as `{ ok: false, error }` with the source range when the failure has a location, which is what drives the inline underline.

Also exported: `isFormula`, `isPlainDimension`, `builtinNames`, `tokenize`, `matchingParens`, `FUNCTIONS`, `CONSTANTS`.

## Events

`onCommit` / `onCommitMm` report the evaluated number. `onParseError` fires with the raw text when a commit is rejected. `onRevert` fires with the restored value. `onDraftValidityChange` fires as the draft flips between valid and invalid while typing. See [EVENTS.md](./EVENTS.md).

## Tested

The engine ships with 115 assertions covering precedence, associativity, unary handling, comparison, logic, ternary nesting, function arity, units, variables, dimension-shorthand routing, error ranges, tokenizer round-tripping and paren matching. Run them with `npm test`.
