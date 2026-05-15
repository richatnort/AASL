import {
  AddToWeekSchema,
  CreateMealPlanSchema,
  MealPlanItemSchema,
  SavedMealSchema,
} from '@shopping-list/shared';
import type { MealPlan, MealPlanItem, SavedMeal, SavedMealIngredient } from '@shopping-list/shared';
import { and, eq, inArray } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db/index.js';
import { mealPlanItems, mealPlans, savedMealIngredients, savedMeals } from '../db/schema.js';
import { logger } from '../lib/logger.js';
import { assertSafeUrl } from '../lib/urlValidation.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const mealPlannerRouter = Router();
mealPlannerRouter.use(requireAuth);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getPlanWithItems(planId: number): Promise<MealPlan | null> {
  const plan = await db.select().from(mealPlans).where(eq(mealPlans.id, planId)).limit(1);
  if (!plan[0]) return null;
  const items = await db.select().from(mealPlanItems).where(eq(mealPlanItems.planId, planId));
  return {
    id: plan[0].id,
    weekStart: plan[0].weekStart,
    items: items.map(rowToItem),
  };
}

function rowToItem(row: typeof mealPlanItems.$inferSelect): MealPlanItem {
  return {
    id: row.id,
    planId: row.planId,
    mealName: row.mealName,
    days: row.days,
    recipeUrl: row.recipeUrl,
    savedMealId: row.savedMealId ?? null,
    sortOrder: row.sortOrder,
    createdBy: row.createdBy,
  };
}

// ── Meal Plans ────────────────────────────────────────────────────────────────

// GET /api/meal-plans?weekStart=YYYY-MM-DD
mealPlannerRouter.get('/meal-plans', async (req, res) => {
  const { weekStart } = req.query as { weekStart?: string };
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    res.status(400).json({ error: 'weekStart query param required (YYYY-MM-DD)', code: 'VALIDATION_ERROR' });
    return;
  }
  const plan = await db.select().from(mealPlans).where(eq(mealPlans.weekStart, weekStart)).limit(1);
  if (!plan[0]) {
    res.json({ plan: null });
    return;
  }
  const full = await getPlanWithItems(plan[0].id);
  res.json({ plan: full });
});

// POST /api/meal-plans — find-or-create for a given weekStart
mealPlannerRouter.post('/meal-plans', async (req, res) => {
  const parsed = CreateMealPlanSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input', code: 'VALIDATION_ERROR' });
    return;
  }
  const { weekStart } = parsed.data;

  const existing = await db.select().from(mealPlans).where(eq(mealPlans.weekStart, weekStart)).limit(1);
  if (existing[0]) {
    const full = await getPlanWithItems(existing[0].id);
    res.json({ plan: full });
    return;
  }

  const [created] = await db.insert(mealPlans).values({ weekStart }).returning();
  res.status(201).json({ plan: { id: created!.id, weekStart: created!.weekStart, items: [] } });
});

// POST /api/meal-plans/:planId/items
mealPlannerRouter.post('/meal-plans/:planId/items', async (req, res) => {
  const planId = Number.parseInt(req.params['planId']!, 10);
  if (Number.isNaN(planId)) {
    res.status(400).json({ error: 'Invalid planId', code: 'VALIDATION_ERROR' });
    return;
  }

  const parsed = MealPlanItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input', code: 'VALIDATION_ERROR' });
    return;
  }

  const { mealName, days, recipeUrl, sortOrder, saveToLibrary } = parsed.data;

  if (recipeUrl) {
    try { assertSafeUrl(recipeUrl); } catch (err) {
      logger.warn({ url: recipeUrl }, '[MEAL-PLANS] SSRF blocked on create item');
      res.status(400).json({ error: (err as Error).message, code: 'VALIDATION_ERROR' });
      return;
    }
  }

  const plan = await db.select({ id: mealPlans.id }).from(mealPlans).where(eq(mealPlans.id, planId)).limit(1);
  if (!plan[0]) {
    res.status(404).json({ error: 'Meal plan not found', code: 'NOT_FOUND' });
    return;
  }

  const userId = (req.user as { id: number } | undefined)?.id ?? null;

  const [item] = await db.insert(mealPlanItems).values({
    planId,
    mealName,
    days,
    recipeUrl: recipeUrl ?? null,
    sortOrder: sortOrder ?? 0,
    createdBy: userId,
  }).returning();

  // Optionally save to library
  if (saveToLibrary) {
    await db.insert(savedMeals).values({ mealName, recipeUrl: recipeUrl ?? null, createdBy: userId });
  }

  res.status(201).json(rowToItem(item!));
});

