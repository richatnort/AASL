import { AddItemSchema, ConfirmCategorySchema, DEFAULT_AISLE_ORDER, PatchItemSchema } from '@shopping-list/shared';
import type { AisleOrder, ItemsResponse } from '@shopping-list/shared';
import { and, eq } from 'drizzle-orm';
import { Router } from 'express';
import Groq from 'groq-sdk';
import { db } from '../db/index.js';
import { appSettings, items } from '../db/schema.js';
import { getAisleIndex } from '../lib/aisleSort.js';
import { logger } from '../lib/logger.js';
import { toItem } from '../lib/mappers.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { categorise, learnCategory, normalise } from '../services/categoriser.js';

// ── AI aisle matching (pass 3 fallback) ──────────────────────────────────────

const aisleAiCallLog: number[] = [];
function aisleAiAllowed(): boolean {
  const now = Date.now();
  while (aisleAiCallLog.length && aisleAiCallLog[0]! < now - 3_600_000) aisleAiCallLog.shift();
  if (aisleAiCallLog.length >= 20) return false; // 20 AI aisle calls/hour max
  aisleAiCallLog.push(now);
  return true;
}

async function aiMatchAisle(itemName: string, aisleOrder: AisleOrder): Promise<string | null> {
  if (!aisleAiAllowed()) return null;
  const t0 = Date.now();
  try {
    const groq = new Groq({ apiKey: process.env['GROQ_API_KEY'] });
    const aisleList = aisleOrder.map((g) => `${g.id}: ${g.name} (${g.terms.join(', ')})`).join('\n');
    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: `Which supermarket aisle does "${itemName}" belong to?\n\nAisles:\n${aisleList}\n\nReturn only the aisle id (e.g. "aisle_25"), or "null" if none fit.` }],
      model: 'llama-3.1-8b-instant',
      temperature: 0.1,
      max_tokens: 20,
    });
    const text = completion.choices[0]?.message?.content?.trim() ?? '';
    const validIds = new Set(aisleOrder.map((g) => g.id));
    const result = validIds.has(text) ? text : null;
    logger.info({ itemName, result, ms: Date.now() - t0 }, '[PERF] aisle-match');
    return result;
  } catch (err) {
    logger.warn({ err, itemName, ms: Date.now() - t0 }, '[AISLE-AI] aisle match failed');
    return null;
  }
}

export const itemsRouter = Router();
itemsRouter.use(requireAuth);

// GET /api/items — all unchecked items grouped by category
itemsRouter.get('/', async (_req, res) => {
  const t0 = Date.now();
  const [rows, settingsRows] = await Promise.all([
    db.select().from(items).where(eq(items.checked, false)).orderBy(items.displayName),
    db.select().from(appSettings),
  ]);

  const sm: Record<string, string> = {};
  for (const s of settingsRows) sm[s.key] = s.value;

  const sortMode = sm['supermarket_sort_mode'] === 'sainsburys_aisles' ? 'sainsburys_aisles' : 'az';
  let aisleOrder: AisleOrder = DEFAULT_AISLE_ORDER;
  if (sm['supermarket_aisle_order']) {
    try { aisleOrder = JSON.parse(sm['supermarket_aisle_order']!) as AisleOrder; } catch (e) { logger.warn({ err: e }, 'Failed to parse supermarket_aisle_order, using default'); }
  }

  const grouped: ItemsResponse = {};
  for (const row of rows) {
    if (!grouped[row.category]) grouped[row.category] = [];
    grouped[row.category]!.push(toItem(row));
  }

  if (sortMode === 'sainsburys_aisles' && grouped['supermarket']) {
    const totalGroups = aisleOrder.length;

    // Load AI aisle term cache from settings
    let aisleTermCache: Record<string, string> = {};
    if (sm['aisle_term_cache']) {
      try { aisleTermCache = JSON.parse(sm['aisle_term_cache']!) as Record<string, string>; } catch { /* ignore */ }
    }
    let cacheUpdated = false;

    // Three-pass aisle resolution per item (pass 1+2 sync, pass 3 AI async)
    const withIdx = await Promise.all(
      grouped['supermarket'].map(async (item) => {
        const normName = normalise(item.displayName);

        // Cache hit (AI-resolved previously) → skip all passes
        const cachedAisleId = aisleTermCache[normName];
        if (cachedAisleId) {
          const cachedIdx = aisleOrder.findIndex((g) => g.id === cachedAisleId);
          if (cachedIdx !== -1) return { item, idx: cachedIdx };
        }

        // Pass 1 + Pass 2 (sync)
        const idx = getAisleIndex(item.displayName, aisleOrder);
        if (idx < totalGroups) return { item, idx };

        // Pass 3: AI fallback
        const aisleId = await aiMatchAisle(item.displayName, aisleOrder);
        if (aisleId) {
          const aiIdx = aisleOrder.findIndex((g) => g.id === aisleId);
          if (aiIdx !== -1) {
            aisleTermCache[normName] = aisleId;
            cacheUpdated = true;
            return { item, idx: aiIdx };
          }
        }

        return { item, idx };
      })
    );

    // Persist updated AI cache back to settings
    if (cacheUpdated) {
      await db.insert(appSettings)
        .values({ key: 'aisle_term_cache', value: JSON.stringify(aisleTermCache) })
        .onConflictDoUpdate({ target: appSettings.key, set: { value: JSON.stringify(aisleTermCache) } });
    }

    grouped['supermarket'] = withIdx
      .sort((a, b) => a.idx !== b.idx ? a.idx - b.idx : a.item.displayName.localeCompare(b.item.displayName))
      .map(({ item, idx }) => ({ ...item, aisleMatched: idx < totalGroups }));
  }

  logger.info({ totalMs: Date.now() - t0, itemCount: rows.length, sortMode }, '[PERF] GET /api/items');
  res.json(grouped);
});

