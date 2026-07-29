import * as React from 'react';
import { useRef } from 'react';
import type { ScrubberState } from './useScrubber';

/**
 * React 18 exposes `useId`; fall back to a module counter on React 17 so the
 * package keeps its `react >= 17` peer range.
 */
let idCounter = 0;
const useUniqueId = (): string => {
  const reactUseId = (React as unknown as { useId?: () => string }).useId;
  if (reactUseId) return reactUseId().replace(/:/g, '');
  const ref = useRef<string>();
  if (!ref.current) ref.current = `sc${++idCounter}`;
  return ref.current;
};

/**
 * Every colour is applied through `style`, never through an SVG presentation
 * attribute — `var()` is only resolved in CSS property values, so
 * `fill="var(--x)"` silently fails while `style={{ fill: 'var(--x)' }}` works.
 */
const v = (name: string, fallback: string) => `var(${name}, ${fallback})`;

export interface RollerIconProps {
  state: ScrubberState;
  showArrows?: boolean;
  /** One detent in px — must match the scrubber's `pixelsPerTick`. */
  pixelsPerTick?: number;
  getArrowProps: (direction: 'up' | 'down') => Record<string, unknown>;
  /**
   * Knurling line colours, front to back. Overrides the direction-aware
   * defaults (`--sc-line-*`, `--sc-line-up-*`, `--sc-line-down-*`).
   */
  lineColors?: [string, string, string];
}

/** Picks an up / down / resting value based on travel direction. */
const byDirection = <T,>(direction: 'up' | 'down' | null, up: T, down: T, rest: T): T =>
  direction === 'up' ? up : direction === 'down' ? down : rest;

/**
 * The vertical roller: a knurled wheel whose lines rotate with the drag, with
 * optional tap-arrows above and below. Purely presentational — all gesture
 * handling lives in `useScrubber`.
 *
 * The active **up** arrow is green and the active **down** arrow amber, so the
 * direction of travel reads at a glance. Both are overridable.
 */
