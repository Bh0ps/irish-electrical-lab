import { useEffect, useSyncExternalStore } from 'react';

const compactQuery = '(max-width: 680px), (pointer: coarse) and (max-width: 1100px)';
const snapshot = () => window.matchMedia(compactQuery).matches;
const serverSnapshot = () => false;

function subscribe(onChange: () => void) {
  const query = window.matchMedia(compactQuery);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

export function useCompactWorkbench() {
  const compact = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!compact || !viewport) return;
    const style = document.documentElement.style;
    let pickerSheet: HTMLElement | null = null;
    let frame = 0;
    const position = () => {
      style.setProperty('--lab-visible-height', `${viewport.height}px`);
      style.setProperty('--lab-visible-top', `${viewport.offsetTop}px`);
    };
    const resize = () => {
      position();
      cancelAnimationFrame(frame);
      const search = document.activeElement;
      // The mobile keyboard can cover most of a portrait sheet while the
      // layout viewport and its media queries still report the full height.
      const keyboard = viewport.scale === 1 && window.innerHeight - viewport.height > 100;
      const sheet = keyboard && search?.matches('.point-picker input[type="search"]')
        ? search.closest<HTMLElement>('.context-drawer, .learn-column') : null;
      if (pickerSheet && (!keyboard || !pickerSheet.contains(search))) {
        pickerSheet.removeAttribute('data-picker-keyboard');
        pickerSheet = null;
      }
      if (!sheet || !search) return;
      pickerSheet = sheet;
      sheet.setAttribute('data-picker-keyboard', '');
      frame = requestAnimationFrame(() => {
        const scroll = search.closest<HTMLElement>('.context-content, .learn-column');
        if (!scroll || document.activeElement !== search) return;
        // A house job pins its instruction in place of the normal sheet heading.
        const heading = scroll.querySelector<HTMLElement>('.house-call[data-house-tools] .house-job-heading') ??
          scroll.querySelector<HTMLElement>(':scope > .phone-sheet-heading');
        const top = scroll.getBoundingClientRect().top + (heading?.offsetHeight ?? 0) + 8;
        scroll.scrollTop += search.getBoundingClientRect().top - top;
      });
    };
    resize();
    viewport.addEventListener('resize', resize);
    viewport.addEventListener('scroll', position);
    document.addEventListener('focusin', resize);
    return () => {
      viewport.removeEventListener('resize', resize);
      viewport.removeEventListener('scroll', position);
      document.removeEventListener('focusin', resize);
      cancelAnimationFrame(frame);
      pickerSheet?.removeAttribute('data-picker-keyboard');
      style.removeProperty('--lab-visible-height');
      style.removeProperty('--lab-visible-top');
    };
  }, [compact]);
  return compact;
}
