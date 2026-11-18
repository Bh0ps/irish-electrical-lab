import { createRoot } from 'react-dom/client';
import Lab from '../components/lab/Lab';
import { registerOfflineWorker } from './offline-client';
import '../app/globals.css';
import '../app/lab.css';
import '../app/simple-lab.css';

const root = createRoot(document.getElementById('app')!);
function hasWorkbenchGraphics() {
  try {
    const probe = document.createElement('canvas').getContext('webgl2');
    probe?.getExtension('WEBGL_lose_context')?.loseContext();
    return Boolean(probe);
  } catch {
    return false;
  }
}
root.render(<Lab startWithList={!hasWorkbenchGraphics()}/>);
if(import.meta.env.PROD)void registerOfflineWorker().catch(() => {/* Offline settings offer a retry. */});
