import { Unit, fromMm, toMm } from '../units';
import { meaningful, tokenize, type Token } from './tokenize';

/* ------------------------------------------------------------------ types */

export interface EvalContext {
  /**
   * Named values usable in expressions. Scalars are used as-is; entries in
   * `variablesMm` are dimensions and get converted into the display unit.
   */
  variables?: Record<string, number>;
  variablesMm?: Record<string, number>;
  /** The unit the result is expressed in. Unit literals convert into it. */
  displayUnit?: Unit;
  /** `deg` makes sin/cos/tan take and return degrees. Default `rad`. */
  angleMode?: 'deg' | 'rad';
}

export interface EvalResult {
  ok: boolean;
  value?: number;
  error?: string;
  /** Source offsets of the offending token, when the failure has a location. */
  errorStart?: number;
  errorEnd?: number;
  tokens: Token[];
}

class ExprError extends Error {
  constructor(
    message: string,
    readonly start?: number,
    readonly end?: number,
  ) {
    super(message);
  }
}

/* -------------------------------------------------------------- built-ins */

const DEG = Math.PI / 180;

/** Arity is checked so `max()` or `sqrt(1,2)` fail loudly rather than silently. */
export const FUNCTIONS: Record<string, { fn: (...a: number[]) => number; min: number; max: number }> = {
  abs: { fn: Math.abs, min: 1, max: 1 },
  sign: { fn: Math.sign, min: 1, max: 1 },
  sqrt: { fn: Math.sqrt, min: 1, max: 1 },
  cbrt: { fn: Math.cbrt, min: 1, max: 1 },
  round: { fn: (x, d = 0) => { const f = 10 ** d; return Math.round(x * f) / f; }, min: 1, max: 2 },
  floor: { fn: Math.floor, min: 1, max: 1 },
  ceil: { fn: Math.ceil, min: 1, max: 1 },
  trunc: { fn: Math.trunc, min: 1, max: 1 },
  min: { fn: (...a) => Math.min(...a), min: 1, max: Infinity },
  max: { fn: (...a) => Math.max(...a), min: 1, max: Infinity },
  clamp: { fn: (x, lo, hi) => Math.min(Math.max(x, lo), hi), min: 3, max: 3 },
  pow: { fn: Math.pow, min: 2, max: 2 },
  hypot: { fn: (...a) => Math.hypot(...a), min: 1, max: Infinity },
  log: { fn: Math.log, min: 1, max: 1 },
  log10: { fn: Math.log10, min: 1, max: 1 },
  log2: { fn: Math.log2, min: 1, max: 1 },
  exp: { fn: Math.exp, min: 1, max: 1 },
  sin: { fn: Math.sin, min: 1, max: 1 },
  cos: { fn: Math.cos, min: 1, max: 1 },
  tan: { fn: Math.tan, min: 1, max: 1 },
  asin: { fn: Math.asin, min: 1, max: 1 },
  acos: { fn: Math.acos, min: 1, max: 1 },
  atan: { fn: Math.atan, min: 1, max: 1 },
  atan2: { fn: Math.atan2, min: 2, max: 2 },
};

const TRIG_IN = new Set(['sin', 'cos', 'tan']);
const TRIG_OUT = new Set(['asin', 'acos', 'atan', 'atan2']);

export const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  PI: Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
};

/* ----------------------------------------------------------------- parser */

/**
 * Binary precedence, higher binds tighter. A subset of JavaScript's — bitwise
 * and exponent operators are intentionally not part of the language here.
 */
const BINARY: Record<string, { prec: number; right?: boolean }> = {
  '||': { prec: 1 },
  '&&': { prec: 2 },
  '==': { prec: 5 },
  '!=': { prec: 5 },
  '===': { prec: 5 },
  '!==': { prec: 5 },
  '<': { prec: 6 },
  '<=': { prec: 6 },
  '>': { prec: 6 },
  '>=': { prec: 6 },
  '+': { prec: 8 },
  '-': { prec: 8 },
  '*': { prec: 9 },
  '/': { prec: 9 },
  '%': { prec: 9 },
};

/** Tightest binding, so `-2*3` is `(-2)*3`. */
const UNARY_PREC = 10;

type Node =
  | { k: 'num'; v: number }
  | { k: 'var'; name: string; tok: Token }
  | { k: 'unary'; op: string; a: Node; tok: Token }
  | { k: 'bin'; op: string; a: Node; b: Node; tok: Token }
  | { k: 'cond'; c: Node; a: Node; b: Node }
  | { k: 'call'; name: string; args: Node[]; tok: Token };

