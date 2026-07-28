import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';

/**
 * Layout minimalista para el rol Comercial (solo consulta).
 * Header simple con logo + usuario + logout. Sin sidebar ni módulos secundarios.
 */
export default function ComercialLayout({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="h-14 border-b bg-card/80 backdrop-blur-sm px-4 flex items-center justify-between shrink-0 print:hidden">
        <Link to="/comercial" className="flex items-center gap-3 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
            <span className="text-sm font-bold text-primary-foreground">H</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">Homie Inspection</p>
            <p className="text-tiny text-muted-foreground">Comercial · Consulta</p>
          </div>
        </Link>
        <div className="flex items-center gap-3">
          {profile && (
            <span className="text-tiny text-muted-foreground truncate max-w-[200px]">
              {profile.full_name}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-4 w-4 mr-1.5" />
            <span className="hidden sm:inline">Cerrar sesión</span>
          </Button>
        </div>
      </header>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
