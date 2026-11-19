import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../components/ui/button';
import { isHomeScreenBuild, requestOfflineStatus, type OfflineStatus } from './offline-client';

function OfflineDownload() {
  const [status, setStatus] = useState<OfflineStatus>();
  const [error, setError] = useState('');
  const [requested, setRequested] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const request = useRef<symbol | undefined>(undefined);

  const askWorker = useCallback((action: 'status' | 'download') => {
    const ticket = Symbol(action);
    request.current = ticket;
    clearTimeout(timer.current);
    const failed = (message: string) => {
      if (request.current !== ticket) return;
      clearTimeout(timer.current);
      setRequested(false);
      setError(message);
    };
    timer.current = setTimeout(() => failed('The download has stopped responding. Try again to pick up where it left off.'), 30_000);
    void requestOfflineStatus(action).catch(err => failed(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => {
    const serviceWorker = navigator.serviceWorker;
    const check = () => askWorker('status');
    const receive = (event: MessageEvent<OfflineStatus>) => {
      if (event.data?.kind !== 'electrical-lab-offline-status') return;
      if (serviceWorker?.controller && event.source !== serviceWorker.controller) return;
      request.current = undefined;
      clearTimeout(timer.current);
      setError(event.data.message ?? '');
      setRequested(false);
      setStatus(event.data);
      // A phone may stop a worker between two progress messages. Ask the
      // active worker what survived, even if this sheet is still open.
      if (event.data.status === 'downloading') timer.current = setTimeout(check, 8_000);
    };
    const refreshWhenVisible = () => { if (!document.hidden) check(); };
    serviceWorker?.addEventListener('message', receive);
    serviceWorker?.addEventListener('controllerchange', check);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    check();
    return () => {
      request.current = undefined;
      clearTimeout(timer.current);
      serviceWorker?.removeEventListener('message', receive);
      serviceWorker?.removeEventListener('controllerchange', check);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [askWorker]);

  function download() {
    setRequested(true);
    setError('');
    void navigator.storage?.persist?.().catch(() => false);
    askWorker('download');
  }

  const downloading = status?.status === 'downloading' && !error;
  const ready = status?.status === 'ready' && !error;
  const partial = status?.status === 'available' && status.completed > 0;
  const size = status ? ` (about ${Math.ceil(status.bytes / 1_000_000)} MB)` : '';
  const appleMobile = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
  const homeScreen = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & {standalone?:boolean}).standalone;
  return <section className="offline-settings">
    <h3>Offline use</h3>
    {!ready&&<p>Save every course and the Sandbox equipment on this device{size}. Keep the lab open until the download finishes.</p>}
    <div aria-live="polite">
      {ready && <p><strong>Offline ready</strong> · You can open any course and build in Sandbox.</p>}
      {downloading && <p><span className="sr-only">Downloading equipment.</span><span aria-hidden="true">Downloading equipment… {status.completed} of {status.total}</span></p>}
      {partial && !error && <p>{status.completed} of {status.total} files are saved. Resume to get the rest.</p>}
      {error && <p>{error}</p>}
    </div>
    {downloading && <progress aria-label="Offline download" value={status.completed} max={status.total} />}
    {!ready && <Button type="button" variant="outline" className="full" disabled={downloading || requested || (!status && !error)} onClick={download}>
      {error ? 'Retry offline download' : downloading ? 'Download in progress' : partial ? 'Resume download' : 'Download for offline use'}
    </Button>}
    <details open={appleMobile&&!homeScreen&&!ready||undefined}><summary>Using the lab on iPhone</summary><p>In Safari, tap Share → Add to Home Screen. Open the new icon before downloading the courses or importing a backup. Safari and the Home Screen app keep their own saves.</p><p>The downloaded models work offline. Go online to load the extra detail on a fitting.</p></details>
  </section>;
}

export default function OfflineSettings() {
  return isHomeScreenBuild() && !import.meta.env.DEV ? <OfflineDownload /> : null;
}
