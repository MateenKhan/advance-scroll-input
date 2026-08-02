/**
 * Engine test suite. Run with `npm test` (builds first, then exercises the
 * packaged output — the same artefact consumers get).
 */
import { readFileSync } from 'node:fs';
import {
  evaluateExpression,
  isFormula,
  isPlainDimension,
  Unit,
  tokenize,
  matchingParens,
  ROLLER_VIEWBOX,
  ROLLER_BODY,
  ROLLER_BODY_STROKE,
  ROLLER_HIT,
  rollerArrowExtent,
  rollerPaintedExtent,
  rollerFit,
  rollerArrowTapTarget,
} from '../dist/index.js';

let pass = 0;
const failures = [];

const approx = (a, b) => Math.abs(a - b) < 1e-9;

function ok(name, cond, detail = '') {
  if (cond) pass++;
  else failures.push(`${name} ${detail}`);
}

/** Expression evaluates to `want`. */
function evalsTo(src, want, ctx = {}) {
  const r = evaluateExpression(src, ctx);
  ok(
    `eval ${JSON.stringify(src)}`,
    r.ok && approx(r.value, want),
    `-> ${r.ok ? r.value : 'ERR: ' + r.error} (want ${want})`,
  );
}

/** Expression must fail to evaluate. */
function fails(src, ctx = {}) {
  const r = evaluateExpression(src, ctx);
  ok(`reject ${JSON.stringify(src)}`, !r.ok, `-> unexpectedly ok: ${r.value}`);
}

/* ------------------------------------------------- precedence / BODMAS */

evalsTo('1+2*3', 7);
evalsTo('(1+2)*3', 9);
evalsTo('(190*120)/144', 158.33333333333334);
evalsTo('100*2', 200);
evalsTo('2+3*4-6/3', 12);
evalsTo('((2+3)*(4-1))/5', 3);
evalsTo('10-2-3', 5);               // left assoc
evalsTo('100/5/2', 10);             // left assoc
evalsTo('7%3', 1);
evalsTo('-2*3', -6);                // unary binds tightest
evalsTo('2*-3', -6);

/* ---------------------------------------------------------- unary ops */

evalsTo('-5', -5);
evalsTo('--5', 5);
evalsTo('+-5', -5);
evalsTo('!0', 1);
evalsTo('!5', 0);
evalsTo('-(3+4)', -7);

/* ------------------------------------------------ relational / logical */

evalsTo('3>2', 1);
evalsTo('3<2', 0);
evalsTo('3>=3', 1);
evalsTo('2==2', 1);
evalsTo('2!=2', 0);
evalsTo('2===2', 1);
evalsTo('1&&0', 0);
evalsTo('1&&7', 7);
evalsTo('0||9', 9);
evalsTo('1>0 && 2>1', 1);

/* ------------------------------ programmer-only operators stay rejected */
// This field is for designers and carpenters. A stray operator must be a
// visible error, never a plausible-but-wrong number.
fails('5&3');       // XOR/AND would silently give 1
fails('5|3');
fails('1<<3');
fails('16>>2');
fails('~5');
fails('2^3');       // nobody types this expecting 8
fails('2**3');
// Powers are still available, spelled out.
evalsTo('pow(2,3)', 8);
evalsTo('sqrt(81)', 9);

/* --------------------------------------------------------- ternary */

evalsTo('1?10:20', 10);
evalsTo('0?10:20', 20);
evalsTo('3>2?100:200', 100);
evalsTo('0?1:0?2:3', 3);            // nested, right assoc

/* -------------------------------------------------------- functions */

evalsTo('max(3,9,2)', 9);
evalsTo('min(3,9,2)', 2);
evalsTo('abs(-7)', 7);
evalsTo('sqrt(16)', 4);
evalsTo('round(2.567,2)', 2.57);
evalsTo('round(2.5)', 3);
evalsTo('floor(2.9)', 2);
evalsTo('ceil(2.1)', 3);
evalsTo('clamp(15,0,10)', 10);
evalsTo('pow(2,10)', 1024);
evalsTo('hypot(3,4)', 5);
evalsTo('max(1,2)*3', 6);
evalsTo('sqrt(pow(3,2)+pow(4,2))', 5);
evalsTo('sin(0)', 0);
evalsTo('sin(90)', 1, { angleMode: 'deg' });
evalsTo('cos(0)', 1);
evalsTo('pi', Math.PI);
evalsTo('2*pi', Math.PI * 2);

