import { useEffect, useLayoutEffect, type RefObject } from 'react';

/** `useLayoutEffect` warns during SSR; fall back cleanly on the server. */
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Makes a flex child genuinely user-resizable.
 *
 * `resize` alone does nothing inside a flex row: the browser writes an inline
 * width as you drag, then the flex algorithm immediately re-expands the item
 * to fill the row, so the handle appears dead. Setting `flex: 0 0 auto` up
 * front fixes that but collapses the field to its content width, leaving it
 * narrower than its non-resizable siblings.
 *
 * So do both, in order: measure while the element is still flexing, pin that
 * size, and only then stop it flexing.
 */
export function useResizePin(
  ref: RefObject<HTMLElement | null>,
  resize: 'horizontal' | 'vertical' | 'both' | undefined,
) {
  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!resize || !el) return;

    const box = el.getBoundingClientRect();
    if (resize !== 'vertical' && !el.style.width) el.style.width = `${box.width}px`;
    if (resize !== 'horizontal' && !el.style.height) el.style.height = `${box.height}px`;

    // Now the dragged size is authoritative.
    el.style.flex = '0 0 auto';

    return () => {
      el.style.flex = '';
      el.style.width = '';
      el.style.height = '';
    };
  }, [ref, resize]);
}
