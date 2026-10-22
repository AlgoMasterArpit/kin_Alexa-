import type { CallToolResult } from '@modelcontextprotocol/server';

import { describeMedication, matchMedication } from '../domain/medications.ts';
import type { Medication } from '../domain/types.ts';
import type { Household } from '../services/household.ts';
import { failure, spokenList } from './results.ts';

export type MedicationLookup =
  | { readonly found: true; readonly medication: Medication }
  | { readonly found: false; readonly result: CallToolResult };

export function lookupMedication(household: Household, query: string): MedicationLookup {
  const match = matchMedication(query, household.store.medications.listActive());
  switch (match.kind) {
    case 'found':
      return { found: true, medication: match.medication };
    case 'ambiguous':
      return {
        found: false,
        result: failure(
          `That could be ${spokenList(match.candidates.map((item) => item.name))}. Ask which one they mean.`,
        ),
      };
    case 'not_found':
      return {
        found: false,
        result: failure(
          match.known.length
            ? `I couldn't find that medicine. The medicines I know are ${spokenList(match.known.map(describeMedication))}.`
            : 'No medicines have been set up yet.',
        ),
      };
  }
}