fails('max()');
fails('sqrt(1,2)');
fails('nope(1)');

/* -------------------------------------------------------- variables */

const vars = { variables: { length: 10, qty: 3 } };
evalsTo('100 * length', 1000, vars);
evalsTo('length*qty', 30, vars);
evalsTo('(length+qty)*2', 26, vars);
fails('100 * width', vars);

// Dimension variables are stored in mm and converted to the display unit.
evalsTo('width', 100, { variablesMm: { width: 100 }, displayUnit: Unit.MM });
evalsTo('width', 10, { variablesMm: { width: 100 }, displayUnit: Unit.CM });
evalsTo('width*2', 20, { variablesMm: { width: 100 }, displayUnit: Unit.CM });

/* ------------------------------------------------------------ units */

evalsTo('10ft', 3048, { displayUnit: Unit.MM });
evalsTo('10ft', 10, { displayUnit: Unit.FEET });
evalsTo('100in', 2540, { displayUnit: Unit.MM });
evalsTo('1m+500mm', 1500, { displayUnit: Unit.MM });
evalsTo('2ft*3', 1828.8, { displayUnit: Unit.MM });
evalsTo('(3+2)mm', 5, { displayUnit: Unit.MM });
evalsTo('10 ft', 3048, { displayUnit: Unit.MM });
evalsTo('1m/2', 500, { displayUnit: Unit.MM });

/* ------------------------------------------- plain-dimension routing */

// These keep their historical meaning and must NOT be treated as formulas.
for (const s of ['123', '10ft', '123"', "123'", "5' 6\"", '1 1/2 in', '3/4"', '45 cm', '2 feet']) {
  ok(`plain ${JSON.stringify(s)}`, isPlainDimension(s) && !isFormula(s), '-> classified as formula');
}
for (const s of ['100*2', '(1+2)*3', '100 * length', 'pow(2,3)', 'max(1,2)', '1>2']) {
  ok(`formula ${JSON.stringify(s)}`, isFormula(s), '-> classified as plain dimension');
}

// Regression: a sign between parts is arithmetic, not a compound dimension.
// `158-9` used to classify as plain, hit parseFloat("158-9") and give 158.
for (const s of ['158-9', '158 - 9', '158-9mm', '1m+500mm', '10ft-2in', '5+5', '100-1']) {
  ok(`infix sign is a formula ${JSON.stringify(s)}`, isFormula(s), '-> read as a dimension');
}
evalsTo('158-9', 149);
evalsTo('158 - 9', 149);
evalsTo('158-9mm', 149, { displayUnit: Unit.MM });
evalsTo('100-1', 99);
evalsTo('10ft-2in', 2997.2, { displayUnit: Unit.MM });
// ...while whitespace-joined compounds stay dimensions.
for (const s of ["5' 6\"", '5ft 6in', '1 1/2 in']) {
  ok(`whitespace compound stays plain ${JSON.stringify(s)}`, isPlainDimension(s), '-> became a formula');
}

// `5' 6"` still sums when it does reach the engine.
evalsTo(`5' 6"`, 1676.4, { displayUnit: Unit.MM });
evalsTo('5ft 6in', 1676.4, { displayUnit: Unit.MM });

/* ------------------------------------------------------ error cases */

fails('100 *');
fails('100 *asdf');
fails('199asdf');
fails('(1+2');
fails('1+2)');
fails('');
fails('   ');
fails('1/0');
fails('*5');
fails('1++');
fails('@@@');
fails('()');

// Errors carry a source range where one is known.
const bad = evaluateExpression('100 * nope');
ok('error has range', bad.errorStart === 6 && bad.errorEnd === 10, `-> ${bad.errorStart},${bad.errorEnd}`);

/* ------------------------------------------------------- tokenizer */