// PATCH /api/meal-plans/:planId/items/:itemId
mealPlannerRouter.patch('/meal-plans/:planId/items/:itemId', async (req, res) => {
  const planId = Number.parseInt(req.params['planId']!, 10);
  const itemId = Number.parseInt(req.params['itemId']!, 10);
  if (Number.isNaN(planId) || Number.isNaN(itemId)) {
    res.status(400).json({ error: 'Invalid planId or itemId', code: 'VALIDATION_ERROR' });
    return;
  }

  const parsed = MealPlanItemSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input', code: 'VALIDATION_ERROR' });
    return;
  }

  const { mealName, days, recipeUrl, sortOrder, savedMealId, saveToLibrary } = parsed.data;

  if (recipeUrl) {
    try { assertSafeUrl(recipeUrl); } catch (err) {
      logger.warn({ url: recipeUrl }, '[MEAL-PLANS] SSRF blocked on update item');
      res.status(400).json({ error: (err as Error).message, code: 'VALIDATION_ERROR' });
      return;
    }
  }

  const existing = await db.select().from(mealPlanItems)
    .where(and(eq(mealPlanItems.id, itemId), eq(mealPlanItems.planId, planId)))
    .limit(1);
  if (!existing[0]) {
    res.status(404).json({ error: 'Meal not found', code: 'NOT_FOUND' });
    return;
  }

  const updates: Partial<typeof mealPlanItems.$inferInsert> = {};
  if (mealName !== undefined) updates.mealName = mealName;
  if (days !== undefined) updates.days = days;
  if (recipeUrl !== undefined) updates.recipeUrl = recipeUrl; // null clears the URL
  if (sortOrder !== undefined) updates.sortOrder = sortOrder;

  const [updated] = await db.update(mealPlanItems)
    .set(updates)
    .where(eq(mealPlanItems.id, itemId))
    .returning();

  // Handle library toggle OFF — remove from saved meals (verify it exists first)
  if (saveToLibrary === false && savedMealId) {
    const existingSaved = await db.select({ id: savedMeals.id }).from(savedMeals)
      .where(eq(savedMeals.id, savedMealId)).limit(1);
    if (existingSaved[0]) {
      await db.delete(savedMeals).where(eq(savedMeals.id, savedMealId));
    }
  }
  // Handle library toggle ON — add to saved meals
  if (saveToLibrary === true) {
    const userId = (req.user as { id: number } | undefined)?.id ?? null;
    await db.insert(savedMeals).values({
      mealName: updated!.mealName,
      recipeUrl: updated!.recipeUrl,
      createdBy: userId,
    });
  }

  res.json(rowToItem(updated!));
});

// DELETE /api/meal-plans/:planId/items/:itemId
mealPlannerRouter.delete('/meal-plans/:planId/items/:itemId', async (req, res) => {
  const planId = Number.parseInt(req.params['planId']!, 10);
  const itemId = Number.parseInt(req.params['itemId']!, 10);
  if (Number.isNaN(planId) || Number.isNaN(itemId)) {
    res.status(400).json({ error: 'Invalid planId or itemId', code: 'VALIDATION_ERROR' });
    return;
  }

  const existing = await db.select({ id: mealPlanItems.id }).from(mealPlanItems)
    .where(and(eq(mealPlanItems.id, itemId), eq(mealPlanItems.planId, planId)))
    .limit(1);
  if (!existing[0]) {
    res.status(404).json({ error: 'Meal not found', code: 'NOT_FOUND' });
    return;
  }

  await db.delete(mealPlanItems).where(eq(mealPlanItems.id, itemId));
  res.status(204).send();
});

