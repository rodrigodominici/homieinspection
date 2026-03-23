import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export default function Index() {
  const { session, profile, loading, profileLoading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!session) return <Navigate to="/auth" replace />;

  if (profileLoading || (!profile && !profileLoading && loading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="w-full max-w-sm border-0 ring-1 ring-border/50 shadow-lg">
          <CardContent className="py-8 flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground text-sm">Preparando tu cuenta…</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Pending approval or no profile
  if (!profile || profile.role === 'pending' || profile.approval_status !== 'approved') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-sm border-0 ring-1 ring-border/50 shadow-lg">
          <CardContent className="py-8 flex flex-col items-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-status-regular-bg">
              <span className="text-xl">⏳</span>
            </div>
            <p className="font-medium">Tu cuenta está pendiente de aprobación</p>
            <p className="text-sm text-muted-foreground">
              Un administrador revisará tu solicitud y te asignará un rol.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  switch (profile.role) {
    case 'admin':
      return <Navigate to="/admin" replace />;
    case 'inspector':
      return <Navigate to="/inspector" replace />;
    case 'executive':
      return <Navigate to="/executive" replace />;
    default:
      return <Navigate to="/auth" replace />;
  }
}
