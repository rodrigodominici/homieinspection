import { AlertTriangle, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBackendHealth } from "@/hooks/useBackendHealth";

/**
 * Fixed banner shown when the backend is unreachable (or the device is offline),
 * so users get a clear message instead of a blank/stuck screen.
 */
export default function BackendStatusBanner() {
  const { health, offline, retry } = useBackendHealth();

  if (health === "ok" && !offline) return null;

  const isOffline = offline;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-3 bg-destructive px-4 py-2 text-sm text-destructive-foreground shadow-md"
    >
      {isOffline ? (
        <WifiOff className="h-4 w-4 shrink-0" />
      ) : (
        <AlertTriangle className="h-4 w-4 shrink-0" />
      )}
      <span className="text-center">
        {isOffline
          ? "Sin conexión a internet. Los cambios se guardarán cuando vuelva la señal."
          : health === "checking"
            ? "Verificando conexión con el servidor…"
            : "Estamos con problemas de conexión al servidor. Reintentando…"}
      </span>
      {!isOffline && (
        <Button
          size="sm"
          variant="secondary"
          className="h-7 shrink-0 px-2"
          onClick={retry}
          disabled={health === "checking"}
        >
          <RefreshCw className={`mr-1 h-3.5 w-3.5 ${health === "checking" ? "animate-spin" : ""}`} />
          Reintentar
        </Button>
      )}
    </div>
  );
}
