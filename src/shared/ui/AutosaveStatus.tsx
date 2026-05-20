import { cn } from "@/lib/utils";
import type { AutosaveStatus as Status } from "@/shared/hooks/useDebouncedAutosave";

const LABEL: Record<Status, string> = {
  idle: "",
  saving: "Guardando…",
  saved: "Guardado automáticamente",
  error: "No se pudo guardar",
};

export function AutosaveStatus({ status, className }: { status: Status; className?: string }) {
  if (status === "idle") return null;
  return (
    <span
      className={cn(
        "text-[10px]",
        status === "error" ? "text-destructive" : "text-muted-foreground",
        className,
      )}
    >
      {LABEL[status]}
    </span>
  );
}
