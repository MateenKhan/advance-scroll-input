import { Unit } from '../units';

/**
 * Token categories. These drive both parsing and syntax highlighting, so the
 * operator families are split finely enough to colour independently.
 */
export type TokenType =
  | 'number'
  | 'unit'
  | 'ident'
  | 'func'
  | 'op-arith'
  | 'op-relational'
  | 'op-logical'
  | 'op-ternary'
  | 'lparen'
  | 'rparen'
  | 'comma'
  | 'space'
  | 'error';

export interface Token {
  type: TokenType;
  /** Exact source text, so joining every token reproduces the input verbatim. */
  value: string;
  start: number;
  end: number;
  /** Parenthesis nesting depth, 0-based. Set on lparen/rparen for rainbow colouring. */
  depth?: number;
  /** Parsed value, set on number tokens. */
  num?: number;
  /** Unit attached to the preceding number, set on unit tokens. */
  unit?: Unit;
}

/**
 * Unit spellings, longest first so `mm` wins over `m` and `inches` over `in`.
 * Mirrors the aliases understood by `parseDimensionToMm`.
 */
const UNIT_WORDS: Array<[string, Unit]> = [
  ['millimeters', Unit.MM],
  ['millimeter', Unit.MM],
  ['centimeters', Unit.CM],
  ['centimeter', Unit.CM],
  ['decimeters', Unit.DM],
  ['decimeter', Unit.DM],
  ['meters', Unit.M],
  ['meter', Unit.M],
  ['inches', Unit.INCH],
  ['inch', Unit.INCH],
  ['feet', Unit.FEET],
  ['foot', Unit.FEET],
  ['pixels', Unit.PX],
  ['pixel', Unit.PX],
  ['mm', Unit.MM],
  ['cm', Unit.CM],
  ['dm', Unit.DM],
  ['px', Unit.PX],
  ['ft', Unit.FEET],
  ['in', Unit.INCH],
  ['m', Unit.M],
  ['"', Unit.INCH],
  ["'", Unit.FEET],
];

/**
 * Multi-character operators, longest first so `===` beats `==`.
 *
 * Deliberately absent, because this field is used by designers and carpenters
 * rather than programmers:
 *
 * - bitwise `& | ~ << >>` — nobody outside programming reads `5&3` as `1`
 * - exponent `^` and `**` — nobody types `2^3` expecting `8`
 *
 * A stray character producing a plausible-but-wrong number is far worse than
 * a clear "unexpected character" error, so these are rejected outright.
 * `pow(a, b)` covers powers, spelled out. `&&` and `||` remain — those are
 * logical, not bitwise.
 */
const OPERATORS: Array<[string, TokenType]> = [
  ['===', 'op-relational'],
  ['!==', 'op-relational'],
  ['<=', 'op-relational'],
  ['>=', 'op-relational'],
  ['==', 'op-relational'],
  ['!=', 'op-relational'],
  ['&&', 'op-logical'],
  ['||', 'op-logical'],
  ['+', 'op-arith'],
  ['-', 'op-arith'],
  ['*', 'op-arith'],
  ['/', 'op-arith'],
  ['%', 'op-arith'],
  ['<', 'op-relational'],
  ['>', 'op-relational'],
  ['!', 'op-logical'],
  ['?', 'op-ternary'],
  [':', 'op-ternary'],
];

const isDigit = (c: string) => c >= '0' && c <= '9';
const isIdentStart = (c: string) => /[A-Za-z_]/.test(c);
const isIdentChar = (c: string) => /[A-Za-z0-9_]/.test(c);

/**
 * Splits an expression into tokens covering every character of the input,
 * including whitespace and unrecognised text. The highlighter relies on that
 * total coverage to rebuild the source exactly.
 */
