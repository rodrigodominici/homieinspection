import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LogOut, Building2 } from 'lucide-react';
import ContractorLayout from './ContractorLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { marketLabel } from '@/lib/markets';

export default function ContractorProfile() {
  const { profile, signOut } = useAuth();
  const [company, setCompany] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.contractor_id) return;
    let cancelled = false;
    supabase
      .from('contractors')
      .select('name')
      .eq('id', profile.contractor_id)
      .maybeSingle()
      .then(({ data }) => { if (!cancelled) setCompany((data as { name?: string } | null)?.name ?? null); });
    return () => { cancelled = true; };
  }, [profile?.contractor_id]);

  return (
    <ContractorLayout title="Mi perfil">
      <Card>
        <CardContent className="p-4 space-y-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Nombre</p>
            <p className="font-medium">{profile?.full_name}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Correo</p>
            <p className="font-medium break-all">{profile?.email}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Empresa</p>
            <p className="font-medium flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{company ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Países</p>
            <p className="font-medium">{(profile?.markets ?? []).map(marketLabel).join(', ') || '—'}</p>
          </div>
        </CardContent>
      </Card>
      <Button variant="outline" className="w-full" onClick={() => signOut()}>
        <LogOut className="h-4 w-4 mr-2" /> Cerrar sesión
      </Button>
    </ContractorLayout>
  );
}
