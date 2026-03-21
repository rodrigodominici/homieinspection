import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InspectionStatusBadge, SectionStatusBadge } from '@/components/StatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import AdminLayout from '@/components/AdminLayout';
import PropertyBriefingCard from '@/components/PropertyBriefingCard';
import type { Inspection, InspectionSection, Profile } from '@/lib/types';
import { ArrowLeft, Save, MapPin } from 'lucide-react';

const ALL_STATUSES = [
  'pending_assignment', 'assigned', 'in_progress', 'submitted',
  'in_review', 'needs_changes', 'approved', 'published', 'sent',
];

export default function AdminInspectionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [sections, setSections] = useState<InspectionSection[]>([]);
  const [inspectors, setInspectors] = useState<Profile[]>([]);
  const [executives, setExecutives] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [editStatus, setEditStatus] = useState('');
  const [editInspector, setEditInspector] = useState('');
  const [editExecutive, setEditExecutive] = useState('');
  const [editScheduledAt, setEditScheduledAt] = useState('');

  useEffect(() => {
    const fetch = async () => {
      const [inspRes, secRes, profilesRes] = await Promise.all([
        supabase.from('inspections').select('*').eq('id', id!).single(),
        supabase.from('inspection_sections').select('*').eq('inspection_id', id!).order('sort_order'),
        supabase.from('profiles').select('*').eq('is_active', true).order('full_name'),
      ]);
      const insp = inspRes.data as unknown as Inspection;
      setInspection(insp);
      setSections((secRes.data ?? []) as unknown as InspectionSection[]);
      const profiles = (profilesRes.data ?? []) as unknown as Profile[];
      setInspectors(profiles.filter(p => p.role === 'inspector'));
      setExecutives(profiles.filter(p => p.role === 'executive'));

      if (insp) {
        setEditStatus(insp.status);
        setEditInspector(insp.inspector_id ?? '');
        setEditExecutive(insp.executive_id ?? '');
        setEditScheduledAt(insp.scheduled_at ? insp.scheduled_at.slice(0, 16) : '');
      }
      setLoading(false);
    };
    fetch();
  }, [id]);

  const handleSave = async () => {
    if (!inspection) return;
    setSaving(true);
    const updates: Record<string, unknown> = {
      status: editStatus,
      inspector_id: editInspector || null,
      executive_id: editExecutive || null,
      scheduled_at: editScheduledAt ? new Date(editScheduledAt).toISOString() : null,
    };
    const { error } = await supabase.from('inspections').update(updates).eq('id', inspection.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Inspección actualizada' });
      setInspection({ ...inspection, ...updates } as unknown as Inspection);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="p-6 max-w-5xl space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </AdminLayout>
    );
  }

  if (!inspection) {
    return (
      <AdminLayout>
        <div className="p-6 text-center text-muted-foreground">Inspección no encontrada</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6 max-w-5xl space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/inspections')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-h3">{inspection.property_name ?? inspection.property_id}</h1>
            <p className="text-caption text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> {inspection.address ?? 'Sin dirección'}
            </p>
          </div>
          <InspectionStatusBadge status={inspection.status} />
        </div>

        {/* Property briefing */}
        <PropertyBriefingCard inspection={inspection} />

        {/* Editable fields */}
        <Card className="border-0 ring-1 ring-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-body-lg">Editar Inspección</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Estado</Label>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ALL_STATUSES.map(s => (
                      <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Fecha/Hora programada</Label>
                <Input
                  type="datetime-local"
                  value={editScheduledAt}
                  onChange={(e) => setEditScheduledAt(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Inspector</Label>
                <Select value={editInspector} onValueChange={setEditInspector}>
                  <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                  <SelectContent>
                    {inspectors.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Ejecutivo</Label>
                <Select value={editExecutive} onValueChange={setEditExecutive}>
                  <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                  <SelectContent>
                    {executives.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              <Save className="h-4 w-4" />
              {saving ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
          </CardContent>
        </Card>

        {/* Sections */}
        <Card className="border-0 ring-1 ring-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-body-lg">Secciones ({sections.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {sections.map((sec, idx) => (
              <div key={sec.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                <span className="text-caption text-muted-foreground w-6 text-right">{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{sec.section_title}</p>
                  <p className="text-tiny text-muted-foreground">{sec.section_key}</p>
                </div>
                <SectionStatusBadge status={sec.status} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
