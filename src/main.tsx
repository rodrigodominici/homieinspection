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

createRoot(document.getElementById("root")!).render(<App />);
