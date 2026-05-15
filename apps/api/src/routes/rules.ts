import { UpdateRuleSchema } from '@shopping-list/shared';
import { desc, eq, ilike } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db/index.js';
import { categoryRules } from '../db/schema.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { learnCategory, normalise } from '../services/categoriser.js';

export const rulesRouter = Router();
rulesRouter.use(requireAuth);

// GET /api/rules?q=term — list all rules, optional search
rulesRouter.get('/', async (req, res) => {
  const q = typeof req.query['q'] === 'string' ? req.query['q'].trim() : '';
  const rows = q
    ? await db.select().from(categoryRules)
        .where(ilike(categoryRules.term, `%${q}%`))
        .orderBy(desc(categoryRules.updatedAt))
    : await db.select().from(categoryRules)
        .orderBy(desc(categoryRules.updatedAt));
  res.json(rows);
});

// POST /api/rules — create or update a manual rule
rulesRouter.post('/', async (req, res) => {
  const { term, category } = req.body as { term?: unknown; category?: unknown };
  const normTerm = normalise(typeof term === 'string' ? term : '');
  if (!normTerm || normTerm.length > 200) {
    res.status(400).json({ error: 'Term is required and must be 200 chars or fewer', code: 'VALIDATION_ERROR' });
    return;
  }
  if (typeof category !== 'string' || !category.trim()) {
    res.status(400).json({ error: 'Category is required', code: 'VALIDATION_ERROR' });
    return;
  }
  await learnCategory(normTerm, category.trim(), 'manual');
  const [rule] = await db.select().from(categoryRules).where(eq(categoryRules.term, normTerm));
  res.status(201).json(rule);
});

// DELETE /api/rules/:term — remove a rule
rulesRouter.delete('/:term', async (req, res) => {
  const term = normalise(decodeURIComponent(req.params['term'] ?? ''));
  if (!term) {
    res.status(400).json({ error: 'Invalid term', code: 'VALIDATION_ERROR' });
    return;
  }
  const deleted = await db.delete(categoryRules).where(eq(categoryRules.term, term)).returning({ term: categoryRules.term });
  if (!deleted.length) {
    res.status(404).json({ error: 'Rule not found', code: 'NOT_FOUND' });
    return;
  }
  res.status(204).send();
});

// PATCH /api/rules/:term — manual category override
rulesRouter.patch('/:term', async (req, res) => {
  const term = normalise(decodeURIComponent(req.params['term'] ?? ''));
  if (!term) {
    res.status(400).json({ error: 'Invalid term', code: 'VALIDATION_ERROR' });
    return;
  }
  const parsed = UpdateRuleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input', code: 'VALIDATION_ERROR' });
    return;
  }
  const [updated] = await db
    .update(categoryRules)
    .set({ category: parsed.data.category, source: 'manual', updatedAt: new Date() })
    .where(eq(categoryRules.term, term))
    .returning();
  if (!updated) {
    res.status(404).json({ error: 'Rule not found', code: 'NOT_FOUND' });
    return;
  }
  res.json(updated);
});
