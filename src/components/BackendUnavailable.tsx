import { AlertTriangle, LogOut, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Actionable fallback shown when the user's profile cannot be loaded because the
 * backend is unreachable. Replaces the previous infinite loading spinner.
 */
export default function BackendUnavailable() {
  const { retryProfile, profileLoading, signOut } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border-0 ring-1 ring-border/50 bg-card p-8 shadow-lg flex flex-col items-center gap-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <h2 className="text-h3">No pudimos conectar con el servidor</h2>
        <p className="text-caption text-muted-foreground">
          Tu sesión está activa, pero no logramos cargar tus datos. Puede ser una falla temporal
          del servicio o de tu conexión.
        </p>
        <div className="flex w-full flex-col gap-2">
          <Button onClick={retryProfile} disabled={profileLoading} className="w-full h-11">
            <RefreshCw className={`mr-2 h-4 w-4 ${profileLoading ? 'animate-spin' : ''}`} />
            {profileLoading ? 'Reintentando…' : 'Reintentar'}
          </Button>
          <Button variant="outline" onClick={() => void signOut()} className="w-full h-11">
            <LogOut className="mr-2 h-4 w-4" />
            Cerrar sesión
          </Button>
        </div>
      </div>
    </div>
  );
}
