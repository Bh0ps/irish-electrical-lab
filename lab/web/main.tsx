import { createRoot } from 'react-dom/client';
import Lab from '../components/lab/Lab';
import { registerOfflineWorker } from './offline-client';
import '../app/globals.css';
import '../app/lab.css';
import '../app/simple-lab.css';

const root = createRoot(document.getElementById('app')!);
const probe = document.createElement('canvas').getContext('webgl2');
if (probe) {
  probe.getExtension('WEBGL_lose_context')?.loseContext();
  root.render(<Lab />);
  void registerOfflineWorker().catch(() => {/* Offline settings show a retry action. */});
} else {
  root.render(<main style={{ padding: 'max(24px, env(safe-area-inset-top)) 24px' }}>
    <h1>Irish Electrical Lab</h1>
    <p>The 3D bench needs WebGL 2. On iPhone, open the lab in Safari on iOS 17 or newer.</p>
    <button type="button" onClick={() => window.location.reload()}>Try again</button>
  </main>);
}
