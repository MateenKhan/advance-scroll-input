/**
 * THE ROLLER'S GEOMETRY — one description, used by the drawing AND by the test.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------
 *
 * The roller used to paint OUTSIDE its own layout box, and it did so silently:
 *
 *   - `<svg width="24" height="32">` is an intrinsic 32 CSS px **whatever the
 *     container measures**. `.sc-roller` is `height: var(--sc-height)`, so a
 *     consumer at `--sc-height: 1.35rem` (21.6px) got a 32px graphic centred in
 *     a 21.6px box — 5.2px of bleed above and below, every frame, at rest.
 *   - `overflow: visible` let it out.
 *   - the hover/active arrow added `scale(1.15) translateY(±1.5px)` about the
 *     arrow's centre, with a 1.5-unit stroke, taking the tip to y = −2.96 and
 *     y = 34.96 — outside a 0…32 viewBox even at full size.
 *   - the drag glow is `r = 14` about (12, 16): x from −2 to 26, outside a
 *     0…24 viewBox.
 *
 * The consequence was reported by a consumer stacking two fields in adjacent
 * rows: **the lower field's up-arrow landed on the upper field's down-arrow.**
 * No amount of margin fixes that, because the component was not telling the
 * layout how much room it takes.
 *
 * A component that paints outside its bounds cannot be laid out safely. So
 * every coordinate now lives here, the drawing is built from it, and
 * `test/engine.test.mjs` recomputes the painted extent from the same numbers
 * and asserts it stays inside the viewBox — at rest, hovered, and pressed.
 * Change a path and the test re-derives; it cannot go stale.
 *
 * ---------------------------------------------------------------------------
 * THE ONE RULE
 * ---------------------------------------------------------------------------
 *
 * **Nothing may be drawn outside `ROLLER_VIEWBOX`.** The viewBox is the
 * component's promise about its own size; `.sc-roller svg` is sized to the
 * roller's box (`width: 100%; height: 100%`), so 32 view units always mean
 * exactly `--sc-roller-height` CSS px and the graphic can never be bigger than
 * the box it was given.
 *
 * That constraint is what shapes the arrow numbers below. The arrows used to
 * start at the very edge (tip at y = 0) with a stroke and an outward lift on
 * top, which is unrepresentable inside the box; they now start 1.4 units in,
 * which is the room the hover pop and its stroke need. The resting drawing is
 * otherwise unchanged, and at the default `--sc-height: 2rem` (32px) the
 * rendered graphic is the same size it has always been.
 */

/** The drawing's coordinate space. Nothing may be painted outside it. */
export const ROLLER_VIEWBOX = { x: 0, y: 0, width: 24, height: 32 } as const;

/** The pill. `strokeWidth` is centred on the edge, so it bleeds half outward. */
export const ROLLER_BODY = { x: 3, y: 8, width: 18, height: 16, rx: 6 } as const;

/** Default `--sc-roller-border-width`, in view units. */
export const ROLLER_BODY_STROKE = 2;

/**
 * The up arrow, in view units. The down arrow is its mirror about the viewBox's
 * horizontal centre line, so there is one set of numbers, not two.
 *
 * `tip` is 1.4 rather than 0: see the header. It is the smallest inset that
 * keeps the pressed arrow — scaled, lifted and stroked — inside the viewBox,
 * with roughly a quarter of a unit to spare at both ends.
 */
export const ROLLER_ARROW = {
  centreX: 12,
  /** Nearest the outer edge. */
  tip: 1.4,
  /** Nearest the pill. */
  base: 6,
  /** Half the base's width. */
  halfWidth: 6,
} as const;

/** How much the arrow grows while hovered or pressed. */
export const ROLLER_ARROW_POP = 1.15;

/** How far it lifts away from the pill while hovered or pressed, in view units. */
export const ROLLER_ARROW_LIFT = 0.2;

/** The outline it gains while hot. Centred on the path: half of it bleeds out. */
export const ROLLER_ARROW_HOT_STROKE = 1;

/**
 * The invisible tap targets, deliberately larger than the arrows themselves.
 *
 * `height` view units at the top and the same at the bottom, full width. They
 * stop short of the pill so a press near the middle is still a scrub, not a
 * step — `ROLLER_HIT.height` + the gap to `ROLLER_BODY.y` is why the number is
 * 9 and not more.
 */
