import type { Medication } from './types.ts';
import { normalize } from './text.ts';

export type MedicationMatch =
  | { readonly kind: 'found'; readonly medication: Medication }
  | { readonly kind: 'ambiguous'; readonly candidates: readonly Medication[] }
  | { readonly kind: 'not_found'; readonly known: readonly Medication[] };

function names(medication: Medication): string[] {
  return [medication.name, ...medication.aliases, medication.purpose ?? '']
    .map(normalize)
    .filter(Boolean);
}

export function matchMedication(
  query: string,
  medications: readonly Medication[],
): MedicationMatch {
  const wanted = normalize(query);
  if (!wanted) return { kind: 'not_found', known: medications };

  const exact = medications.filter((medication) => names(medication).includes(wanted));
  if (exact.length === 1 && exact[0]) return { kind: 'found', medication: exact[0] };

  const partial = medications.filter((medication) =>
    names(medication).some((name) => name.includes(wanted) || wanted.includes(name)),
  );
  if (partial.length === 1 && partial[0]) return { kind: 'found', medication: partial[0] };
  if (partial.length > 1) return { kind: 'ambiguous', candidates: partial };

  return { kind: 'not_found', known: medications };
}

export function describeMedication(medication: Medication): string {
  return `${medication.name} ${medication.dosage}`;
}

export function daysOfSupply(medication: Medication): number | null {
  if (medication.pillsRemaining === null || medication.schedule.length === 0) return null;
  return Math.floor(medication.pillsRemaining / medication.schedule.length);
}

export const LOW_SUPPLY_DAYS = 7;

export function isRunningLow(medication: Medication): boolean {
  const days = daysOfSupply(medication);
  return days !== null && days <= LOW_SUPPLY_DAYS;
}
