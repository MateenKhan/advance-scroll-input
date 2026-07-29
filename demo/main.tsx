import type * as React from 'react';
import { useCallback, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  DimensionInput,
  DraggableNumberInput,
  Unit,
  fromMm,
  type ChangeSource,
  type ScrollComponentHandle,
} from '../src';
import '../src/scroll-component.css';
import './demo.css';

const UNITS: Unit[] = [Unit.MM, Unit.CM, Unit.M, Unit.INCH, Unit.FEET, Unit.PX];

function App() {
  const [widthMm, setWidthMm] = useState(304.8); // 1 ft
  const [heightMm, setHeightMm] = useState(500);
  const [count, setCount] = useState(12);
  const [offsetMm, setOffsetMm] = useState(-25.4);
  const [areaMm, setAreaMm] = useState(158.333);
  const [unit, setUnit] = useState<Unit>(Unit.MM);
  const [log, setLog] = useState<string[]>([]);
  const handleRef = useRef<ScrollComponentHandle>(null);

  const push = useCallback((event: string, detail: string) => {
    setLog((prev) => [`${event}  ${detail}`, ...prev].slice(0, 200));
  }, []);

  return (
    <>
      <h1>scroll-component</h1>
      <p className="sub">
        Drag the field or the roller vertically to scrub. Tap an arrow to step by one. Click to
        type — units are parsed on the way in.
      </p>

      <div className="layout">
        <div className="panel">
          <h2>Dimension inputs</h2>

          <div className="units">
            {UNITS.map((u) => (
              <button key={u} aria-pressed={unit === u} onClick={() => setUnit(u)}>
                {u}
              </button>
            ))}
          </div>

          <div className="row">
            <label htmlFor="demo-width">Width</label>
            <DimensionInput
              id="demo-width"
              ref={handleRef}
              valueMm={widthMm}
              onChangeMm={setWidthMm}
              unit={unit}
              enableWheel
              onValueChange={(v, s) => push('onValueChange', `${v} (${s})`)}
              onCommit={(v, s) => push('onCommit', `${v} (${s})`)}
              onCommitMm={(mm, s) => push('onCommitMm', `${mm.toFixed(3)}mm (${s})`)}
              onUnitDetected={(u, raw) => push('onUnitDetected', `${u} from "${raw}"`)}
              onParseError={(raw) => push('onParseError', `"${raw}"`)}
              onScrubStart={(m) => push('onScrubStart', `${m.target} / ${m.pointerType}`)}
              onScrubEnd={(m) => push('onScrubEnd', `delta ${m.delta}`)}
              onArrowClick={(d, v) => push('onArrowClick', `${d} -> ${v}`)}
              onFocus={() => push('onFocus', '')}
              onBlur={() => push('onBlur', '')}
              onKeyDown={(e) => push('onKeyDown', e.key)}
              onKeyUp={(e) => push('onKeyUp', e.key)}
              onArrowKey={(d, v) => push('onArrowKey', `${d} -> ${v}`)}
              onHoverChange={(h, t) => push('onHoverChange', `${h ? 'enter' : 'leave'} ${t}`)}
              onClick={() => push('onClick', '')}
              onDoubleClick={() => push('onDoubleClick', '')}
              onClamp={(c, r, b) => push('onClamp', `${r} -> ${c} (${b})`)}
            />
          </div>

          <div className="row">
            <label htmlFor="demo-height">Height</label>
            <DimensionInput
              id="demo-height"
              valueMm={heightMm}
              onChangeMm={setHeightMm}
              unit={unit}
            />
          </div>

          <div className="row">
            <label htmlFor="demo-count">Plain number</label>
            <DraggableNumberInput
              id="demo-count"
              value={count}
              onChange={(e) => setCount(parseFloat(e.target.value) || 0)}
              max={99}
              unit="pcs"
            />
          </div>

          <div className="row">
            <label htmlFor="demo-noroller">No roller</label>
            <DimensionInput
              id="demo-noroller"
              valueMm={heightMm}
              onChangeMm={setHeightMm}
              unit={unit}
              hideRoller
            />
          </div>

          <div className="row">
            <label htmlFor="demo-formula">Formula + vars</label>
            <DimensionInput
              id="demo-formula"
              valueMm={areaMm}
              onChangeMm={setAreaMm}
              unit={unit}
              variables={{ qty: 4 }}
              variablesMm={{ length: 1000, width: 600 }}
              resizable
              onCommit={(v, s) => push('onCommit', `${v} (${s})`)}
              onParseError={(raw) => push('onParseError', `"${raw}"`)}
              onRevert={(v) => push('onRevert', String(v))}
              onDraftValidityChange={(ok, err) => push('onDraftValidity', ok ? 'valid' : `invalid: ${err}`)}
            />
          </div>

          <div className="row">
            <label htmlFor="demo-offset">Offset (± allowed)</label>
            <DimensionInput
              id="demo-offset"
              valueMm={offsetMm}
              onChangeMm={setOffsetMm}
              unit={unit}
              allowNegative
              onClamp={(c, r, b) => push('onClamp', `${r} -> ${c} (${b})`)}
            />
          </div>

          <div className="row">
            <label htmlFor="demo-themed">Themed</label>
            <DimensionInput
              id="demo-themed"
              valueMm={widthMm}
              onChangeMm={setWidthMm}
              unit={unit}
              style={
                {
                  '--sc-bg': '#1a1030',
                  '--sc-border': '#4c1d95',
                  '--sc-border-hover': '#7c3aed',
                  '--sc-accent': '#a78bfa',
                  '--sc-text': '#ede9fe',
                  '--sc-height': '2.25rem',
                  '--sc-radius': '9px',
                  '--sc-roller-idle': '#a78bfa',
                  '--sc-roller-active': '#c4b5fd',
                  '--sc-roller-grad-from': '#c4b5fd',
                  '--sc-roller-grad-to': '#7c3aed',
                  '--sc-roller-face': '#f5f3ff',
                  '--sc-line-1': '#2e1065',
                  '--sc-line-2': '#4c1d95',
                  '--sc-line-3': '#5b21b6',
                } as React.CSSProperties
              }
            />
          </div>

          <div className="readout">
            width = {widthMm.toFixed(3)} mm = {fromMm(widthMm, unit).toFixed(3)} {unit}
            <br />
            height = {heightMm.toFixed(3)} mm · count = {count}
            <br />
            offset = {offsetMm.toFixed(3)} mm (negatives allowed)
          </div>

          <button className="clear" onClick={() => handleRef.current?.focus()}>
            focus width via ref
          </button>{' '}
          <button className="clear" onClick={() => handleRef.current?.stepUp()}>
            stepUp() via ref
          </button>

          <div className="hints" style={{ marginTop: '1rem' }}>
            Dimensions: <code>10ft</code> <code>100in</code> <code>123 mm</code> <code>123"</code>{' '}
            <code>123'</code> <code>5' 6"</code> <code>1 1/2 in</code> <code>45cm</code>{' '}
            <code>2 feet</code> <code>3/4"</code>
            <br />
            Formulas (try the <b>Formula + vars</b> row): <code>100*2</code>{' '}
            <code>(190*120)/144</code> <code>length/2</code> <code>width*qty</code>{' '}
            <code>max(length,width)</code> <code>pow(2,10)</code> <code>1m+500mm</code>{' '}
            <code>length&gt;500?100:50</code> <code>sqrt(pow(3,2)+pow(4,2))</code>
            <br />
            Errors keep the text and offer a revert: <code>100 *asdf</code> <code>199asdf</code>{' '}
            <code>(1+2</code>
          </div>
        </div>

        <div className="panel">
          <h2>Event log</h2>
          <div className="log">
            {log.map((line, i) => {
              const [event, ...detail] = line.split('  ');
              return (
                <div key={i}>
                  <span className="ev">{event}</span> {detail.join('  ')}
                </div>
              );
            })}
          </div>
          <button className="clear" onClick={() => setLog([])}>
            clear
          </button>
        </div>
      </div>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);

// Keep the unused-import checker honest about the type-only import.
export type { ChangeSource };
