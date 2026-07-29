/**
 * Engine test suite. Run with `npm test` (builds first, then exercises the
 * packaged output — the same artefact consumers get).
 */
import { evaluateExpression, isFormula, isPlainDimension, Unit, tokenize, matchingParens } from '../dist/index.js';

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

/* ------------------------------------------------------------ report */

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log('  ' + f);
  process.exit(1);
}