function parse(tokens: Token[], ctx: EvalContext): Node {
  let pos = 0;
  const peek = () => tokens[pos];
  const at = (v: string) => peek()?.value === v;

  const eat = (v: string) => {
    if (!at(v)) {
      const t = peek();
      throw new ExprError(
        t ? `Expected "${v}" but found "${t.value}"` : `Expected "${v}"`,
        t?.start,
        t?.end,
      );
    }
    return tokens[pos++];
  };

  /** Converts a `10ft`-style literal into the field's display unit. */
  const applyUnit = (value: number, unit: Unit): number =>
    fromMm(toMm(value, unit), ctx.displayUnit ?? Unit.MM);

  function parsePrimary(): Node {
    const t = peek();
    if (!t) throw new ExprError('Unexpected end of expression');

    if (t.type === 'number') {
      pos++;
      let value = t.num!;
      const u = peek();
      if (u?.type === 'unit') {
        pos++;
        value = applyUnit(value, u.unit!);

        // `5' 6"` — a feet literal directly followed by an inches literal is
        // one measurement, not two expressions. Same for `5ft 6in`.
        const n = tokens[pos];
        const n2 = tokens[pos + 1];
        if (
          u.unit === Unit.FEET &&
          n?.type === 'number' &&
          n2?.type === 'unit' &&
          n2.unit === Unit.INCH
        ) {
          pos += 2;
          value += applyUnit(n.num!, Unit.INCH);
        }
      }
      return { k: 'num', v: value };
    }

    if (t.type === 'func') {
      pos++;
      eat('(');
      const args: Node[] = [];
      if (!at(')')) {
        args.push(parseTernary());
        while (at(',')) {
          pos++;
          args.push(parseTernary());
        }
      }
      eat(')');
      return { k: 'call', name: t.value, args, tok: t };
    }

    if (t.type === 'ident') {
      pos++;
      return { k: 'var', name: t.value, tok: t };
    }

    if (t.type === 'lparen') {
      pos++;
      const inner = parseTernary();
      eat(')');
      // Allow a unit directly after a group: `(3+2)mm`.
      const u = peek();
      if (u?.type === 'unit') {
        pos++;
        return { k: 'unary', op: `unit:${u.unit}`, a: inner, tok: u };
      }
      return inner;
    }

    if (t.value === '-' || t.value === '+' || t.value === '!') {
      pos++;
      return { k: 'unary', op: t.value, a: parseBinary(UNARY_PREC), tok: t };
    }

    throw new ExprError(`Unexpected "${t.value}"`, t.start, t.end);
  }

  function parseBinary(minPrec: number): Node {
    let left = parsePrimary();
    for (;;) {
      const t = peek();
      if (!t) break;
      const info = BINARY[t.value];
      if (!info || info.prec < minPrec) break;
      pos++;
      const next = info.right ? info.prec : info.prec + 1;
      const right = parseBinary(next);
      left = { k: 'bin', op: t.value, a: left, b: right, tok: t };
    }
    return left;
  }

  function parseTernary(): Node {
    const cond = parseBinary(1);
    if (!at('?')) return cond;
    pos++;
    const a = parseTernary();
    eat(':');
    const b = parseTernary();
    return { k: 'cond', c: cond, a, b };
  }

  const root = parseTernary();
  if (pos < tokens.length) {
    const t = tokens[pos];
    throw new ExprError(`Unexpected "${t.value}"`, t.start, t.end);
  }
  return root;
}

/* -------------------------------------------------------------- evaluator */

