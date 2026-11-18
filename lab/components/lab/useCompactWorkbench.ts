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
    const resize = () => {
      style.setProperty('--lab-visible-height', `${viewport.height}px`);
      style.setProperty('--lab-visible-top', `${viewport.offsetTop}px`);
    };
    resize();
    viewport.addEventListener('resize', resize);
    viewport.addEventListener('scroll', resize);
    return () => {
      viewport.removeEventListener('resize', resize);
      viewport.removeEventListener('scroll', resize);
      style.removeProperty('--lab-visible-height');
      style.removeProperty('--lab-visible-top');
    };
  }, [compact]);
  return compact;
}