export const ROLLER_HIT = { height: 9 } as const;

/**
 * The drag glow. `r` is what is PAINTED; `falloff` is the radial gradient's own
 * scale, so the colour ramp is unchanged and only its transparent fringe is
 * given up — at r = 12 the gradient is already down to (1 − 12/14) ≈ 14% of a
 * 0.4-opacity fill, which is under 6% and not visible.
 *
 * It was `r = 14`, which put the glow 2 units outside the viewBox on both
 * sides. That is the whole reason `overflow: visible` was there.
 */
export const ROLLER_GLOW = { cx: 12, cy: 16, r: 12, falloff: 14 } as const;

/** A box in view units. */
export interface RollerBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** The up arrow's mirror, about the viewBox's horizontal centre line. */
const mirrorY = (y: number): number => ROLLER_VIEWBOX.y * 2 + ROLLER_VIEWBOX.height - y;

/** The `d` for one arrow, derived from `ROLLER_ARROW` so the test and the DOM agree. */
export function rollerArrowPath(direction: 'up' | 'down'): string {
  const { centreX, tip, base, halfWidth } = ROLLER_ARROW;
  const t = direction === 'up' ? tip : mirrorY(tip);
  const b = direction === 'up' ? base : mirrorY(base);
  return `M${centreX} ${t}L${centreX - halfWidth} ${b}H${centreX + halfWidth}L${centreX} ${t}Z`;
}

/** The origin the hot transform scales and lifts about — the arrow's own centre. */
export function rollerArrowOrigin(direction: 'up' | 'down'): { x: number; y: number } {
  const { centreX, tip, base } = ROLLER_ARROW;
  const mid = (tip + base) / 2;
  return { x: centreX, y: direction === 'up' ? mid : mirrorY(mid) };
}

/**
 * The hot arrow's CSS `transform`, as a string.
 *
 * `scale(a) scale(b) translateY(t)` composes right-to-left about the origin, so
 * a point `p` lands at `o + a·b·(p − o + t)` — the lift is multiplied by both
 * scales, and so is the stroke. `extentOf()` below does exactly that
 * arithmetic, which is what makes the containment assertion real rather than a
 * restatement of this string.
 */
export function rollerArrowTransform(direction: 'up' | 'down', hot: boolean): string {
  const scale = 'scale(var(--sc-roller-arrow-scale, 1))';
  if (!hot) return scale;
  const lift = direction === 'up' ? -ROLLER_ARROW_LIFT : ROLLER_ARROW_LIFT;
  return `${scale} scale(${ROLLER_ARROW_POP}) translateY(${lift}px)`;
}

/**
 * The box one arrow paints, in view units, including its stroke.
 *
 * `arrowScale` is `--sc-roller-arrow-scale`. Values above 1 are legitimate and
 * are CLIPPED by `--sc-roller-overflow: hidden` rather than allowed to escape —
 * this returns the unclipped extent so a caller can see that it would.
 */
export function rollerArrowExtent(
  direction: 'up' | 'down',
  hot: boolean,
  arrowScale = 1
): RollerBox {
  const { centreX, tip, base, halfWidth } = ROLLER_ARROW;
  const o = rollerArrowOrigin(direction);
  const s = arrowScale * (hot ? ROLLER_ARROW_POP : 1);
  const lift = hot ? (direction === 'up' ? -ROLLER_ARROW_LIFT : ROLLER_ARROW_LIFT) : 0;
  const halfStroke = hot ? (ROLLER_ARROW_HOT_STROKE / 2) * s : 0;

  const at = (y: number) => o.y + s * (y - o.y + lift);
  const ys = direction === 'up' ? [at(tip), at(base)] : [at(mirrorY(tip)), at(mirrorY(base))];
  const xs = [o.x + s * (centreX - halfWidth - o.x), o.x + s * (centreX + halfWidth - o.x)];

  return {
    minX: Math.min(...xs) - halfStroke,
    maxX: Math.max(...xs) + halfStroke,
    minY: Math.min(...ys) - halfStroke,
    maxY: Math.max(...ys) + halfStroke,
  };
}

