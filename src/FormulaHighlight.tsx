import * as React from 'react';
import { matchingParens, tokenize, type Token } from './expression';

export interface FormulaHighlightProps {
  /** Raw source text being edited. */
  text: string;
  /** Caret offset, used to highlight the enclosing parenthesis pair. */
  caret?: number | null;
  /** Names that resolve, so unknown identifiers can be flagged as you type. */
  knownNames?: Set<string>;
  /** Source range of a parse error, underlined in place. */
  errorRange?: [number, number] | null;
  /** Horizontal scroll offset, mirrored from the input. */
  scrollLeft?: number;
  className?: string;
  style?: React.CSSProperties;
}

/** Colours resolve through CSS custom properties, with literal fallbacks so
 *  the Tailwind build (which ships no stylesheet) looks identical. */
const v = (name: string, fallback: string) => `var(${name}, ${fallback})`;

/** How many colours the rainbow-paren cycle uses before repeating. */
const PAREN_COLORS = 4;

const TOKEN_STYLE: Partial<Record<Token['type'], React.CSSProperties>> = {
  number: { color: v('--sc-tok-number', '#e2e8f0') },
  unit: { color: v('--sc-tok-unit', '#38bdf8'), fontStyle: 'italic' },
  func: { color: v('--sc-tok-func', '#c084fc') },
  ident: { color: v('--sc-tok-ident', '#34d399') },
  'op-arith': { color: v('--sc-tok-arith', '#fbbf24') },
  'op-relational': { color: v('--sc-tok-relational', '#f472b6') },
  'op-logical': { color: v('--sc-tok-logical', '#fb923c') },
  'op-ternary': { color: v('--sc-tok-ternary', '#f472b6') },
  error: {
    color: v('--sc-tok-error', '#ef4444'),
    textDecoration: 'underline wavy',
  },
};

const PAREN_FALLBACKS = ['#facc15', '#22d3ee', '#f472b6', '#a3e635'];

const classFor = (t: Token, known?: Set<string>): string => {
  if (t.type === 'lparen' || t.type === 'rparen') {
    return `sc-tok-paren sc-tok-paren-${(t.depth ?? 0) % PAREN_COLORS}`;
  }
  if (t.type === 'ident' && known && !known.has(t.value)) return 'sc-tok-ident sc-tok-unknown';
  if (t.type === 'space') return 'sc-tok-space';
  return `sc-tok-${t.type.replace('op-', '')}`;
};

const styleFor = (t: Token, known?: Set<string>): React.CSSProperties => {
  if (t.type === 'lparen' || t.type === 'rparen') {
    const d = (t.depth ?? 0) % PAREN_COLORS;
    return { color: v(`--sc-paren-${d}`, PAREN_FALLBACKS[d]) };
  }
  if (t.type === 'ident' && known && !known.has(t.value)) {
    return {
      color: v('--sc-tok-unknown', '#ef4444'),
      textDecoration: 'underline wavy',
    };
  }
  return TOKEN_STYLE[t.type] ?? {};
};

/**
 * Read-only coloured mirror of the formula, rendered *behind* a transparent
 * `<input>`. The input keeps native caret, selection, IME and touch
 * behaviour; this layer only paints.
 *
 * Alignment depends on the two sharing font metrics, so everything here is
 * `inherit` — the field wrapper is what sets the font, for both builds.
 */
export const FormulaHighlight: React.FC<FormulaHighlightProps> = ({
  text,
  caret,
  knownNames,
  errorRange,
  scrollLeft = 0,
  className,
  style,
}) => {
  const tokens = React.useMemo(() => tokenize(text), [text]);
  const pair = React.useMemo(
    () => (caret == null ? null : matchingParens(tokens, caret)),
    [tokens, caret],
  );

  return (
    <div
      className={`sc-highlight ${className || ''}`}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        padding: `0 ${v('--sc-padding-x', '0.5rem')}`,
        font: 'inherit',
        letterSpacing: 'inherit',
        whiteSpace: 'pre',
        overflow: 'hidden',
        pointerEvents: 'none',
        border: `${v('--sc-border-width', '1px')} solid transparent`,
        borderRadius: v('--sc-radius', '4px'),
        ...style,
      }}
    >
      <span style={{ transform: `translateX(${-scrollLeft}px)`, whiteSpace: 'pre' }}>
        {tokens.map((t, i) => {
          const matched = pair && (t.start === pair[0] || t.start === pair[1]);
          const inError =
            errorRange && t.start >= errorRange[0] && t.end <= errorRange[1] && t.type !== 'space';
          return (
            <span
              key={i}
              className={[classFor(t, knownNames), matched && 'sc-tok-matched', inError && 'sc-tok-bad']
                .filter(Boolean)
                .join(' ')}
              style={{
                ...styleFor(t, knownNames),
                ...(matched
                  ? {
                      background: v(
                        '--sc-paren-match-bg',
                        'color-mix(in srgb, #06b6d4 35%, transparent)',
                      ),
                      borderRadius: '2px',
                    }
                  : null),
                ...(inError
                  ? { textDecoration: `underline wavy ${v('--sc-invalid', '#ef4444')}` }
                  : null),
              }}
            >
              {t.value}
            </span>
          );
        })}
      </span>
    </div>
  );
};

/** Green tick shown while the draft evaluates cleanly. */
export const ValidIcon: React.FC = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
    <path
      d="M3.5 8.5l3 3 6-6.5"
      fill="none"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ stroke: v('--sc-valid', '#22c55e') }}
    />
  </svg>
);

/** Red no-entry sign shown while the draft cannot be evaluated. */
export const InvalidIcon: React.FC = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
    <circle cx="8" cy="8" r="6" fill="none" strokeWidth="2" style={{ stroke: v('--sc-invalid', '#ef4444') }} />
    <path d="M4.5 8h7" strokeWidth="2" strokeLinecap="round" style={{ stroke: v('--sc-invalid', '#ef4444') }} />
  </svg>
);

/** Counter-clockwise arrow for the revert button. */
export const RevertIcon: React.FC = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
    <path
      d="M3 8a5 5 0 1 0 1.6-3.7M3 2.5V6h3.5"
      fill="none"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ stroke: 'currentColor' }}
    />
  </svg>
);
