import * as React from 'react';
import { forwardRef, useCallback, useMemo } from 'react';
import type { DraggableNumberInputProps, ScrollComponentHandle } from './DraggableNumberInput';
import {
  Unit,
  formatFromMm,
  fromMm,
  isParsableDimension,
  parseDimensionToMm,
  parseUnitFromString,
  toMm,
} from './units';
import { evaluateExpression, isPlainDimension } from './expression';
import type { ChangeSource } from './events';

export interface DimensionInputProps
  extends Omit<
    DraggableNumberInputProps,
    'value' | 'onChange' | 'unit' | 'inspectText' | 'parseValue' | 'resolveText'
  > {
  /** Canonical value, always in millimetres. */
  valueMm: number;
  /** Fires with the new value in millimetres. */
  onChangeMm: (valueMm: number) => void;
  /** The unit the value is displayed and typed in. */
  unit: Unit;
  /** Fires when a value is finalised, in millimetres. */
  onCommitMm?: (valueMm: number, source: ChangeSource) => void;
  /** Decimal places kept when converting mm to the display unit. Default 4. */
  displayDecimals?: number;
  /** Hide the trailing unit suffix in the idle state. */
  hideUnitSuffix?: boolean;
  /**
   * Dimension variables, stored in millimetres and converted into the display
   * unit when a formula uses them. Use `variables` for unitless scalars.
   */
  variablesMm?: Record<string, number>;
  /** `deg` makes sin/cos/tan take degrees in formulas. Default `rad`. */
  angleMode?: 'deg' | 'rad';
}

type BaseComponent = React.ForwardRefExoticComponent<
  DraggableNumberInputProps & React.RefAttributes<ScrollComponentHandle>
>;

/**
 * Builds a millimetre-backed dimension input on top of a numeric-input base,
 * so the CSS and Tailwind builds share one implementation.
 *
 * The returned component stores millimetres but displays and parses in `unit`.
 * It accepts any of these while typing, regardless of the display unit:
 * `123`, `123mm`, `45 cm`, `1m`, `10ft`, `100in`, `123"`, `123'`,
 * `5' 6"`, `5ft 6in`, `1 1/2 in`, `3/4"`, and spelled-out forms
 * (`10 feet`, `2 inches`). A bare number is read as the current unit.
 */
export function createDimensionInput(Base: BaseComponent, displayName: string) {
  const Component = forwardRef<ScrollComponentHandle, DimensionInputProps>(function DimensionInput(
    {
      valueMm,
      onChangeMm,
      unit,
      onCommitMm,
      onValueChange,
      onCommit,
      onUnitDetected,
      displayDecimals = 4,
      hideUnitSuffix = false,
      variables,
      variablesMm,
      angleMode,
      formula = true,
      ...rest
    },
    ref,
  ) {
    // Round on the way out so the field never shows 11.999999999999998.
    const displayValue = useMemo(
      () => formatFromMm(valueMm, unit, displayDecimals),
      [valueMm, unit, displayDecimals],
    );

    const handleChange = useCallback(
      (e: { target: { value: string } }) => {
        const newMm = parseDimensionToMm(e.target.value, unit);
        if (!isNaN(newMm)) onChangeMm(newMm);
      },
      [onChangeMm, unit],
    );

    /**
     * Resolves typed text into display units.
     *
     * Dimension shorthand keeps its historical meaning — `3/4"` is
     * three-quarters of an inch, not a division — so it is routed to the
     * dimension parser. Anything else goes to the expression engine.
     */
    const resolveText = useCallback(
      (text: string) => {
        if (!formula || isPlainDimension(text)) {
          if (!isParsableDimension(text)) return { ok: false, error: 'Not a valid dimension' };
          return { ok: true, value: fromMm(parseDimensionToMm(text, unit), unit) };
        }
        const r = evaluateExpression(text, {
          variables,
          variablesMm,
          displayUnit: unit,
          angleMode,
        });
        return r.ok ? { ok: true, value: r.value } : { ok: false, error: r.error };
      },
      [formula, unit, variables, variablesMm, angleMode],
    );

    const handleCommit = useCallback(
      (value: number, source: ChangeSource) => {
        onCommit?.(value, source);
        // `value` is in display units; convert back for the mm callback.
        onCommitMm?.(toMm(value, unit), source);
      },
      [onCommit, onCommitMm, unit],
    );

    const inspectText = useCallback(
      (text: string) => {
        const detected = parseUnitFromString(text);
        if (detected) onUnitDetected?.(detected, text);
      },
      [onUnitDetected],
    );

    return (
      <Base
        {...rest}
        ref={ref}
        value={displayValue}
        onChange={handleChange}
        unit={hideUnitSuffix ? undefined : unit}
        onValueChange={onValueChange}
        onCommit={handleCommit}
        inspectText={inspectText}
        resolveText={resolveText}
        formula={formula}
        variables={variables}
        knownNames={Object.keys(variablesMm ?? {})}
      />
    );
  });

  Component.displayName = displayName;
  return Component;
}

export { Unit };