const toks = tokenize('(190*120)/144');
ok('tokens round-trip', toks.map((t) => t.value).join('') === '(190*120)/144');
ok('paren depth', toks[0].depth === 0 && toks[toks.length - 3].depth === 0);

const nested = tokenize('((1+2)*3)');
ok('nested depth', nested.filter((t) => t.type === 'lparen').map((t) => t.depth).join(',') === '0,1');

ok('match at open', JSON.stringify(matchingParens(tokenize('(1+2)'), 0)) === '[0,4]');
ok('match at close', JSON.stringify(matchingParens(tokenize('(1+2)'), 5)) === '[0,4]');
ok('no match', matchingParens(tokenize('1+2'), 1) === null);

const mixed = tokenize('1+2>3&&4');
ok(
  'operator families',
  mixed.filter((t) => t.type.startsWith('op-')).map((t) => t.type).join(',') ===
    'op-arith,op-relational,op-logical',
  '-> ' + mixed.filter((t) => t.type.startsWith('op-')).map((t) => t.type).join(','),
);

// A stray bitwise character tokenizes as an error, so it highlights red.
ok('stray & is an error token', tokenize('5&3').some((t) => t.type === 'error'));

/* ==================================================================
 * ROLLER GEOMETRY — the graphic stays inside the box it was given
 * ==================================================================
 *
 * The defect this section is the receipt for, reported by a consumer stacking
 * two fields in adjacent rows: **the lower field's up-arrow painted on top of
 * the upper field's down-arrow.**
 *
 * Three separate escape routes, all of them silent:
 *
 *   1. `<svg width="24" height="32">` is an intrinsic 32 CSS px whatever the
 *      container measures, while `.sc-roller` was `height: var(--sc-height)`.
 *      At `--sc-height: 1.35rem` that is a 32px drawing in a 21.6px box —
 *      5.2px of bleed at the top and the bottom, at rest, always.
 *   2. `overflow: visible` let it out.
 *   3. the hovered arrow's `scale(1.15) translateY(±1.5px)` plus a 1.5-unit
 *      stroke reached y = -2.96 and y = 34.96, outside a 0…32 viewBox even at
 *      full size; the drag glow's `r = 14` reached x = -2 and x = 26.
 *
 * So the assertions below are: (a) nothing is painted outside the viewBox in
 * ANY state, (b) the fitted graphic never exceeds the roller's box over a swept
 * range of box sizes, and (c) the arrow tap target survives at coarse-pointer
 * sizes — because the fix removed the `scale(1.15)` that used to grow it.
 *
 * Every number is recomputed from `rollerGeometry`, which is the same module
 * `RollerIcon` draws from, so a changed path moves the assertion with it.
 */

const VB = ROLLER_VIEWBOX;
const inside = (box, eps = 1e-9) =>
  box.minX >= VB.x - eps &&
  box.minY >= VB.y - eps &&
  box.maxX <= VB.x + VB.width + eps &&
  box.maxY <= VB.y + VB.height + eps;
const show = (b) =>
  `x ${b.minX.toFixed(3)}…${b.maxX.toFixed(3)}, y ${b.minY.toFixed(3)}…${b.maxY.toFixed(3)}`;

/* --- (a) every state's painted extent is inside the viewBox --- */

for (const showArrows of [true, false]) {
  const box = rollerPaintedExtent({ showArrows });
  ok(
    `painted extent inside viewBox (arrows: ${showArrows})`,
    inside(box),
    `-> ${show(box)} vs viewBox 0,0 ${VB.width}x${VB.height}`,
  );
}

for (const direction of ['up', 'down']) {
  for (const hot of [false, true]) {
    const box = rollerArrowExtent(direction, hot);
    ok(`${direction} arrow ${hot ? 'hot' : 'rest'} inside viewBox`, inside(box), `-> ${show(box)}`);
  }
}

/* The hot arrow must also clear the pill it sits beside, or the "pop" lands on
   the rim. The pill's stroke is centred on its edge, so half of it bleeds. */