// POST /api/items — add item with auto-categorisation
itemsRouter.post('/', async (req, res) => {
  const t0 = Date.now();
  const parsed = AddItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input', code: 'VALIDATION_ERROR' });
    return;
  }
  const { name, quantity } = parsed.data;

  // Auto-capitalise first character
  const displayName = name.charAt(0).toUpperCase() + name.slice(1);
  const normName = normalise(name);

  // Check if already on the active list (ignore checked-off items so they can be re-added)
  const existing = await db.select({ id: items.id }).from(items)
    .where(and(eq(items.name, normName), eq(items.checked, false))).limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: 'Item already on the list', code: 'ALREADY_EXISTS' });
    return;
  }

  const result = await categorise(name);
  const category = 'needsCategory' in result ? 'needs_categorising' : result.category;

  const [inserted] = await db
    .insert(items)
    .values({ name: normName, displayName, quantity, category, createdBy: req.user!.id })
    .returning();

  if (!inserted) {
    res.status(500).json({ error: 'Failed to insert item', code: 'INTERNAL_ERROR' });
    return;
  }

  // Push to Alexa shopping list (bidirectional sync) — fire-and-update
  const alexaUrl = process.env['ALEXA_SERVICE_URL'];
  if (alexaUrl) {
    fetch(`${alexaUrl}/lists/shopping/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: displayName }),
    })
      .then(async (r) => {
        if (!r.ok) return;
        const body = await r.json() as { data?: { itemId?: string } };
        const alexaItemId = body.data?.itemId;
        if (alexaItemId) {
          await db.update(items).set({ alexaItemId }).where(eq(items.id, inserted.id));
        }
      })
      .catch(() => { /* Alexa unavailable — item saved locally, no alexaItemId */ });
  }

  logger.info({ totalMs: Date.now() - t0, category, name: normName }, '[PERF] POST /api/items');
  res.status(201).json(toItem(inserted));
});

// POST /api/items/recategorise — re-run categorisation on all unchecked items
itemsRouter.post('/recategorise', async (req, res) => {
  const allItems = await db
    .select({ id: items.id, name: items.name, category: items.category })
    .from(items)
    .where(eq(items.checked, false));

  let updated = 0;
  for (const item of allItems) {
    const result = await categorise(item.name);
    const newCat = 'category' in result ? result.category : 'needs_categorising';
    if (newCat !== item.category) {
      await db.update(items).set({ category: newCat }).where(eq(items.id, item.id));
      updated++;
    }
  }
  res.json({ updated });
});

// POST /api/items/confirm-category — assign category to an uncategorised item + persist learning rule
itemsRouter.post('/confirm-category', async (req, res) => {
  const parsed = ConfirmCategorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input', code: 'VALIDATION_ERROR' });
    return;
  }
  const { name, quantity, category, alexaItemId } = parsed.data;
  const displayName = name.charAt(0).toUpperCase() + name.slice(1);
  const normName = normalise(name);

  await learnCategory(name, category);

  // If the item already exists in needs_categorising, update it in place
  const [existing] = await db.select().from(items)
    .where(and(eq(items.name, normName), eq(items.category, 'needs_categorising'), eq(items.checked, false)))
    .limit(1);

  if (existing) {
    const [updated] = await db.update(items)
      .set({ category, quantity })
      .where(eq(items.id, existing.id))
      .returning();
    res.json(toItem(updated!));
    return;
  }

  // Otherwise insert (legacy path: item didn't exist yet)
  const [inserted] = await db
    .insert(items)
    .values({ name: normName, displayName, quantity, category, alexaItemId, createdBy: req.user!.id })
    .onConflictDoNothing()
    .returning();

  if (!inserted) {
    const [existingItem] = await db.select().from(items).where(eq(items.name, normName)).limit(1);
    if (!existingItem) {
      res.status(500).json({ error: 'Failed to find or create item', code: 'INTERNAL_ERROR' });
      return;
    }
    res.json(toItem(existingItem));
    return;
  }

  // Mark complete on Alexa if this item came from a sync
  if (alexaItemId) {
    const alexaUrl = process.env['ALEXA_SERVICE_URL'];
    if (alexaUrl) {
      fetch(`${alexaUrl}/lists/shopping/items/${alexaItemId}/complete`, { method: 'POST' })
        .catch((err: unknown) => { void err; });
    }
  }

  res.status(201).json(toItem(inserted));
});

// PATCH /api/items/:id — update quantity and/or checked state
itemsRouter.patch('/:id', async (req, res) => {
  const id = Number(req.params['id']);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'Invalid id', code: 'VALIDATION_ERROR' });
    return;
  }
  const parsed = PatchItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input', code: 'VALIDATION_ERROR' });
    return;
  }
  const setFields: { quantity?: number; checked?: boolean; displayName?: string; name?: string; category?: string } = {};
  if (parsed.data.quantity !== undefined) setFields.quantity = parsed.data.quantity;
  if (parsed.data.checked !== undefined) setFields.checked = parsed.data.checked;
  if (parsed.data.displayName !== undefined) {
    setFields.displayName = parsed.data.displayName;
    setFields.name = normalise(parsed.data.displayName);
    const catResult = await categorise(setFields.name);
    if ('category' in catResult) setFields.category = catResult.category;
  }

  const [updated] = await db
    .update(items)
    .set(setFields)
    .where(and(eq(items.id, id), eq(items.checked, false)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: 'Item not found', code: 'NOT_FOUND' });
    return;
  }

  // If item was checked off and came from Alexa, mark it complete there too
  let alexaWarning: string | null = null;
  if (parsed.data.checked === true && updated.alexaItemId) {
    const alexaUrl = process.env['ALEXA_SERVICE_URL'];
    if (alexaUrl) {
      try {
        const alexaResp = await fetch(
          `${alexaUrl}/lists/shopping/items/${updated.alexaItemId}/complete`,
          { method: 'POST', signal: AbortSignal.timeout(8_000) }
        );
        if (!alexaResp.ok) alexaWarning = 'Could not tick off on Alexa';
      } catch (err) {
        logger.warn({ err, alexaItemId: updated.alexaItemId }, '[ITEMS] Failed to mark Alexa item complete');
        alexaWarning = 'Could not tick off on Alexa';
      }
    }
  }

  res.json({ ...toItem(updated), alexaWarning });
});

// DELETE /api/items/:id — remove item
itemsRouter.delete('/:id', async (req, res) => {
  const id = Number(req.params['id']);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'Invalid id', code: 'VALIDATION_ERROR' });
    return;
  }
  const [deleted] = await db.delete(items).where(eq(items.id, id)).returning({ id: items.id, alexaItemId: items.alexaItemId });
  if (!deleted) {
    res.status(404).json({ error: 'Item not found', code: 'NOT_FOUND' });
    return;
  }
  // Mark complete on Alexa if the item was linked
  if (deleted.alexaItemId) {
    const alexaUrl = process.env['ALEXA_SERVICE_URL'];
    if (alexaUrl) {
      fetch(`${alexaUrl}/lists/shopping/items/${deleted.alexaItemId}/complete`, { method: 'POST' })
        .catch(() => { /* fire-and-forget */ });
    }
  }
  res.status(204).send();
});
