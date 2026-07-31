import React, { useState } from 'react';
import CodeBlock from '@theme/CodeBlock';
import BrowserOnly from '@docusaurus/BrowserOnly';

export type Variant = 'css' | 'tailwind';

export interface DemoProps {
  /** Renders the live demo. Receives the build the visitor selected. */
  children: (variant: Variant) => React.ReactNode;
  /** Short snippet shown under "Code". */
  code: string;
  /** Optional complete file, shown under "Full code". */
  fullCode?: string;
  /** Hide the CSS/Tailwind switch for demos that don't depend on the build. */
  showVariantToggle?: boolean;
  hint?: React.ReactNode;
}

type Tab = 'preview' | 'code' | 'full';

/**
 * Preview / Code / Full code tabs with a CSS-build ↔ Tailwind-build switch.
 *
 * The demo renders the *real* component inline rather than in an iframe or a
 * sandbox, because pointer capture, `touch-action` and the rAF-driven scrub
 * physics all degrade inside one — and those are the whole point of this
 * component.
 *
 * The variant toggle exists so both published entry points are exercised on
 * every page. Without it the Tailwind build would go undemonstrated and could
 * silently drift from the CSS build.
 */
export default function Demo({
  children,
  code,
  fullCode,
  showVariantToggle = true,
  hint,
}: DemoProps) {
  const [tab, setTab] = useState<Tab>('preview');
  const [variant, setVariant] = useState<Variant>('css');

  const tabs: Array<[Tab, string]> = [
    ['preview', 'Preview'],
    ['code', 'Code'],
    ...(fullCode ? ([['full', 'Full code']] as Array<[Tab, string]>) : []),
  ];

  return (
    <div className="demo-card">
      <div className="demo-toolbar">
        <div className="demo-tabs" role="tablist">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              className="demo-tab"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {showVariantToggle && tab === 'preview' && (
          <div className="demo-variant">
            <span>build:</span>
            <button aria-pressed={variant === 'css'} onClick={() => setVariant('css')}>
              CSS
            </button>
            <button aria-pressed={variant === 'tailwind'} onClick={() => setVariant('tailwind')}>
              Tailwind
            </button>
          </div>
        )}
      </div>

      {tab === 'preview' && (
        <div className="demo-stage">
          {/* The component touches window/pointer APIs, so keep it off the
              server render rather than guarding every call site. */}
          <BrowserOnly fallback={<div style={{ height: 60 }} />}>
            {() => <>{children(variant)}</>}
          </BrowserOnly>
          {hint && <div className="demo-hint">{hint}</div>}
        </div>
      )}

      {tab === 'code' && <CodeBlock language="tsx">{code.trim()}</CodeBlock>}
      {tab === 'full' && fullCode && <CodeBlock language="tsx">{fullCode.trim()}</CodeBlock>}
    </div>
  );
}
