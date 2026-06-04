import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import * as repairsService from './repairs.service';
import * as inspectionActions from './inspection-actions.service';
import type { PublishedUrls } from '@/modules/review/components';
import type {
  Inspection, InspectionPhoto, InspectionRepairItem, InspectionSection, RepairCatalogItem,
} from '@/lib/types';

interface UseReviewActionsArgs {
  id: string | undefined;
  profileId: string | undefined;
  inspection: Inspection | null;
  operationalSections: InspectionSection[];
  allRepairs: InspectionRepairItem[];
  repairsBySection: Record<string, InspectionRepairItem[]>;
  photosBySection: Record<string, InspectionPhoto[]>;
  finalObservations: Record<string, string>;
  missingSections: InspectionSection[];
  clientTotal: number;
  selectedContractorId: string | null;
  setSelectedContractorId: (id: string | null) => void;
  refetch: () => Promise<void> | void;
}

export function useReviewActions(args: UseReviewActionsArgs) {
  const {
    id, profileId, inspection, operationalSections, allRepairs,
    repairsBySection, photosBySection, finalObservations, missingSections,
    clientTotal, selectedContractorId, setSelectedContractorId, refetch,
  } = args;

  const navigate = useNavigate();
  const { toast } = useToast();

  const [submitting, setSubmitting] = useState(false);

  // Catalog
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogItems, setCatalogItems] = useState<RepairCatalogItem[]>([]);
  const [catalogSectionId, setCatalogSectionId] = useState<string | null>(null);

  // Publish
  const [publishedUrls, setPublishedUrls] = useState<PublishedUrls | null>(null);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [missingObsDialogOpen, setMissingObsDialogOpen] = useState(false);

  const togglePhotoVisibility = useCallback(async (photo: InspectionPhoto) => {
    const current = (photo as any).visible_to_owner ?? true;
    try {
      await inspectionActions.togglePhotoVisibility(photo.id, current);
      await refetch();
    } catch (e: any) {
      toast({ title: 'No se pudo actualizar la foto', description: e?.message, variant: 'destructive' });
    }
  }, [refetch, toast]);

  const openCatalog = useCallback(async (sectionId: string) => {
    setCatalogSectionId(sectionId);
    setCatalogSearch('');
    try {
      const items = await repairsService.fetchActiveCatalog();
      setCatalogItems(items);
      setCatalogOpen(true);
    } catch (e: any) {
      toast({ title: 'No se pudo cargar el catálogo', description: e?.message, variant: 'destructive' });
    }
  }, [toast]);

  const addRepairFromCatalog = useCallback(async (catalogItem: RepairCatalogItem) => {
    if (!catalogSectionId || !id) return;
    const existingCount = (repairsBySection[catalogSectionId] ?? []).length;
    try {
      const { contractorPrice, priceSource } = await repairsService.addRepairFromCatalog({
        inspectionId: id,
        inspectionSectionId: catalogSectionId,
        catalogItem,
        existingCount,
        contractorId: selectedContractorId,
        profileId,
      });
      setCatalogOpen(false);
      await refetch();
      toast({
        title: 'Reparación agregada',
        description: priceSource === 'catalog'
          ? `Precio contratista autollenado: $${contractorPrice}`
          : selectedContractorId ? 'Sin precio de contratista configurado' : undefined,
      });
    } catch (e: any) {
      toast({ title: 'No se pudo agregar la reparación', description: e?.message, variant: 'destructive' });
    }
  }, [catalogSectionId, id, repairsBySection, selectedContractorId, profileId, refetch, toast]);

  const updateRepairItem = useCallback(async (repairId: string, field: string, value: any) => {
    try {
      await repairsService.updateRepairItem(repairId, field, value, profileId);
      await refetch();
    } catch (e: any) {
      toast({ title: 'No se pudo actualizar la reparación', description: e?.message, variant: 'destructive' });
    }
  }, [profileId, refetch, toast]);

  const deleteRepairItem = useCallback(async (repairId: string) => {
    try {
      await repairsService.deleteRepairItem(repairId);
      await refetch();
      toast({ title: 'Reparación eliminada' });
    } catch (e: any) {
      toast({ title: 'No se pudo eliminar la reparación', description: e?.message, variant: 'destructive' });
    }
  }, [refetch, toast]);

  const handleContractorChange = useCallback(async (contractorId: string) => {
    if (!id) return;
    const newContractorId = contractorId === 'none' ? null : contractorId;
    setSelectedContractorId(newContractorId);
    const updatedCount = await repairsService.rebindContractorPrices(id, newContractorId, allRepairs);
    if (updatedCount > 0) await refetch();
    toast({
      title: 'Contratista actualizado',
      description: newContractorId
        ? `${updatedCount} ${updatedCount === 1 ? 'precio recargado' : 'precios recargados'} desde la matriz`
        : 'Precios de contratista puestos en 0',
    });
  }, [id, allRepairs, setSelectedContractorId, refetch, toast]);

  const handlePublish = useCallback(async (force = false) => {
    if (!inspection) return;
    if (!force && missingSections.length > 0) {
      setMissingObsDialogOpen(true);
      return;
    }
    setSubmitting(true);
    try {
      const result = await inspectionActions.publishInspection({
        inspection,
        operationalSections,
        allRepairs,
        photosBySection,
        finalObservations,
        clientTotal,
        profileId,
      });
      setPublishedUrls({ owner: result.ownerUrl, tenant: result.tenantUrl });
      setPublishDialogOpen(true);
      toast({ title: `Reporte v${result.versionNumber} publicado` });
      await refetch();
    } catch (e: any) {
      toast({ title: 'Error al publicar', description: e?.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }, [inspection, missingSections.length, operationalSections, allRepairs, photosBySection, finalObservations, clientTotal, profileId, refetch, toast]);

  const handleApprove = useCallback(async () => {
    if (!id) return;
    setSubmitting(true);
    try {
      await inspectionActions.approveInspection(id, profileId);
      toast({ title: 'Inspección aprobada' });
      navigate('/executive');
    } catch (e: any) {
      toast({ title: 'No se pudo aprobar', description: e?.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }, [id, profileId, navigate, toast]);

  const handleStartReview = useCallback(async () => {
    if (!inspection || inspection.status !== 'submitted' || !id) return;
    setSubmitting(true);
    try {
      await inspectionActions.startReview(id);
      toast({ title: 'Revisión iniciada' });
      await refetch();
    } catch (e: any) {
      toast({ title: 'No se pudo iniciar la revisión', description: e?.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }, [inspection, id, refetch, toast]);

  const handleReturnForChanges = useCallback(async (
    selectedSectionIds: string[],
    commentsBySection: Record<string, string>,
  ) => {
    if (!id) return;
    if (selectedSectionIds.length === 0) {
      toast({ title: 'Selecciona al menos una sección', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      await inspectionActions.requestChanges({
        inspectionId: id,
        profileId,
        selectedSectionIds,
        commentsBySection,
      });
      toast({ title: 'Devuelta para cambios' });
      navigate('/executive');
    } catch (e: any) {
      toast({ title: 'No se pudo devolver para cambios', description: e?.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }, [id, profileId, navigate, toast]);

  return {
    submitting,
    catalog: {
      open: catalogOpen, setOpen: setCatalogOpen,
      search: catalogSearch, setSearch: setCatalogSearch,
      items: catalogItems,
    },
    publish: {
      urls: publishedUrls,
      setUrls: setPublishedUrls,
      dialogOpen: publishDialogOpen, setDialogOpen: setPublishDialogOpen,
      missingDialogOpen: missingObsDialogOpen, setMissingDialogOpen: setMissingObsDialogOpen,
    },
    togglePhotoVisibility,
    openCatalog,
    addRepairFromCatalog,
    updateRepairItem,
    deleteRepairItem,
    handleContractorChange,
    handlePublish,
    handleApprove,
    handleStartReview,
    handleReturnForChanges,
  };
}