const pillTop = ROLLER_BODY.y - ROLLER_BODY_STROKE / 2;
const pillBottom = ROLLER_BODY.y + ROLLER_BODY.height + ROLLER_BODY_STROKE / 2;
ok(
  'hot up arrow clears the pill',
  rollerArrowExtent('up', true).maxY <= pillTop,
  `-> ${rollerArrowExtent('up', true).maxY.toFixed(3)} vs pill top ${pillTop}`,
);
ok(
  'hot down arrow clears the pill',
  rollerArrowExtent('down', true).minY >= pillBottom,
  `-> ${rollerArrowExtent('down', true).minY.toFixed(3)} vs pill bottom ${pillBottom}`,
);

/* Symmetry: the two arrows are mirrors, so a change to one that misses the
   other shows up here rather than on screen. */
{
  const up = rollerArrowExtent('up', true);
  const down = rollerArrowExtent('down', true);
  ok(
    'arrows are mirror images',
    approx(up.minY, VB.height - down.maxY) && approx(up.maxY, VB.height - down.minY),
    `-> up ${show(up)}, down ${show(down)}`,
  );
}

/* --- (b) the fitted graphic never exceeds the roller's box --- *
 *
 * Swept, not spot-checked: `--sc-height` is a consumer token and the reported
 * bug happened at a value nobody had tried. 1.35rem (21.6px) is the value that
 * produced the screenshot; 2rem is the package default; 2.75rem is the
 * coarse-pointer default. Every whole pixel from 8 to 80 is swept for both the
 * box's width and its height, which covers all of them.
 */
let fitAssertions = 0;
const escapes = [];
const paintedBox = rollerPaintedExtent();
for (let h = 8; h <= 80; h += 1) {
  for (let w = 8; w <= 80; w += 1) {
    fitAssertions += 1;
    const fit = rollerFit(w, h);
    if (fit.widthPx > w + 1e-9 || fit.heightPx > h + 1e-9) {
      escapes.push(`box ${w}x${h} -> graphic ${fit.widthPx.toFixed(2)}x${fit.heightPx.toFixed(2)}`);
    }
    // The whole point: the drawing's own extent, scaled, is inside the box.
    const paintedH = (paintedBox.maxY - paintedBox.minY) * fit.scale;
    const paintedW = (paintedBox.maxX - paintedBox.minX) * fit.scale;
    if (paintedH > h + 1e-9 || paintedW > w + 1e-9) {
      escapes.push(`box ${w}x${h} -> painted ${paintedW.toFixed(2)}x${paintedH.toFixed(2)}`);
    }
  }
}
ok(
  `graphic fits its box at all ${fitAssertions} swept box sizes`,
  escapes.length === 0,
  `-> ${escapes.length} escapes, first: ${escapes[0] ?? '(none)'}`,
);
ok('the fit sweep was not empty', fitAssertions === 73 * 73, `-> ${fitAssertions}`);

/* The three real token values, named, so a regression reads as itself. */
for (const [label, px] of [
  ['1.35rem — the value in the bug report', 21.6],
  ['2rem — the package default', 32],
  ['2.75rem — the coarse-pointer default', 44],
]) {
  const fit = rollerFit(px, px);
  ok(
    `graphic is contained at ${label}`,
    fit.heightPx <= px + 1e-9 && fit.widthPx <= px + 1e-9,
    `-> ${fit.widthPx.toFixed(2)}x${fit.heightPx.toFixed(2)} in ${px}px`,
  );
}

/* At the 2rem default the drawing is exactly the size it has always been —
   24 x 32 px — so this change costs no existing consumer a pixel. */
{
  const fit = rollerFit(28, 32); // --sc-roller-width 1.75rem, --sc-height 2rem
  ok(
    'default consumer renders the same 24x32 graphic as before',
    approx(fit.widthPx, 24) && approx(fit.heightPx, 32),
    `-> ${fit.widthPx}x${fit.heightPx}`,
  );
}

