import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import InspectorBottomNav from '@/components/InspectorBottomNav';
import { LogOut, User, Mail, Shield } from 'lucide-react';

export default function InspectorProfile() {
  const { profile, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur-sm">
        <div className="flex h-16 items-center px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
              <span className="text-sm font-bold text-primary-foreground">H</span>
            </div>
            <h1 className="text-h4">Perfil</h1>
          </div>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4">
        <Card className="border-0 ring-1 ring-border shadow-sm rounded-2xl">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-7 w-7 text-primary" />
              </div>
              <div>
                <p className="text-h4">{profile?.full_name}</p>
                <p className="text-caption text-muted-foreground capitalize">{profile?.role}</p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-3 text-body text-muted-foreground">
                <Mail className="h-4 w-4" />
                <span>{profile?.email}</span>
              </div>
              <div className="flex items-center gap-3 text-body text-muted-foreground">
                <Shield className="h-4 w-4" />
                <span>{profile?.market ?? 'Sin mercado'}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Button variant="outline" className="w-full h-12 rounded-xl gap-2" onClick={signOut}>
          <LogOut className="h-4 w-4" /> Cerrar Sesión
        </Button>
      </main>
      <InspectorBottomNav />
    </div>
  );
}
