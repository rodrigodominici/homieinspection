import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initMonitoring, initGlobalErrorHandlers } from "./lib/monitoring";

initMonitoring();
initGlobalErrorHandlers();

createRoot(document.getElementById("root")!).render(<App />);