/* --- (c) the coarse-pointer tap target survives --- *
 *
 * The old `@media (pointer: coarse)` grew the arrows with
 * `transform: scale(1.15)` ON THE SVG, i.e. it bought the tap target with the
 * escape this whole section forbids. The box grows instead, so the target must
 * come out at least as large as it used to be.
 */
{
  const oldScale = 1.15; // the removed --sc-roller-scale-coarse
  const oldTargetH = ROLLER_HIT.height * oldScale; // 32-unit svg, 1px per unit
  const oldTargetW = VB.width * oldScale;
  const now = rollerArrowTapTarget(40, 44); // 2.5rem x 2.75rem, the coarse defaults
  ok(
    'coarse-pointer arrow target is no smaller than the transform it replaces',
    now.heightPx >= oldTargetH && now.widthPx >= oldTargetW,
    `-> ${now.widthPx.toFixed(2)}x${now.heightPx.toFixed(2)} vs ${oldTargetW.toFixed(2)}x${oldTargetH.toFixed(2)}`,
  );
  ok(
    'coarse-pointer arrow target is a real target',
    now.heightPx >= 10 && now.widthPx >= 24,
    `-> ${now.widthPx.toFixed(2)}x${now.heightPx.toFixed(2)}`,
  );
}

/* The arrows are about a quarter of the roller, whatever its size — the
   property a consumer needs in order to choose `--sc-roller-height` for a
   given tap target. */
{
  let ratioAssertions = 0;
  let worst = Infinity;
  for (let px = 16; px <= 64; px += 1) {
    ratioAssertions += 1;
    const t = rollerArrowTapTarget(px, px);
    worst = Math.min(worst, t.heightPx / px);
  }
  ok(
    `arrow target scales with the box across ${ratioAssertions} sizes`,
    ratioAssertions > 0 && worst > 0.2,
    `-> worst ratio ${worst.toFixed(4)}`,
  );
}

/* --- the stylesheet says what this section assumes --- *
 *
 * The arithmetic above is only true if the CSS actually fits the svg to the box
 * and actually contains it. Read it, rather than trusting that it still does:
 * the escape was IN this file for the whole of the component's life.
 */
{
  const css = readFileSync(new URL('../src/scroll-component.css', import.meta.url), 'utf8').replace(/\r/g, '');
  const blockOf = (selector) => {
    const i = css.indexOf(`\n${selector} {`);
    return i === -1 ? null : css.slice(i, css.indexOf('\n}', i));
  };

  const rollerSvg = blockOf('.sc-roller svg');
  ok('.sc-roller svg has a rule', rollerSvg !== null);
  ok(
    '.sc-roller svg is fitted to its box',
    rollerSvg !== null && /width:\s*100%/.test(rollerSvg) && /height:\s*100%/.test(rollerSvg),
    `-> ${JSON.stringify(rollerSvg)}`,
  );
  ok(
    '.sc-roller svg no longer forces overflow: visible',
    rollerSvg !== null && !/overflow:\s*visible/.test(rollerSvg),
  );
  ok(
    'no transform inflates the svg past its box',
    !/\.sc-roller svg\s*\{[^}]*transform:/.test(css),
  );

  const roller = blockOf('.sc-roller');
  ok(
    '.sc-roller takes its height from --sc-roller-height',
    roller !== null && /height:\s*var\(--sc-roller-height\)/.test(roller),
    `-> ${JSON.stringify(roller)}`,
  );

  const root = blockOf('.sc-root');
  for (const [token, expected] of [
    ['--sc-roller-height', 'var(--sc-height)'],
    ['--sc-roller-overflow', 'hidden'],
    ['--sc-roller-arrow-scale', '1'],
  ]) {
    const m = root ? root.match(new RegExp(`${token}:\\s*([^;]+);`)) : null;
    ok(
      `.sc-root declares ${token}: ${expected}`,
      m !== null && m[1].trim() === expected,
      `-> ${m ? m[1].trim() : '(missing)'}`,
    );
  }

  ok(
    'the coarse-pointer block sizes the roller box',
    /@media \(pointer: coarse\)[\s\S]*?--sc-roller-height:\s*var\(--sc-roller-height-coarse/.test(css),
  );
}

/* ------------------------------------------------------------ report */

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log('  ' + f);
  process.exit(1);
}