function evalNode(n: Node, ctx: EvalContext): number {
  switch (n.k) {
    case 'num':
      return n.v;

    case 'var': {
      const mm = ctx.variablesMm?.[n.name];
      if (mm !== undefined) return fromMm(mm, ctx.displayUnit ?? Unit.MM);
      const plain = ctx.variables?.[n.name];
      if (plain !== undefined) return plain;
      const konst = CONSTANTS[n.name];
      if (konst !== undefined) return konst;
      throw new ExprError(`Unknown variable "${n.name}"`, n.tok.start, n.tok.end);
    }

    case 'unary': {
      if (n.op.startsWith('unit:')) {
        const unit = n.op.slice(5) as Unit;
        return fromMm(toMm(evalNode(n.a, ctx), unit), ctx.displayUnit ?? Unit.MM);
      }
      const a = evalNode(n.a, ctx);
      if (n.op === '-') return -a;
      if (n.op === '+') return a;
      return a ? 0 : 1; // '!'
    }

    case 'bin': {
      const { op } = n;
      // Short-circuit before evaluating the right side, like JavaScript.
      if (op === '&&') {
        const a = evalNode(n.a, ctx);
        return a ? evalNode(n.b, ctx) : a;
      }
      if (op === '||') {
        const a = evalNode(n.a, ctx);
        return a ? a : evalNode(n.b, ctx);
      }
      const a = evalNode(n.a, ctx);
      const b = evalNode(n.b, ctx);
      switch (op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/':
          if (b === 0) throw new ExprError('Division by zero', n.tok.start, n.tok.end);
          return a / b;
        case '%':
          if (b === 0) throw new ExprError('Modulo by zero', n.tok.start, n.tok.end);
          return a % b;
        case '<': return a < b ? 1 : 0;
        case '<=': return a <= b ? 1 : 0;
        case '>': return a > b ? 1 : 0;
        case '>=': return a >= b ? 1 : 0;
        case '==':
        case '===': return a === b ? 1 : 0;
        case '!=':
        case '!==': return a !== b ? 1 : 0;
        default:
          throw new ExprError(`Unsupported operator "${op}"`, n.tok.start, n.tok.end);
      }
    }

    case 'cond':
      return evalNode(n.c, ctx) ? evalNode(n.a, ctx) : evalNode(n.b, ctx);

    case 'call': {
      const spec = FUNCTIONS[n.name];
      if (!spec) throw new ExprError(`Unknown function "${n.name}"`, n.tok.start, n.tok.end);
      if (n.args.length < spec.min || n.args.length > spec.max) {
        const want = spec.max === Infinity ? `at least ${spec.min}` : `${spec.min}`;
        throw new ExprError(
          `${n.name}() expects ${want} argument${spec.min === 1 && spec.max === 1 ? '' : 's'}, got ${n.args.length}`,
          n.tok.start,
          n.tok.end,
        );
      }
      let args = n.args.map((a) => evalNode(a, ctx));
      const deg = ctx.angleMode === 'deg';
      if (deg && TRIG_IN.has(n.name)) args = args.map((x) => x * DEG);
      const out = spec.fn(...args);
      return deg && TRIG_OUT.has(n.name) ? out / DEG : out;
    }
  }
}

/* -------------------------------------------------------------- public API */

/**
 * Matches text that is purely a dimension in the historical shorthand —
 * `123`, `10ft`, `5' 6"`, `1 1/2 in`, `3/4"` — with no expression operators.
 * Those keep their original meaning (`3/4"` is three-quarters of an inch, not
 * a division by four inches).
 */
const NUM = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d*\.?\d+)`;
const UNIT = String.raw`(?:millimeters?|centimeters?|decimeters?|meters?|inch(?:es)?|feet|foot|pixels?|mm|cm|dm|ft|in|px|m|"|')`;
const PART = `${NUM}\\s*${UNIT}?`;

/**
 * Compound parts join on **whitespace only** (`5' 6"`, `5ft 6in`). A sign
 * between parts is arithmetic, never a second measurement — otherwise
 * `158-9` would be read as two dimensions and collapse to 158.
 */
const PLAIN_DIMENSION = new RegExp(`^\\s*[-+]?${PART}(?:\\s+${PART})*\\s*$`, 'i');

/** True when the text should go through the dimension parser, not the engine. */
export const isPlainDimension = (src: string): boolean =>
  src.trim() !== '' && PLAIN_DIMENSION.test(src);

/** True when the text contains anything only the expression engine can handle. */
export const isFormula = (src: string): boolean => src.trim() !== '' && !isPlainDimension(src);

/**
 * Parses and evaluates an expression. Never throws — failures come back as
 * `{ ok: false, error }` with the offending source range where known.
 *
 * Tokens are always returned, even on failure, so the editor can keep
 * highlighting while the user is mid-edit.
 */
export function evaluateExpression(src: string, ctx: EvalContext = {}): EvalResult {
  const tokens = tokenize(src);

  if (!src.trim()) return { ok: false, error: 'Empty expression', tokens };

  try {
    const parsed = parse(meaningful(tokens), ctx);
    const value = evalNode(parsed, ctx);

    if (typeof value !== 'number' || Number.isNaN(value)) {
      return { ok: false, error: 'Result is not a number', tokens };
    }
    if (!Number.isFinite(value)) {
      return { ok: false, error: 'Result is not finite', tokens };
    }
    return { ok: true, value, tokens };
  } catch (err) {
    const e = err as ExprError;
    return {
      ok: false,
      error: e.message || 'Invalid expression',
      errorStart: e.start,
      errorEnd: e.end,
      tokens,
    };
  }
}

/** Names the engine resolves without any caller configuration. */
export const builtinNames = (): string[] => [
  ...Object.keys(FUNCTIONS),
  ...Object.keys(CONSTANTS),
];
