import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/ui/button';
import { isHomeScreenBuild, requestOfflineStatus, type OfflineStatus } from './offline-client';

function OfflineDownload() {
  const [status, setStatus] = useState<OfflineStatus>();
  const [error, setError] = useState('');
  const [requested, setRequested] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let active = true;
    const serviceWorker = navigator.serviceWorker;
    const check = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        if (active) setError('Offline setup has not responded yet. Check your connection and retry.');
      }, 30_000);
      void requestOfflineStatus('status').catch(err => {
        clearTimeout(timer.current);
        if (active) setError(err instanceof Error ? err.message : String(err));
      });
    };
    const receive = (event: MessageEvent<OfflineStatus>) => {
      if (event.data?.kind !== 'electrical-lab-offline-status') return;
      clearTimeout(timer.current);
      setError(event.data.message ?? '');
      setRequested(false);
      setStatus(event.data);
    };
    const refreshWhenVisible = () => { if (!document.hidden) check(); };
    serviceWorker?.addEventListener('message', receive);
    serviceWorker?.addEventListener('controllerchange', check);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    check();
    return () => {
      active = false;
      clearTimeout(timer.current);
      serviceWorker?.removeEventListener('message', receive);
      serviceWorker?.removeEventListener('controllerchange', check);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, []);

  function download() {
    setRequested(true);
    setError('');
    void navigator.storage?.persist?.().catch(() => false);
    void requestOfflineStatus(status ? 'download' : 'status').catch(err => {
      setRequested(false);
      setError(err instanceof Error ? err.message : String(err));
    });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setRequested(false);
      setError('Offline setup has not responded yet. Check your connection and retry.');
    }, 30_000);
  }

  const downloading = status?.status === 'downloading';
  const ready = status?.status === 'ready';
  const size = status ? ` (about ${Math.ceil(status.bytes / 1_000_000)} MB)` : '';
  const appleMobile = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
  const homeScreen = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & {standalone?:boolean}).standalone;
  return <section className="offline-settings">
    <h3>Offline use</h3>
    {!ready&&<p>Save every course and the Sandbox equipment on this device{size}. Keep the lab open until the download finishes.</p>}
    <div aria-live="polite">
      {ready && <p><strong>Offline ready</strong> · You can open any course and build in Sandbox.</p>}
      {downloading && <p>Downloading equipment… {status.completed} of {status.total}</p>}
      {error && <p>{error}</p>}
    </div>
    {downloading && <progress aria-label="Offline download" value={status.completed} max={status.total} />}
    {!ready && <Button type="button" variant="outline" className="full" disabled={downloading || requested || (!status && !error)} onClick={download}>
      {error ? 'Retry offline download' : downloading ? 'Download in progress' : 'Download for offline use'}
    </Button>}
    <details open={appleMobile&&!homeScreen&&!ready||undefined}><summary>Using the lab on iPhone</summary><p>In Safari, tap Share → Add to Home Screen. Open the new icon before downloading the courses or importing a backup. Safari and the Home Screen app keep their own saves.</p><p>The downloaded models work offline. Go online to load the extra detail on a fitting.</p></details>
  </section>;
}

export default function OfflineSettings() {
  return isHomeScreenBuild() && !import.meta.env.DEV ? <OfflineDownload /> : null;
}
