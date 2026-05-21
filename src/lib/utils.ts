import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Groups an array of rows by their `inspection_section_id` field.
 * Used across review/admin workstations to bucket fields, photos, reviews
 * and repairs per section in a single pass.
 */
export function groupBy<T extends { inspection_section_id: string }>(
  arr: T[],
): Record<string, T[]> {
  const map: Record<string, T[]> = {};
  for (const item of arr) {
    (map[item.inspection_section_id] ||= []).push(item);
  }
  return map;
}
