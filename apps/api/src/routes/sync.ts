import { AlexaResponseSchema } from '@shopping-list/shared';
import type { AlexaSyncResult } from '@shopping-list/shared';
import { eq, inArray } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db/index.js';
import { items } from '../db/schema.js';
import { logger } from '../lib/logger.js';
import { toItem } from '../lib/mappers.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { categorise, normalise } from '../services/categoriser.js';

export const syncRouter = Router();
syncRouter.use(requireAuth);

// POST /api/sync/alexa — bidirectional reconciliation with Alexa shopping list
//
// Four scenarios:
//   1. Active on Alexa, not in app        → add to app
//   2. In app, not on Alexa               → leave (already on our list; app is master)
//   3. Active on Alexa, already in app    → link alexaItemId if missing, skip
//   4. Completed on Alexa, still in app   → user ticked it in Alexa → check off in app
//
// What this does NOT do: mark items complete on Alexa during sync.
// That only happens when the user explicitly checks something off in the app.
syncRouter.post('/alexa', async (req, res) => {
  const alexaUrl = process.env['ALEXA_SERVICE_URL'];
  if (!alexaUrl) {
    res.status(503).json({ error: 'Alexa service URL not configured', code: 'ALEXA_UNAVAILABLE' });
    return;
  }

  // Fetch ALL Alexa items (active + completed) — completed=true needed to detect scenario 4
  let allAlexaItems: ReturnType<typeof AlexaResponseSchema.parse>;
  try {
    const response = await fetch(`${alexaUrl}/lists/shopping?completed=true`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      res.status(503).json({ error: 'Alexa service returned an error', code: 'ALEXA_ERROR' });
      return;
    }
    const raw = (await response.json()) as { data: unknown };
    allAlexaItems = AlexaResponseSchema.parse(raw.data);
  } catch (err) {
    const isSchemaError = err instanceof Error && err.constructor.name === 'ZodError';
    logger.error({ err, isSchemaError }, '[SYNC] Alexa fetch/parse failed');
    const message = isSchemaError
      ? 'Alexa service returned unexpected data format'
      : 'Failed to reach Alexa service';
    const code = isSchemaError ? 'ALEXA_SCHEMA_ERROR' : 'ALEXA_UNAVAILABLE';
    res.status(503).json({ error: message, code });
    return;
  }

  // Build lookup maps
  const activeAlexaItems  = allAlexaItems.filter((i) => !i.completed);
  const activeAlexaIds    = new Set(activeAlexaItems.map((i) => i.id));
  const completedAlexaIds = new Set(allAlexaItems.filter((i) => i.completed).map((i) => i.id));

  // Get all unchecked app items
  const existingItems = await db
    .select({ id: items.id, name: items.name, displayName: items.displayName, alexaItemId: items.alexaItemId })
    .from(items)
    .where(eq(items.checked, false));

  const existingByName    = new Map(existingItems.map((i) => [i.name, i]));
  const existingByAlexaId = new Map(existingItems.filter((i) => i.alexaItemId).map((i) => [i.alexaItemId!, i]));

  const result: AlexaSyncResult = { added: [], savedUncategorised: 0, skipped: [], removed: [] };

  // ── Scenario 1 & 3: process active Alexa items ──────────────────────────────
  for (const alexaItem of activeAlexaItems) {
    const normName = normalise(alexaItem.text);

    // Already linked by alexaItemId — matched, no action
    if (existingByAlexaId.has(alexaItem.id)) {
      result.skipped.push(alexaItem.text);
      continue;
    }

    // Name match — link the alexaItemId so future syncs use the faster ID path
    const nameMatch = existingByName.get(normName);
    if (nameMatch) {
      if (!nameMatch.alexaItemId) {
        await db.update(items).set({ alexaItemId: alexaItem.id }).where(eq(items.id, nameMatch.id));
        existingByAlexaId.set(alexaItem.id, { ...nameMatch, alexaItemId: alexaItem.id });
      }
      result.skipped.push(alexaItem.text);
      continue;
    }

    // New item from Alexa — add to app (no mark-complete on Alexa)
    const displayName = alexaItem.text.charAt(0).toUpperCase() + alexaItem.text.slice(1);
    const catResult   = await categorise(alexaItem.text);
    const category    = 'needsCategory' in catResult ? 'needs_categorising' : catResult.category;

    const [inserted] = await db
      .insert(items)
      .values({ name: normName, displayName, quantity: 1, category, alexaItemId: alexaItem.id, createdBy: req.user!.id })
      .returning();

    if (inserted) {
      if ('needsCategory' in catResult) {
        result.savedUncategorised++;
      } else {
        result.added.push(toItem(inserted));
      }
      existingByName.set(normName, { id: inserted.id, name: normName, displayName, alexaItemId: alexaItem.id });
    }
  }

  // ── Scenario 4: items completed on Alexa → check off in app ─────────────────
  // If an unchecked app item has an alexaItemId and that ID is now completed on
  // Alexa (not active), the user ticked it off via the Alexa app or an Echo device.
  const toCheckOff: number[] = [];
  for (const appItem of existingItems) {
    if (!appItem.alexaItemId) continue;
    if (!activeAlexaIds.has(appItem.alexaItemId) && completedAlexaIds.has(appItem.alexaItemId)) {
      toCheckOff.push(appItem.id);
      result.removed.push(appItem.displayName);
      logger.info({ alexaItemId: appItem.alexaItemId, name: appItem.name }, '[SYNC] Item ticked in Alexa — checking off in app');
    }
  }
  if (toCheckOff.length > 0) {
    await db.update(items).set({ checked: true }).where(inArray(items.id, toCheckOff));
  }

  res.json(result);
});
