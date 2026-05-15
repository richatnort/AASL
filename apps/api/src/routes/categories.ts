import { AddCategorySchema, UpsertCategorySchema } from '@shopping-list/shared';
import { asc, eq } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db/index.js';
import { categoryOrder } from '../db/schema.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const categoriesRouter = Router();
categoriesRouter.use(requireAuth);

const BUILT_IN_KEYS = ['greengrocers', 'butchers', 'supermarket', 'needs_categorising'] as const;
const DEFAULT_SEED = [
  { category: 'greengrocers',       sortOrder: 0, displayName: 'Green Grocers',      color: '#22c55e', isBuiltIn: true },
  { category: 'butchers',           sortOrder: 1, displayName: 'Butchers',            color: '#dc2626', isBuiltIn: true },
  { category: 'supermarket',        sortOrder: 2, displayName: 'Supermarket',         color: '#f06c00', isBuiltIn: true },
  { category: 'needs_categorising', sortOrder: 3, displayName: 'Needs Categorising',  color: '#f59e0b', isBuiltIn: true },
];

async function ensureSeeded(): Promise<void> {
  await db.insert(categoryOrder).values(DEFAULT_SEED).onConflictDoNothing();
}

// GET /api/categories/order — ordered list of category keys (legacy compat)
categoriesRouter.get('/order', async (_req, res) => {
  await ensureSeeded();
  const rows = await db.select().from(categoryOrder).orderBy(asc(categoryOrder.sortOrder));
  res.json(rows.map((r) => r.category));
});

// GET /api/categories/config — full CategoryConfig[] with display name + colour
categoriesRouter.get('/config', async (_req, res) => {
  await ensureSeeded();
  const rows = await db.select().from(categoryOrder).orderBy(asc(categoryOrder.sortOrder));
  res.json(rows);
});

// PATCH /api/categories/order — persist new ordering (accepts any string array)
categoriesRouter.patch('/order', async (req, res) => {
  const order: unknown = req.body.order;
  if (!Array.isArray(order) || !order.every((c) => typeof c === 'string')) {
    res.status(400).json({ error: 'Invalid category order', code: 'VALIDATION_ERROR' });
    return;
  }

  // Verify all submitted keys exist in DB
  const existing = await db.select({ category: categoryOrder.category }).from(categoryOrder);
  const known = new Set(existing.map((r) => r.category));
  if (!(order as string[]).every((c) => known.has(c))) {
    res.status(400).json({ error: 'Unknown category key in order', code: 'VALIDATION_ERROR' });
    return;
  }

  await Promise.all(
    (order as string[]).map((cat, idx) =>
      db.insert(categoryOrder)
        .values({ category: cat, sortOrder: idx })
        .onConflictDoUpdate({ target: categoryOrder.category, set: { sortOrder: idx } })
    )
  );
  res.json(order);
});

// PATCH /api/categories/:key — update display name and/or colour
categoriesRouter.patch('/:key', async (req, res) => {
  const key = req.params['key'] ?? '';
  if (!key) {
    res.status(400).json({ error: 'Invalid key', code: 'VALIDATION_ERROR' });
    return;
  }
  const parsed = UpsertCategorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input', code: 'VALIDATION_ERROR' });
    return;
  }
  const [updated] = await db
    .update(categoryOrder)
    .set({ displayName: parsed.data.displayName, color: parsed.data.color })
    .where(eq(categoryOrder.category, key))
    .returning();
  if (!updated) {
    res.status(404).json({ error: 'Category not found', code: 'NOT_FOUND' });
    return;
  }
  res.json(updated);
});

// POST /api/categories — add a custom category
categoriesRouter.post('/', async (req, res) => {
  const parsed = AddCategorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input', code: 'VALIDATION_ERROR' });
    return;
  }
  const { key, displayName, color } = parsed.data;

  // Get next sort order
  const existing = await db.select({ sortOrder: categoryOrder.sortOrder }).from(categoryOrder).orderBy(asc(categoryOrder.sortOrder));
  const maxOrder = existing.length ? (existing[existing.length - 1]?.sortOrder ?? 0) + 1 : 3;

  const [inserted] = await db
    .insert(categoryOrder)
    .values({ category: key, sortOrder: maxOrder, displayName, color, isBuiltIn: false })
    .onConflictDoNothing()
    .returning();

  if (!inserted) {
    res.status(409).json({ error: 'Category key already exists', code: 'ALREADY_EXISTS' });
    return;
  }
  res.status(201).json(inserted);
});

// DELETE /api/categories/:key — remove a custom (non-built-in) category
categoriesRouter.delete('/:key', async (req, res) => {
  const key = req.params['key'] ?? '';
  if ((BUILT_IN_KEYS as readonly string[]).includes(key)) {
    res.status(400).json({ error: 'Cannot delete a built-in category', code: 'FORBIDDEN' });
    return;
  }
  const deleted = await db.delete(categoryOrder).where(eq(categoryOrder.category, key)).returning({ category: categoryOrder.category });
  if (!deleted.length) {
    res.status(404).json({ error: 'Category not found', code: 'NOT_FOUND' });
    return;
  }
  res.status(204).send();
});
