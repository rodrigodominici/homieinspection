import { useAuth } from '@/contexts/AuthContext';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import InspectorBottomNav from '@/components/InspectorBottomNav';
import { CheckCircle2, Download, LogOut, Mail, Share2, Shield, Smartphone, User } from 'lucide-react';

export default function InspectorProfile() {
  const { profile, signOut } = useAuth();
  const { canInstall, install, installed, isIOS, isStandalone } = usePWAInstall();

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

        {/* PWA install card — hidden when already running as standalone app */}
        {!isStandalone && (
          <Card className="border-0 ring-1 ring-border shadow-sm rounded-2xl overflow-hidden">
            <CardContent className="p-4">
              {installed ? (
                /* Post-install confirmation */
                <div className="flex items-center gap-3 text-green-600">
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  <div>
                    <p className="text-body font-medium">App instalada</p>
                    <p className="text-caption text-muted-foreground">Ya puedes abrirla desde tu pantalla de inicio</p>
                  </div>
                </div>
              ) : isIOS ? (
                /* iOS Safari — no beforeinstallprompt, show manual steps */
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-primary shrink-0" />
                    <p className="text-body font-medium">Instalar en iPhone / iPad</p>
                  </div>
                  <p className="text-caption text-muted-foreground leading-relaxed">
                    Toca el ícono <Share2 className="inline h-3.5 w-3.5 mx-0.5 align-middle" /> de Safari →&nbsp;
                    <span className="font-medium">"Añadir a pantalla de inicio"</span>
                  </p>
                </div>
              ) : canInstall ? (
                /* Android / Chrome — native prompt available */
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-body font-medium">Instalar la app</p>
                    <p className="text-caption text-muted-foreground">Acceso rápido desde tu pantalla de inicio</p>
                  </div>
                  <Button size="sm" className="shrink-0 gap-1.5" onClick={install}>
                    <Download className="h-3.5 w-3.5" /> Instalar
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}

        <Button variant="outline" className="w-full h-12 rounded-xl gap-2" onClick={signOut}>
          <LogOut className="h-4 w-4" /> Cerrar Sesión
        </Button>
      </main>
      <InspectorBottomNav />
    </div>
  );
}
