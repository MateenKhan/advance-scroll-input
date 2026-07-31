import React, { useState } from 'react';
import { DimensionInput, DraggableNumberInput, Unit } from '@jugaaadi/advance-scroll-input';
import { DimensionInputTw, DraggableNumberInputTw } from '@jugaaadi/advance-scroll-input/tailwind';
import type { Variant } from './index';

/**
 * Both published entry points are imported here on purpose. Every demo below
 * renders through whichever the visitor selects, so the two builds are proven
 * equivalent on every page instead of one going untested.
 */
const pick = (v: Variant) =>
  v === 'tailwind'
    ? { Dim: DimensionInputTw, Num: DraggableNumberInputTw }
    : { Dim: DimensionInput, Num: DraggableNumberInput };

const UNITS: Unit[] = [Unit.MM, Unit.CM, Unit.M, Unit.INCH, Unit.FEET];

/** The hero: one field, a unit switcher, and a live readout. */
export function BasicDemo({ variant }: { variant: Variant }) {
  const { Dim } = pick(variant);
  const [widthMm, setWidthMm] = useState(304.8);
  const [unit, setUnit] = useState<Unit>(Unit.MM);

  return (
    <>
      <div className="demo-row">
        <label htmlFor="d-basic">Width</label>
        <Dim id="d-basic" valueMm={widthMm} onChangeMm={setWidthMm} unit={unit} />
      </div>
      <div className="demo-row">
        <label>Unit</label>
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          {UNITS.map((u) => (
            <button
              key={u}
              onClick={() => setUnit(u)}
              style={{
                background: unit === u ? '#0891b2' : '#1e293b',
                border: '1px solid #334155',
                color: '#e2e8f0',
                borderRadius: 6,
                padding: '0.3rem 0.65rem',
                fontSize: '0.8rem',
                cursor: 'pointer',
                minHeight: 34,
              }}
            >
              {u}
            </button>
          ))}
        </div>
      </div>
      <div className="demo-readout">{widthMm.toFixed(3)} mm</div>
    </>
  );
}

/** Formulas, variables and the reject/revert flow. */
export function FormulaDemo({ variant }: { variant: Variant }) {
  const { Dim } = pick(variant);
  const [valueMm, setValueMm] = useState(158.333);

  return (
    <>
      <div className="demo-row">
        <label htmlFor="d-formula">Value</label>
        <Dim
          id="d-formula"
          valueMm={valueMm}
          onChangeMm={setValueMm}
          unit={Unit.MM}
          variables={{ qty: 4 }}
          variablesMm={{ length: 1000, width: 600 }}
        />
      </div>
      <div className="demo-readout">{valueMm.toFixed(3)} mm</div>
    </>
  );
}

/** Validation surface: positive-only default vs opt-in negatives. */
export function ValidationDemo({ variant }: { variant: Variant }) {
  const { Dim, Num } = pick(variant);
  const [posMm, setPosMm] = useState(100);
  const [offsetMm, setOffsetMm] = useState(-25.4);
  const [count, setCount] = useState(12);

  return (
    <>
      <div className="demo-row">
        <label htmlFor="d-pos">Positive only</label>
        <Dim id="d-pos" valueMm={posMm} onChangeMm={setPosMm} unit={Unit.MM} />
      </div>
      <div className="demo-row">
        <label htmlFor="d-neg">allowNegative</label>
        <Dim id="d-neg" valueMm={offsetMm} onChangeMm={setOffsetMm} unit={Unit.MM} allowNegative />
      </div>
      <div className="demo-row">
        <label htmlFor="d-count">integerOnly, max 99</label>
        <Num
          id="d-count"
          value={count}
          onChange={(e) => setCount(parseFloat(e.target.value) || 0)}
          max={99}
          integerOnly
          unit="pcs"
        />
      </div>
      <div className="demo-readout">
        {posMm.toFixed(2)} mm · {offsetMm.toFixed(2)} mm · {count} pcs
      </div>
    </>
  );
}

/** Theming through CSS custom properties. */
export function ThemingDemo({ variant }: { variant: Variant }) {
  const { Dim } = pick(variant);
  const [aMm, setAMm] = useState(250);
  const [bMm, setBMm] = useState(250);

  return (
    <>
      <div className="demo-row">
        <label htmlFor="d-default">Default</label>
        <Dim id="d-default" valueMm={aMm} onChangeMm={setAMm} unit={Unit.MM} />
      </div>
      <div className="demo-row">
        <label htmlFor="d-violet">Themed</label>
        <Dim
          id="d-violet"
          valueMm={bMm}
          onChangeMm={setBMm}
          unit={Unit.MM}
          style={
            {
              '--sc-bg': '#1a1030',
              '--sc-border': '#4c1d95',
              '--sc-border-hover': '#7c3aed',
              '--sc-accent': '#a78bfa',
              '--sc-text': '#ede9fe',
              '--sc-radius': '9px',
              '--sc-height': '2.25rem',
              '--sc-roller-idle': '#a78bfa',
              '--sc-roller-active': '#c4b5fd',
              '--sc-roller-grad-from': '#c4b5fd',
              '--sc-roller-grad-to': '#7c3aed',
              '--sc-roller-face': '#f5f3ff',
            } as React.CSSProperties
          }
        />
      </div>
    </>
  );
}
