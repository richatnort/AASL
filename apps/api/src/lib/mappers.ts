import type { Item } from '@shopping-list/shared';
import type { Category } from '@shopping-list/shared';
import type { items } from '../db/schema.js';

export function toItem(row: typeof items.$inferSelect): Item {
  return {
    id:          row.id as unknown as Item['id'],
    displayName: row.displayName,
    quantity:    row.quantity,
    category:    row.category as Category,
    alexaItemId: row.alexaItemId ?? null,
    createdAt:   row.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}
