/**
 * Roles que reciben inspecciones en terreno.
 *
 * - `inspector`: captación y check-out.
 * - `property_advisor`: exclusivamente check-in.
 *
 * Las políticas RLS aplican la misma regla en la base de datos, así que la UI
 * solo necesita ofrecer los candidatos correctos según el tipo de inspección.
 */
import type { UserRole } from '@/lib/types';

export const RECEIVER_ROLES: UserRole[] = ['inspector', 'property_advisor'];

export function isReceiverRole(role: string | null | undefined): boolean {
  return role === 'inspector' || role === 'property_advisor';
}

/** Rol que puede quedar a cargo de una inspección de este tipo. */
export function receiverRoleForType(inspectionType: string | null | undefined): UserRole {
  return inspectionType === 'check_in' ? 'property_advisor' : 'inspector';
}

/** Filtra los perfiles elegibles como receptor para un tipo de inspección. */
export function eligibleReceivers<T extends { role: UserRole }>(
  profiles: T[],
  inspectionType: string | null | undefined,
): T[] {
  const role = receiverRoleForType(inspectionType);
  return profiles.filter((p) => p.role === role);
}

/** Etiqueta del receptor según el tipo de inspección. */
export function receiverLabelForType(inspectionType: string | null | undefined): string {
  return inspectionType === 'check_in' ? 'Property Advisor' : 'Inspector';
}

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  inspector: 'Inspector',
  property_advisor: 'Property Advisor',
  executive: 'Executive',
  comercial: 'Comercial',
  contractor: 'Contratista',
  pending: 'Sin rol',
};
