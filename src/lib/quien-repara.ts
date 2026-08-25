/**
 * "quien_repara" — flag independiente del estado de la inspección que indica
 * quién ejecuta las reparaciones acordadas.
 *
 * Valores: 'homie' | 'dueno' | 'ninguno'. `null` = todavía sin definir.
 */
export type QuienRepara = 'homie' | 'dueno' | 'ninguno';

export const QUIEN_REPARA_VALUES: QuienRepara[] = ['homie', 'dueno', 'ninguno'];

export const QUIEN_REPARA_LABELS: Record<QuienRepara, string> = {
  homie: 'Homie',
  dueno: 'Dueño',
  ninguno: 'Ninguno (no requiere)',
};

export const QUIEN_REPARA_SHORT_LABELS: Record<QuienRepara, string> = {
  homie: 'Repara Homie',
  dueno: 'Repara dueño',
  ninguno: 'No requiere',
};

export function getQuienReparaLabel(value: string | null | undefined): string {
  if (!value) return 'Sin definir';
  return QUIEN_REPARA_LABELS[value as QuienRepara] ?? value;
}

export function getQuienReparaShortLabel(value: string | null | undefined): string {
  if (!value) return 'Repara: sin definir';
  return QUIEN_REPARA_SHORT_LABELS[value as QuienRepara] ?? value;
}

export function isQuienRepara(value: unknown): value is QuienRepara {
  return typeof value === 'string' && (QUIEN_REPARA_VALUES as string[]).includes(value);
}
