import { Sheet, SheetContent } from '@/components/ui/sheet';
import type { InspectionRepairItem, InspectionSection } from '@/lib/types';
import { SectionRepairsPanel } from './SectionRepairsPanel';
import type { OwnerFeedbackEntry } from '@/modules/review/api/useOwnerFeedbackByRepair';

interface SectionRepairsDrawerProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  section: InspectionSection;
  repairs: InspectionRepairItem[];
  hasContractor: boolean;
  expandedRepairId: string | null;
  onToggleExpand: (id: string) => void;
  onOpenCatalog: () => void;
  onUpdateRepair: (id: string, field: string, value: any) => void;
  onDeleteRepair: (id: string) => void;
  contractors?: Array<{ id: string; name: string; country: string }>;
  selectedContractorId?: string | null;
  onContractorChange?: (id: string) => void;
  contractorTotal?: number;
  utility?: number;
  feedbackByRepairId?: Map<string, OwnerFeedbackEntry>;
}

/**
 * Mobile wrapper around `SectionRepairsPanel`. Desktop renders the panel
 * inline (see `ExecutiveReviewDetail`); this Sheet is for < lg viewports.
 */
export function SectionRepairsDrawer(props: SectionRepairsDrawerProps) {
  const { open, onOpenChange, ...rest } = props;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-0">
        <SectionRepairsPanel {...rest} variant="sheet" onClose={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}
