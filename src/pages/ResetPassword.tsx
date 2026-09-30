import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

/**
 * Public route reached from the password-recovery email link.
 * The URL hash must contain type=recovery (Supabase recovery flow); that link
 * grants a temporary session which lets us call updateUser({ password })
 * without the current password.
 */
export default function ResetPassword() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [validRecovery, setValidRecovery] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '');
    const params = new URLSearchParams(hash);
    setValidRecovery(params.get('type') === 'recovery');
  }, []);

  // Wait for the hash check before rendering anything.
  if (validRecovery === null) return null;

  // Not a recovery link: send to login.
  if (!validRecovery) return <Navigate to="/auth" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast({ title: 'Contraseña muy corta', description: 'Mínimo 8 caracteres.', variant: 'destructive' });
      return;
    }
    if (password !== confirm) {
      toast({ title: 'Las contraseñas no coinciden', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: 'Contraseña actualizada', description: 'Ya puedes usar tu nueva contraseña.' });
      // Recovery session is valid: go to the app (role-based redirect).
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error inesperado';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop: branded right panel */}
      <div className="hidden md:flex md:w-1/2 bg-primary items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
        <div className="relative max-w-md text-center space-y-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 border border-white/20 mx-auto shadow-lg backdrop-blur-sm">
            <span className="text-2xl font-bold text-primary-foreground">H</span>
          </div>
          <h2 className="text-h1 text-primary-foreground">Homie Inspection</h2>
          <p className="text-body-lg text-primary-foreground/80">
            Gestiona inspecciones inmobiliarias de forma eficiente y profesional
          </p>
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {/* Mobile header */}
        <div className="md:hidden bg-primary px-6 py-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 border border-white/20">
              <span className="text-lg font-bold text-primary-foreground">H</span>
            </div>
            <span className="text-body-lg font-semibold text-primary-foreground">Homie Inspection</span>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center px-4 py-8">
          <div className="w-full max-w-md space-y-6">
            <div className="space-y-2">
              <h1 className="text-h2">Nueva contraseña</h1>
              <p className="text-caption text-muted-foreground">
                Define tu nueva contraseña para acceder a tu cuenta
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">Nueva contraseña</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar contraseña</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repite la contraseña"
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>
              <Button type="submit" className="w-full h-11" disabled={submitting}>
                {submitting ? 'Guardando...' : 'Guardar contraseña'}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