/** The union of two boxes. */
const union = (a: RollerBox, b: RollerBox): RollerBox => ({
  minX: Math.min(a.minX, b.minX),
  minY: Math.min(a.minY, b.minY),
  maxX: Math.max(a.maxX, b.maxX),
  maxY: Math.max(a.maxY, b.maxY),
});

/**
 * EVERYTHING the roller can paint, in view units, over every state it has:
 * at rest, hovered, pressed, and with the drag glow lit.
 *
 * This is the number that must stay inside `ROLLER_VIEWBOX`. It is computed,
 * not declared, so a change to any coordinate above moves it.
 */
export function rollerPaintedExtent(options: { arrowScale?: number; showArrows?: boolean } = {}): RollerBox {
  const arrowScale = options.arrowScale ?? 1;
  const showArrows = options.showArrows ?? true;

  const half = ROLLER_BODY_STROKE / 2;
  let box: RollerBox = {
    minX: ROLLER_BODY.x - half,
    minY: ROLLER_BODY.y - half,
    maxX: ROLLER_BODY.x + ROLLER_BODY.width + half,
    maxY: ROLLER_BODY.y + ROLLER_BODY.height + half,
  };

  box = union(box, {
    minX: ROLLER_GLOW.cx - ROLLER_GLOW.r,
    minY: ROLLER_GLOW.cy - ROLLER_GLOW.r,
    maxX: ROLLER_GLOW.cx + ROLLER_GLOW.r,
    maxY: ROLLER_GLOW.cy + ROLLER_GLOW.r,
  });

  if (showArrows) {
    for (const direction of ['up', 'down'] as const) {
      for (const hot of [false, true]) {
        box = union(box, rollerArrowExtent(direction, hot, arrowScale));
      }
    }
    // The hit rects are transparent, but they are still part of the graphic's
    // box — and they are the tap target, so they must be inside it too.
    box = union(box, {
      minX: ROLLER_VIEWBOX.x,
      minY: ROLLER_VIEWBOX.y,
      maxX: ROLLER_VIEWBOX.x + ROLLER_VIEWBOX.width,
      maxY: ROLLER_VIEWBOX.y + ROLLER_HIT.height,
    });
    box = union(box, {
      minX: ROLLER_VIEWBOX.x,
      minY: ROLLER_VIEWBOX.y + ROLLER_VIEWBOX.height - ROLLER_HIT.height,
      maxX: ROLLER_VIEWBOX.x + ROLLER_VIEWBOX.width,
      maxY: ROLLER_VIEWBOX.y + ROLLER_VIEWBOX.height,
    });
  }

  return box;
}

/**
 * How the graphic is sized inside `.sc-roller`.
 *
 * The svg is `width: 100%; height: 100%` with the default
 * `preserveAspectRatio="xMidYMid meet"`, so the browser fits the viewBox inside
 * the box and centres it. **BOTH** `--sc-roller-width` and
 * `--sc-roller-height` bound it, which is the whole containment promise: the
 * graphic cannot be wider or taller than the box the layout gave it.
 *
 * Returns the used scale (CSS px per view unit) and the graphic's painted size.
 */
export function rollerFit(boxWidthPx: number, boxHeightPx: number): {
  scale: number;
  widthPx: number;
  heightPx: number;
} {
  const scale = Math.min(boxWidthPx / ROLLER_VIEWBOX.width, boxHeightPx / ROLLER_VIEWBOX.height);
  return {
    scale,
    widthPx: ROLLER_VIEWBOX.width * scale,
    heightPx: ROLLER_VIEWBOX.height * scale,
  };
}

/**
 * One arrow's tap target in CSS px, given the roller's box.
 *
 * This is what `@media (pointer: coarse)` has to keep usable. It used to be
 * grown with `transform: scale(1.15)` on the svg — which made the graphic
 * escape its box, i.e. it bought the tap target with the same defect this file
 * exists to remove. The box itself grows now instead.
 */
export function rollerArrowTapTarget(
  boxWidthPx: number,
  boxHeightPx: number
): { widthPx: number; heightPx: number } {
  const { scale } = rollerFit(boxWidthPx, boxHeightPx);
  return {
    widthPx: ROLLER_VIEWBOX.width * scale,
    heightPx: ROLLER_HIT.height * scale,
  };
}