export const RollerIcon: React.FC<RollerIconProps> = ({
  state,
  showArrows = true,
  pixelsPerTick = 6,
  getArrowProps,
  lineColors,
}) => {
  const uid = useUniqueId();
  const gradientId = `sc-roller-gradient-${uid}`;
  const glowId = `sc-roller-glow-${uid}`;
  const clipId = `sc-roller-clip-${uid}`;

  const { isDragging, visualPhase, isDraggingUp, isDraggingDown, hoveredArrow, direction } = state;

  const rollerColor = isDragging
    ? v('--sc-roller-active', '#22d3ee')
    : v('--sc-roller-idle', '#0ea5e9');
  // A light inner face keeps the dark knurling lines readable.
  const rollerFace = isDragging
    ? v('--sc-roller-face-active', '#ffffff')
    : v('--sc-roller-face', '#f8fafc');

  // While travelling, the rim, glow and knurling all take the direction's
  // colour — green going up, orange going down — so the whole control
  // answers "which way am I moving?" without reading the number.
  const gradFrom = byDirection(
    direction,
    v('--sc-roller-grad-from-up', '#4ade80'),
    v('--sc-roller-grad-from-down', '#fb923c'),
    v('--sc-roller-grad-from', '#22d3ee'),
  );
  const gradTo = byDirection(
    direction,
    v('--sc-roller-grad-to-up', '#16a34a'),
    v('--sc-roller-grad-to-down', '#ea580c'),
    v('--sc-roller-grad-to', '#3b82f6'),
  );
  const glow = byDirection(
    direction,
    v('--sc-roller-glow-up', '#22c55e'),
    v('--sc-roller-glow-down', '#f97316'),
    v('--sc-roller-glow', '#22d3ee'),
  );

  // Dark shades: the roller face is light, so the lines must stay readable.
  const lines: [string, string, string] =
    lineColors ??
    byDirection(
      direction,
      [
        v('--sc-line-up-1', '#14532d'), // green-900
        v('--sc-line-up-2', '#166534'), // green-800
        v('--sc-line-up-3', '#15803d'), // green-700
      ],
      [
        v('--sc-line-down-1', '#7c2d12'), // orange-900
        v('--sc-line-down-2', '#9a3412'), // orange-800
        v('--sc-line-down-3', '#c2410c'), // orange-700
      ],
      [
        v('--sc-line-1', '#172554'), // blue-950
        v('--sc-line-2', '#022c22'), // emerald-950
        v('--sc-line-3', '#4c0519'), // rose-950
      ],
    );

  const renderArrow = (direction: 'up' | 'down') => {
    const active = direction === 'up' ? isDraggingUp : isDraggingDown;
    const hot = active || hoveredArrow === direction;
    const isUp = direction === 'up';

    // Up is a true green, deliberately far from the roller's cyan on the hue
    // wheel — emerald sat too close to it to read as "green" at this size.
    const hotFill = isUp
      ? v('--sc-arrow-up-active', '#22c55e')
      : v('--sc-arrow-down-active', '#f97316');
    const hotStroke = isUp
      ? v('--sc-arrow-up-active-stroke', '#14532d')
      : v('--sc-arrow-down-active-stroke', '#7c2d12');

    return (
      <path
        d={isUp ? 'M12 0L6 5H18L12 0Z' : 'M12 32L6 27H18L12 32Z'}
        strokeWidth={hot ? 1.5 : 0}
        strokeLinejoin="round"
        style={{
          fill: hot ? hotFill : rollerColor,
          stroke: hot ? hotStroke : 'none',
          opacity: hot
            ? v('--sc-arrow-opacity-active', '1')
            : isDragging
              ? v('--sc-arrow-opacity-dim', '0.3')
              : v('--sc-arrow-opacity', '0.6'),
          transform: hot ? `scale(1.15) translateY(${isUp ? '-1.5px' : '1.5px'})` : 'scale(1)',
          transformOrigin: isUp ? '12px 2.5px' : '12px 29.5px',
          transition: `all ${v('--sc-arrow-transition', '0.15s')} ease-out`,
          pointerEvents: 'none',
        }}
      />
    );
  };

  return (
    <svg
      width="24"
      height="32"
      viewBox="0 0 24 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ overflow: 'visible' }}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="3" y1="8" x2="21" y2="24" gradientUnits="userSpaceOnUse">
          <stop style={{ stopColor: gradFrom }} />
          <stop offset="1" style={{ stopColor: gradTo }} />
        </linearGradient>
        <radialGradient
          id={glowId}
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(12 16) rotate(90) scale(14)"
        >
          <stop style={{ stopColor: glow }} />
          <stop offset="1" style={{ stopColor: glow, stopOpacity: 0 }} />
        </radialGradient>
        <clipPath id={clipId}>
          <rect x="3" y="8" width="18" height="16" rx="6" />
        </clipPath>
      </defs>

      {showArrows && (
        <>
          {renderArrow('up')}
          {renderArrow('down')}

          {/* Invisible hit areas — deliberately larger than the arrows for touch. */}
          <rect
            x="0"
            y="0"
            width="24"
            height="9"
            style={{ fill: 'transparent', cursor: 'pointer', touchAction: 'none' }}
            {...getArrowProps('up')}
          />
          <rect
            x="0"
            y="23"
            width="24"
            height="9"
            style={{ fill: 'transparent', cursor: 'pointer', touchAction: 'none' }}
            {...getArrowProps('down')}
          />
        </>
      )}

      {/* Roller body */}
      <rect
        x="3"
        y="8"
        width="18"
        height="16"
        rx="6"
        strokeWidth={v('--sc-roller-border-width', '2')}
        style={{ fill: rollerFace, stroke: `url(#${gradientId})` }}
      />

      {/* Knurling lines, scrolling with the drag phase */}
      <g clipPath={`url(#${clipId})`}>
        {(() => {
          const lineSpacing = pixelsPerTick;
          const totalHeight = lineSpacing * 3;
          const phase = visualPhase % totalHeight;
          const normalizedPhase = phase < 0 ? phase + totalHeight : phase;

          return [0, 1, 2].map((i) => {
            let yBase = 16 - lineSpacing + i * lineSpacing + normalizedPhase;

            // Wrap lines around the roller face.
            if (yBase > 16 + lineSpacing * 1.5) {
              yBase -= totalHeight;
            } else if (yBase < 16 - lineSpacing * 1.5) {
              yBase += totalHeight;
            }

            const distFromCenter = Math.abs(yBase - 16);
            const normalizedDist = Math.max(0, 1 - distFromCenter / (lineSpacing * 1.5));

            // Quadratic falloff makes the centre line pop while the edges shrink.
            const scale = normalizedDist * normalizedDist;
            const strokeWidth = 1 + scale * 2.5;
            const xHalfWidth = 1.5 + scale * 3.5; // keeps a gap against the border

            return (
              <line
                key={i}
                x1={12 - xHalfWidth}
                y1={yBase}
                x2={12 + xHalfWidth}
                y2={yBase}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                style={{ stroke: lines[i], opacity: 0.5 + scale * 0.5 }}
              />
            );
          });
        })()}
      </g>

      {isDragging && (
        <circle
          cx="12"
          cy="16"
          r="14"
          style={{ fill: `url(#${glowId})`, opacity: v('--sc-roller-glow-opacity', '0.4') }}
        />
      )}
    </svg>
  );
};
