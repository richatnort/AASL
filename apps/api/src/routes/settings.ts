import type { AisleOrder, ShopSettingsWithMealPlanner, SupermarketSortMode } from '@shopping-list/shared';
import { DEFAULT_AISLE_ORDER } from '@shopping-list/shared';
import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db/index.js';
import { appSettings } from '../db/schema.js';
import { logger } from '../lib/logger.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

function buildSettingsResponse(rows: { key: string; value: string }[]): ShopSettingsWithMealPlanner {
  const obj: Record<string, string> = {};
  for (const row of rows) obj[row.key] = row.value;

  let supermarketSortMode: SupermarketSortMode = 'az';
  if (obj['supermarket_sort_mode'] === 'sainsburys_aisles') supermarketSortMode = 'sainsburys_aisles';

  let supermarketAisleOrder: AisleOrder = DEFAULT_AISLE_ORDER;
  if (obj['supermarket_aisle_order']) {
    try { supermarketAisleOrder = JSON.parse(obj['supermarket_aisle_order']!) as AisleOrder; } catch (e) { logger.warn({ err: e }, 'Failed to parse supermarket_aisle_order, using default'); }
  }

  return {
    shopDay: obj['shop_day'] != null ? Number(obj['shop_day']) : null,
    supermarketSortMode,
    supermarketAisleOrder,
    mealPlanStartDay: obj['meal_plan_start_day'] != null ? Number(obj['meal_plan_start_day']) : null,
  };
}

// GET /api/settings — return all app settings
settingsRouter.get('/', async (_req, res) => {
  const rows = await db.select().from(appSettings);
  res.json(buildSettingsResponse(rows));
});

// PATCH /api/settings — update one or more settings
settingsRouter.patch('/', async (req, res) => {
  const body = req.body as {
    shopDay?: number | null;
    supermarketSortMode?: SupermarketSortMode;
    supermarketAisleOrder?: AisleOrder;
    mealPlanStartDay?: number | null;
  };

  if (body.shopDay !== undefined) {
    if (body.shopDay === null) {
      await db.delete(appSettings).where(eq(appSettings.key, 'shop_day'));
    } else {
      const day = Number(body.shopDay);
      if (Number.isNaN(day) || day < 0 || day > 6) {
        res.status(400).json({ error: 'shopDay must be 0–6 or null', code: 'VALIDATION_ERROR' });
        return;
      }
      await db.insert(appSettings)
        .values({ key: 'shop_day', value: String(day) })
        .onConflictDoUpdate({ target: appSettings.key, set: { value: String(day) } });
    }
  }

  if (body.supermarketSortMode !== undefined) {
    if (body.supermarketSortMode !== 'az' && body.supermarketSortMode !== 'sainsburys_aisles') {
      res.status(400).json({ error: 'supermarketSortMode must be "az" or "sainsburys_aisles"', code: 'VALIDATION_ERROR' });
      return;
    }
    await db.insert(appSettings)
      .values({ key: 'supermarket_sort_mode', value: body.supermarketSortMode })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: body.supermarketSortMode } });
  }

  if (body.supermarketAisleOrder !== undefined) {
    if (!Array.isArray(body.supermarketAisleOrder) || body.supermarketAisleOrder.length > 100) {
      res.status(400).json({ error: 'supermarketAisleOrder must be an array of at most 100 groups', code: 'VALIDATION_ERROR' });
      return;
    }
    const serialised = JSON.stringify(body.supermarketAisleOrder);
    await db.insert(appSettings)
      .values({ key: 'supermarket_aisle_order', value: serialised })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: serialised } });
  }

  if (body.mealPlanStartDay !== undefined) {
    if (body.mealPlanStartDay === null) {
      await db.delete(appSettings).where(eq(appSettings.key, 'meal_plan_start_day'));
    } else {
      const day = Number(body.mealPlanStartDay);
      if (Number.isNaN(day) || day < 0 || day > 6) {
        res.status(400).json({ error: 'mealPlanStartDay must be 0–6 or null', code: 'VALIDATION_ERROR' });
        return;
      }
      await db.insert(appSettings)
        .values({ key: 'meal_plan_start_day', value: String(day) })
        .onConflictDoUpdate({ target: appSettings.key, set: { value: String(day) } });
    }
  }

  const rows = await db.select().from(appSettings);
  res.json(buildSettingsResponse(rows));
});

// POST /api/settings/aisle-term — add a term to an aisle group (for inline "assign to aisle" UI)
settingsRouter.post('/aisle-term', async (req, res) => {
  const { term, aisleId } = req.body as { term?: string; aisleId?: string };
  if (!term || typeof term !== 'string' || !aisleId || typeof aisleId !== 'string') {
    res.status(400).json({ error: 'term and aisleId are required strings', code: 'VALIDATION_ERROR' });
    return;
  }

  const rows = await db.select().from(appSettings);
  const sm: Record<string, string> = {};
  for (const row of rows) sm[row.key] = row.value;

  let aisleOrder: AisleOrder = DEFAULT_AISLE_ORDER;
  if (sm['supermarket_aisle_order']) {
    try { aisleOrder = JSON.parse(sm['supermarket_aisle_order']!) as AisleOrder; } catch { /* use default */ }
  }

  const group = aisleOrder.find((g) => g.id === aisleId);
  if (!group) {
    res.status(404).json({ error: `Aisle group '${aisleId}' not found`, code: 'NOT_FOUND' });
    return;
  }

  const normTerm = term.trim().toLowerCase();
  if (normTerm.length === 0 || normTerm.length > 100) {
    res.status(400).json({ error: 'term must be between 1 and 100 characters', code: 'VALIDATION_ERROR' });
    return;
  }
  if (!group.terms.includes(normTerm)) {
    group.terms.push(normTerm);
  }

  const serialised = JSON.stringify(aisleOrder);
  await db.insert(appSettings)
    .values({ key: 'supermarket_aisle_order', value: serialised })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: serialised } });

  res.json({ aisleId, term: normTerm, aisleOrder });
});