// ── Saved Meals ───────────────────────────────────────────────────────────────

function rowToIngredient(row: typeof savedMealIngredients.$inferSelect): SavedMealIngredient {
  return {
    id: row.id,
    savedMealId: row.savedMealId,
    name: row.name,
    quantity: row.quantity,
    sortOrder: row.sortOrder,
  };
}

function rowToSavedMeal(row: typeof savedMeals.$inferSelect, ingredients: typeof savedMealIngredients.$inferSelect[] = []): SavedMeal {
  return {
    id: row.id,
    mealName: row.mealName,
    recipeUrl: row.recipeUrl,
    createdBy: row.createdBy,
    ingredients: ingredients.map(rowToIngredient),
  };
}

async function fetchIngredientsForMeals(mealIds: number[]): Promise<Map<number, typeof savedMealIngredients.$inferSelect[]>> {
  if (mealIds.length === 0) return new Map();
  const rows = await db.select().from(savedMealIngredients)
    .where(inArray(savedMealIngredients.savedMealId, mealIds))
    .orderBy(savedMealIngredients.savedMealId, savedMealIngredients.sortOrder);
  const map = new Map<number, typeof savedMealIngredients.$inferSelect[]>();
  for (const row of rows) {
    const arr = map.get(row.savedMealId) ?? [];
    arr.push(row);
    map.set(row.savedMealId, arr);
  }
  return map;
}

// GET /api/saved-meals
mealPlannerRouter.get('/saved-meals', async (_req, res) => {
  const mealRows = await db.select().from(savedMeals).orderBy(savedMeals.mealName);
  const ingredientMap = await fetchIngredientsForMeals(mealRows.map((r) => r.id));
  res.json(mealRows.map((row) => rowToSavedMeal(row, ingredientMap.get(row.id) ?? [])));
});

// POST /api/saved-meals
mealPlannerRouter.post('/saved-meals', async (req, res) => {
  const parsed = SavedMealSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input', code: 'VALIDATION_ERROR' });
    return;
  }
  const { mealName, recipeUrl, ingredients } = parsed.data;

  if (recipeUrl) {
    try { assertSafeUrl(recipeUrl); } catch (err) {
      res.status(400).json({ error: (err as Error).message, code: 'VALIDATION_ERROR' });
      return;
    }
  }

  const userId = (req.user as { id: number } | undefined)?.id ?? null;
  const [row] = await db.insert(savedMeals).values({ mealName, recipeUrl: recipeUrl ?? null, createdBy: userId }).returning();

  let ingRows: typeof savedMealIngredients.$inferSelect[] = [];
  if (ingredients && ingredients.length > 0) {
    ingRows = await db.insert(savedMealIngredients).values(
      ingredients.map((ing, i) => ({
        savedMealId: row!.id,
        name: ing.name,
        quantity: ing.quantity ?? null,
        sortOrder: ing.sortOrder ?? i,
      }))
    ).returning();
  }

  res.status(201).json(rowToSavedMeal(row!, ingRows));
});