export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let depth = 0;

  const push = (t: Token) => tokens.push(t);
  /** The previous meaningful token, ignoring whitespace. */
  const prev = (): Token | undefined => {
    for (let k = tokens.length - 1; k >= 0; k--) {
      if (tokens[k].type !== 'space') return tokens[k];
    }
    return undefined;
  };

  while (i < src.length) {
    const c = src[i];

    // ---- whitespace -----------------------------------------------------
    if (/\s/.test(c)) {
      const start = i;
      while (i < src.length && /\s/.test(src[i])) i++;
      push({ type: 'space', value: src.slice(start, i), start, end: i });
      continue;
    }

    // ---- number ---------------------------------------------------------
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1] ?? ''))) {
      const start = i;
      while (i < src.length && isDigit(src[i])) i++;
      if (src[i] === '.') {
        i++;
        while (i < src.length && isDigit(src[i])) i++;
      }
      // Scientific notation, but only when digits actually follow, so the
      // constant `e` stays usable on its own.
      if ((src[i] === 'e' || src[i] === 'E') && /[+-]?\d/.test(src.slice(i + 1, i + 3))) {
        const save = i;
        i++;
        if (src[i] === '+' || src[i] === '-') i++;
        if (isDigit(src[i])) {
          while (i < src.length && isDigit(src[i])) i++;
        } else {
          i = save;
        }
      }
      const text = src.slice(start, i);
      push({ type: 'number', value: text, start, end: i, num: parseFloat(text) });

      // A unit may follow, optionally separated by spaces.
      const afterSpaces = (() => {
        let k = i;
        while (k < src.length && /[ \t]/.test(src[k])) k++;
        return k;
      })();
      for (const [word, unit] of UNIT_WORDS) {
        const slice = src.slice(afterSpaces, afterSpaces + word.length);
        if (slice.toLowerCase() !== word) continue;
        // Reject `2inx` — a unit must not run into a longer identifier.
        const next = src[afterSpaces + word.length] ?? '';
        if (isIdentChar(next)) continue;
        if (afterSpaces > i) {
          push({ type: 'space', value: src.slice(i, afterSpaces), start: i, end: afterSpaces });
        }
        push({
          type: 'unit',
          value: src.slice(afterSpaces, afterSpaces + word.length),
          start: afterSpaces,
          end: afterSpaces + word.length,
          unit,
        });
        i = afterSpaces + word.length;
        break;
      }
      continue;
    }

    // ---- identifier / function ------------------------------------------
    if (isIdentStart(c)) {
      const start = i;
      while (i < src.length && isIdentChar(src[i])) i++;
      const name = src.slice(start, i);

      // A unit may also trail a closing paren: `(3+2)mm`.
      if (prev()?.type === 'rparen') {
        const hit = UNIT_WORDS.find(([word]) => word === name.toLowerCase());
        if (hit) {
          push({ type: 'unit', value: name, start, end: i, unit: hit[1] });
          continue;
        }
      }

      let k = i;
      while (k < src.length && /\s/.test(src[k])) k++;
      push({ type: src[k] === '(' ? 'func' : 'ident', value: name, start, end: i });
      continue;
    }

    // ---- parentheses -----------------------------------------------------
    if (c === '(') {
      push({ type: 'lparen', value: c, start: i, end: i + 1, depth });
      depth++;
      i++;
      continue;
    }
    if (c === ')') {
      depth = Math.max(0, depth - 1);
      push({ type: 'rparen', value: c, start: i, end: i + 1, depth });
      i++;
      continue;
    }
    if (c === ',') {
      push({ type: 'comma', value: c, start: i, end: i + 1 });
      i++;
      continue;
    }

    // ---- bare unit marks -------------------------------------------------
    // `'` and `"` are units only directly after a value or a closing paren;
    // the number branch above already consumed the common case.
    if (c === '"' || c === "'") {
      const p = prev();
      if (p && (p.type === 'number' || p.type === 'rparen' || p.type === 'ident')) {
        push({
          type: 'unit',
          value: c,
          start: i,
          end: i + 1,
          unit: c === '"' ? Unit.INCH : Unit.FEET,
        });
        i++;
        continue;
      }
    }

    // ---- operators -------------------------------------------------------
    const op = OPERATORS.find(([text]) => src.startsWith(text, i));
    if (op) {
      push({ type: op[1], value: op[0], start: i, end: i + op[0].length });
      i += op[0].length;
      continue;
    }

    // ---- anything else ---------------------------------------------------
    push({ type: 'error', value: c, start: i, end: i + 1 });
    i++;
  }

  return tokens;
}

/** Tokens that matter to the parser — everything except whitespace. */
export const meaningful = (tokens: Token[]): Token[] => tokens.filter((t) => t.type !== 'space');

/**
 * Finds the parenthesis pair to highlight for a caret position: the paren
 * directly before or after the caret, plus its partner. Returns source offsets.
 */
export function matchingParens(tokens: Token[], caret: number): [number, number] | null {
  const parens = tokens.filter((t) => t.type === 'lparen' || t.type === 'rparen');
  const hit = parens.find((t) => t.start === caret || t.end === caret);
  if (!hit) return null;

  if (hit.type === 'lparen') {
    let level = 0;
    for (const t of parens) {
      if (t.start < hit.start) continue;
      if (t.type === 'lparen') level++;
      else if (--level === 0) return [hit.start, t.start];
    }
  } else {
    let level = 0;
    for (let k = parens.length - 1; k >= 0; k--) {
      const t = parens[k];
      if (t.start > hit.start) continue;
      if (t.type === 'rparen') level++;
      else if (--level === 0) return [t.start, hit.start];
    }
  }
  return null;
}
