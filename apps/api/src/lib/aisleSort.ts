import type { AisleOrder } from '@shopping-list/shared';

interface Sortable {
  displayName: string;
}

/**
 * Normalises a term for stem matching — strips common English/food plural/variant
 * suffixes so "yogurt" matches "Yogurts", "biscuit" matches "Biscuits", etc.
 */
function stemTerm(s: string): string {
  return s.replace(/(hourt|ourt|hour|our|ths|ies|ts|es|hs|s)$/i, '').toLowerCase();
}

/**
 * Returns the index of the first matching aisle group for a given display name,
 * or aisleOrder.length if no group matches (i.e. item is unmatched).
 *
 * Two-pass matching:
 *   Pass 1: case-insensitive substring (existing behaviour)
 *   Pass 2: stemmed substring — handles spelling variants like yogurt↔yoghurts
 */
export function getAisleIndex(displayName: string, aisleOrder: AisleOrder): number {
  const lower = displayName.toLowerCase();

  // Pass 1: substring match
  for (let i = 0; i < aisleOrder.length; i++) {
    if (aisleOrder[i]!.terms.some((t) => lower.includes(t.toLowerCase()))) return i;
  }

  // Pass 2: stemmed match — reverse direction only used when both stems are >= 4 chars
  // to avoid short item names (e.g. "pea") falsely matching long aisle terms ("Peanut")
  const stemmedItem = stemTerm(lower);
  for (let i = 0; i < aisleOrder.length; i++) {
    if (aisleOrder[i]!.terms.some((t) => {
      const st = stemTerm(t.toLowerCase());
      return stemmedItem.includes(st) || (stemmedItem.length >= 4 && st.length >= 4 && st.includes(stemmedItem));
    })) return i;
  }

  return aisleOrder.length; // unmatched → end
}

/** Sort items by Sainsbury's aisle group order. Unmatched items go to end, alphabetically. */
export function sortByAisleOrder<T extends Sortable>(items: T[], aisleOrder: AisleOrder): T[] {
  return [...items].sort((a, b) => {
    const diff = getAisleIndex(a.displayName, aisleOrder) - getAisleIndex(b.displayName, aisleOrder);
    return diff !== 0 ? diff : a.displayName.localeCompare(b.displayName);
  });
}