// PATCH /api/saved-meals/:id
mealPlannerRouter.patch('/saved-meals/:id', async (req, res) => {
  const id = Number.parseInt(req.params['id']!, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'Invalid id', code: 'VALIDATION_ERROR' });
    return;
  }

  const parsed = SavedMealSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input', code: 'VALIDATION_ERROR' });
    return;
  }

  const { mealName, recipeUrl, ingredients } = parsed.data;

  if (recipeUrl) {
    try { assertSafeUrl(recipeUrl); } catch (err) {
      res.status(400).json({ error: (err as Error).message, code: 'VALIDATION_ERROR' });
      return;
    }
  }

  const existing = await db.select({ id: savedMeals.id }).from(savedMeals).where(eq(savedMeals.id, id)).limit(1);
  if (!existing[0]) {
    res.status(404).json({ error: 'Saved meal not found', code: 'NOT_FOUND' });
    return;
  }

  const updates: Partial<typeof savedMeals.$inferInsert> = {};
  if (mealName !== undefined) updates.mealName = mealName;
  if (recipeUrl !== undefined) updates.recipeUrl = recipeUrl;

  const [updated] = await db.update(savedMeals).set(updates).where(eq(savedMeals.id, id)).returning();

  // Keep linked plan items in sync when recipeUrl changes
  if (recipeUrl !== undefined) {
    await db.update(mealPlanItems).set({ recipeUrl }).where(eq(mealPlanItems.savedMealId, id));
  }

  // Replace ingredients if provided (even empty array clears them)
  let ingRows: typeof savedMealIngredients.$inferSelect[] = [];
  if (ingredients !== undefined) {
    await db.delete(savedMealIngredients).where(eq(savedMealIngredients.savedMealId, id));
    if (ingredients.length > 0) {
      ingRows = await db.insert(savedMealIngredients).values(
        ingredients.map((ing, i) => ({
          savedMealId: id,
          name: ing.name,
          quantity: ing.quantity ?? null,
          sortOrder: ing.sortOrder ?? i,
        }))
      ).returning();
    }
  } else {
    // Keep existing ingredients
    ingRows = await db.select().from(savedMealIngredients)
      .where(eq(savedMealIngredients.savedMealId, id))
      .orderBy(savedMealIngredients.sortOrder);
  }

  res.json(rowToSavedMeal(updated!, ingRows));
});

// DELETE /api/saved-meals/:id
mealPlannerRouter.delete('/saved-meals/:id', async (req, res) => {
  const id = Number.parseInt(req.params['id']!, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'Invalid id', code: 'VALIDATION_ERROR' });
    return;
  }

  const existing = await db.select({ id: savedMeals.id }).from(savedMeals).where(eq(savedMeals.id, id)).limit(1);
  if (!existing[0]) {
    res.status(404).json({ error: 'Saved meal not found', code: 'NOT_FOUND' });
    return;
  }

  await db.delete(savedMeals).where(eq(savedMeals.id, id));
  res.status(204).send();
});

// POST /api/saved-meals/:id/add-to-week
mealPlannerRouter.post('/saved-meals/:id/add-to-week', async (req, res) => {
  const savedMealId = Number.parseInt(req.params['id']!, 10);
  if (Number.isNaN(savedMealId)) {
    res.status(400).json({ error: 'Invalid saved meal id', code: 'VALIDATION_ERROR' });
    return;
  }

  const parsed = AddToWeekSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input', code: 'VALIDATION_ERROR' });
    return;
  }
  const { planId, days } = parsed.data;

  const savedMeal = await db.select().from(savedMeals).where(eq(savedMeals.id, savedMealId)).limit(1);
  if (!savedMeal[0]) {
    res.status(404).json({ error: 'Saved meal not found', code: 'NOT_FOUND' });
    return;
  }

  const plan = await db.select({ id: mealPlans.id }).from(mealPlans).where(eq(mealPlans.id, planId)).limit(1);
  if (!plan[0]) {
    res.status(404).json({ error: 'Meal plan not found', code: 'NOT_FOUND' });
    return;
  }

  const userId = (req.user as { id: number } | undefined)?.id ?? null;
  const [item] = await db.insert(mealPlanItems).values({
    planId,
    mealName: savedMeal[0].mealName,
    days,
    recipeUrl: savedMeal[0].recipeUrl,
    savedMealId: savedMeal[0].id,
    sortOrder: 0,
    createdBy: userId,
  }).returning();

  res.status(201).json(rowToItem(item!));
});
