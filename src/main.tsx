import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { startOfflineSync } from "./shared/lib/offline-queue";
import { registerAppServiceWorker } from "./lib/register-sw";
import { initMonitoring, initGlobalErrorHandlers } from "./lib/monitoring";

initMonitoring();
initGlobalErrorHandlers();
startOfflineSync();
void registerAppServiceWorker();

// Browser translation replaces React-owned text nodes and causes the recorded
// removeChild/insertBefore crashes. Include portals mounted outside #root.
document.documentElement.setAttribute('translate', 'no');
document.documentElement.classList.add('notranslate');
const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);
