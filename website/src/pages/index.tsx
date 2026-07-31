import React from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import BrowserOnly from '@docusaurus/BrowserOnly';
import { BasicDemo } from '@site/src/components/Demo/examples';

const NPM = 'https://www.npmjs.com/package/@jugaaadi/advance-scroll-input';
const GITHUB = 'https://github.com/MateenKhan/advance-scroll-input';

const FEATURES: Array<[string, string]> = [
  ['Roller scrubber', 'Drag the field or the roller to scrub. Physics-based detents mean a value always lands on a whole step.'],
  ['Types like a human', '10ft, 123", 5\' 6", 1 1/2 in, 45cm, 96px. Stored canonically in millimetres, so switching units loses nothing.'],
  ['Formulas, no eval()', '(190*120)/144, 1m+500mm, 100 * length. A real parser with real precedence, live validity and syntax highlighting.'],
  ['Touch-first', 'Pointer capture, 44px targets on coarse pointers, and a vertical drag scrubs instead of scrolling the page.'],
  ['106 CSS variables', 'Every colour, size, weight and timing is a token. Restyle without fighting a single selector.'],
  ['Two builds', 'A plain-CSS build that works anywhere, and a Tailwind build with no stylesheet. Same API.'],
];

export default function Home() {
  return (
    <Layout
      title="A number input that thinks in dimensions"
      description="Touch-friendly React number input with a roller scrubber, unit-aware parsing (10ft, 5' 6&quot;) and a formula engine."
    >
      <header className="hero-banner">
        <h1 style={{ fontSize: 'clamp(1.9rem, 5vw, 3rem)', marginBottom: '0.5rem' }}>
          advance-scroll-input
        </h1>
        <p style={{ fontSize: '1.05rem', color: '#94a3b8', maxWidth: 640, margin: '0 auto' }}>
          A touch-friendly React number input with a roller scrubber, unit-aware parsing and a
          formula engine. Drag it, or just type <code>10ft</code>.
        </p>

        {/* The real component, not a screenshot — grab the roller. */}
        <div className="hero-demo demo-card">
          <div className="demo-stage">
            <BrowserOnly fallback={<div style={{ height: 120 }} />}>
              {() => <BasicDemo variant="css" />}
            </BrowserOnly>
            <div className="demo-hint">
              Drag the roller. Or type <code>10ft</code>, <code>5' 6"</code>,{' '}
              <code>(190*120)/144</code>.
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: '0.75rem',
            justifyContent: 'center',
            marginTop: '2rem',
            flexWrap: 'wrap',
          }}
        >
          <Link className="button button--primary button--lg" to="/docs/intro">
            Get started
          </Link>
          <Link className="button button--secondary button--lg" href={GITHUB}>
            GitHub
          </Link>
          <Link className="button button--secondary button--lg" href={NPM}>
            npm
          </Link>
        </div>

        <p style={{ marginTop: '1.5rem', color: '#64748b', fontSize: '0.85rem' }}>
          <code>npm install @jugaaadi/advance-scroll-input</code>
        </p>
      </header>

      <main className="container margin-vert--xl">
        <div className="row">
          {FEATURES.map(([title, body]) => (
            <div className="col col--4 margin-bottom--lg" key={title}>
              <h3>{title}</h3>
              <p style={{ color: 'var(--ifm-color-emphasis-700)' }}>{body}</p>
            </div>
          ))}
        </div>

        <hr />

        <div className="margin-top--lg">
          <h2>Built for people who cut material</h2>
          <p style={{ maxWidth: 720 }}>
            The audience is designers, carpenters and CAD operators — not programmers. A
            plausible-but-wrong number is far more dangerous than a visible error, because someone
            will trust a bad dimension and cut to it. So the formula engine rejects bitwise
            operators and <code>^</code> outright rather than returning a number nobody expects.
            Powers are <code>pow(2,10)</code>, spelled out.
          </p>
          <p style={{ color: 'var(--ifm-color-emphasis-700)', fontSize: '0.9rem' }}>
            Provided as is, without warranty. Verify your own numbers — this is a UI input, not a
            certified measurement tool.
          </p>
        </div>
      </main>
    </Layout>
  );
}
