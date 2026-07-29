/**
 * Unit conversion + dimension parsing.
 *
 * Everything is stored canonically in **millimetres**. The UI converts to the
 * display unit on the way out and back to mm on the way in, so a value never
 * loses precision by round-tripping through a unit the user happens to prefer.
 */

export enum Unit {
  MM = 'mm',
  INCH = 'in',
  FEET = 'ft',
  CM = 'cm',
  DM = 'dm',
  M = 'm',
  PX = 'px',
}

/** Millimetres per one of each unit. `px` assumes the CSS standard 96 DPI. */
export const MM_PER_UNIT: Record<Unit, number> = {
  [Unit.MM]: 1,
  [Unit.CM]: 10,
  [Unit.DM]: 100,
  [Unit.M]: 1000,
  [Unit.INCH]: 25.4,
  [Unit.FEET]: 304.8,
  [Unit.PX]: 25.4 / 96,
};

/** Convert a value expressed in `unit` into millimetres. */
export const toMm = (val: number, unit: Unit): number => {
  if (isNaN(val)) return 0;
  return val * (MM_PER_UNIT[unit] ?? 1);
};

/** Convert millimetres into `unit`. */
export const fromMm = (val: number, unit: Unit): number => {
  if (isNaN(val)) return 0;
  return val / (MM_PER_UNIT[unit] ?? 1);
};

/** Maps every spelling we accept onto its canonical unit. */
const UNIT_ALIASES: Array<[RegExp, string]> = [
  [/\binches\b/g, 'in'],
  [/\binch\b/g, 'in'],
  [/\bfeet\b/g, 'ft'],
  [/\bfoot\b/g, 'ft'],
  [/\bmeters\b/g, 'm'],
  [/\bmeter\b/g, 'm'],
  [/\bcentimeters\b/g, 'cm'],
  [/\bcentimeter\b/g, 'cm'],
  [/\bcentim\b/g, 'cm'],
  [/\bdecimeters\b/g, 'dm'],
  [/\bdecimeter\b/g, 'dm'],
  [/\bmillimeters\b/g, 'mm'],
  [/\bmillimeter\b/g, 'mm'],
  [/\bpixels\b/g, 'px'],
  [/\bpixel\b/g, 'px'],
];

const UNIT_FROM_TOKEN: Record<string, Unit> = {
  mm: Unit.MM,
  cm: Unit.CM,
  dm: Unit.DM,
  m: Unit.M,
  in: Unit.INCH,
  ft: Unit.FEET,
  px: Unit.PX,
};

/**
 * Normalizes a raw string into a lowercase, symbol-free form the parser can
 * walk: `5' 6"` becomes `5ft 6in`, `1 1/2 in` becomes `1.5 in`.
 */
const normalize = (input: string): string => {
  let s = input.trim().toLowerCase().replace(',', '.');

  // Feet/inch marks become word tokens so one regex handles every notation.
  s = s.replace(/'/g, 'ft ').replace(/"/g, 'in ');

  for (const [pattern, replacement] of UNIT_ALIASES) {
    s = s.replace(pattern, replacement);
  }

  // Space-delimited fractions: "1 1/2" -> "1.5"
  s = s.replace(/(\d+)\s+(\d+\/\d+)/g, (_, whole: string, frac: string) => {
    const [n, d] = frac.split('/').map(Number);
    return d ? (parseInt(whole, 10) + n / d).toString() : whole;
  });

  return s;
};

/**
 * Parses a dimension string and returns millimetres.
 *
 * Handles a single value (`10ft`, `123mm`, `45 cm`), symbol notation (`123"`,
 * `123'`), compound values (`5' 6"`, `5ft 6in`), and fractions (`1 1/2 in`,
 * `3/4"`). A bare number is interpreted as `defaultUnit`.
 */
export const parseDimensionToMm = (input: string, defaultUnit: Unit = Unit.MM): number => {
  if (!input || typeof input !== 'string') return 0;

  const clean = normalize(input);
  const partRegex = /([-+\d./]+)\s*(mm|cm|dm|m|in|ft|px)?/g;

  let totalMm = 0;
  let hasValidPart = false;
  let match: RegExpExecArray | null;

  while ((match = partRegex.exec(clean)) !== null) {
    const valStr = match[1];
    const unitStr = match[2];

    let val: number;
    if (valStr.includes('/')) {
      const [n, d] = valStr.split('/').map(Number);
      val = d ? n / d : 0;
    } else {
      val = parseFloat(valStr);
    }

    if (isNaN(val)) continue;
    hasValidPart = true;

    const unit = unitStr ? UNIT_FROM_TOKEN[unitStr] ?? defaultUnit : defaultUnit;
    totalMm += toMm(val, unit);
  }

  return hasValidPart ? totalMm : parseFloat(clean) || 0;
};

/**
 * Detects an explicit unit typed into a dimension string (`10ft`, `5'6"`,
 * `12 cm`). Returns the first unit found, or `null` for a plain number.
 * Mirrors the normalization rules of {@link parseDimensionToMm}.
 */
export const parseUnitFromString = (input: string): Unit | null => {
  if (!input || typeof input !== 'string') return null;

  const clean = normalize(input);
  const match = /(?:^|[\d.\s])(mm|cm|dm|m|in|ft|px)\b/.exec(clean);
  return match ? UNIT_FROM_TOKEN[match[1]] ?? null : null;
};

/** True when the string parses to a real dimension rather than junk. */
export const isParsableDimension = (input: string): boolean => {
  if (!input || !input.trim()) return false;
  return /[\d]/.test(normalize(input));
};

/**
 * Formats millimetres for display in `unit`, trimming floating-point noise
 * (`11.999999999999998` -> `12`).
 */
export const formatFromMm = (valueMm: number, unit: Unit, decimals = 4): number => {
  return parseFloat(fromMm(valueMm, unit).toFixed(decimals));
};
