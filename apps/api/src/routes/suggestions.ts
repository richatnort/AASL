import { and, eq, gte, ne, sql } from 'drizzle-orm';
import { Router } from 'express';
import Groq from 'groq-sdk';
import { db } from '../db/index.js';
import { appSettings, items } from '../db/schema.js';
import { logger } from '../lib/logger.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const suggestionsRouter = Router();
suggestionsRouter.use(requireAuth);

// GET /api/suggestions/shop-day — AI suggestions for upcoming shop day
suggestionsRouter.get('/shop-day', async (_req, res) => {
  const t0 = Date.now();

  // Read shop_day setting
  const [setting] = await db.select().from(appSettings).where(eq(appSettings.key, 'shop_day')).limit(1);
  if (!setting) {
    res.json({ suggestions: [], message: null, isShopDay: false, isTomorrow: false });
    return;
  }

  const shopDay = Number(setting.value); // 0=Sun … 6=Sat
  const now = new Date();
  const todayDay = now.getDay();
  const tomorrowDay = (todayDay + 1) % 7;

  const isShopDay = todayDay === shopDay;
  const isTomorrow = tomorrowDay === shopDay;

  if (!isShopDay && !isTomorrow) {
    res.json({ suggestions: [], message: null, isShopDay, isTomorrow });
    return;
  }

  // Query items table for most frequently added in last 8 weeks (includes checked-off)
  const eightWeeksAgo = new Date(Date.now() - 8 * 7 * 24 * 60 * 60 * 1000);

  const historicRows = await db
    .select({
      name: items.name,
      displayName: items.displayName,
      count: sql<number>`count(*)::int`,
    })
    .from(items)
    .where(and(gte(items.createdAt, eightWeeksAgo), ne(items.category, 'needs_categorising')))
    .groupBy(items.name, items.displayName)
    .orderBy(sql`count(*) DESC`)
    .limit(20);

  // Get currently active items to exclude
  const activeRows = await db
    .select({ name: items.name })
    .from(items)
    .where(eq(items.checked, false));
  const activeNames = new Set(activeRows.map((r) => r.name));

  const candidates = historicRows
    .filter((r) => !activeNames.has(r.name))
    .slice(0, 10);

  if (candidates.length === 0) {
    res.json({ suggestions: [], message: null, isShopDay, isTomorrow });
    return;
  }

  // Ask AI to format a friendly message + shortlist
  let suggestions: string[] = candidates.map((c) => c.displayName);
  let message: string | null = null;

  const aiT0 = Date.now();
  try {
    const groq = new Groq({ apiKey: process.env['GROQ_API_KEY'] });
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const context = isTomorrow
      ? `Tomorrow (${dayNames[shopDay]}) is their weekly shop day.`
      : "Today is their weekly shop day.";
    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: `${context} Based on their recent shopping history, suggest which of these items they likely need. Return a JSON object with two fields: "message" (a short friendly reminder, 1 sentence, no emoji) and "suggestions" (array of item names from the list, max 8, most important first).\n\nItems: ${candidates.map((c) => c.displayName).join(', ')}\n\nReturn only valid JSON, nothing else.` }],
      model: 'llama-3.1-8b-instant',
      temperature: 0.3,
      max_tokens: 512,
    });
    const text = completion.choices[0]?.message?.content?.trim() ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch?.[0] ?? text) as { message?: string; suggestions?: string[] };
    if (parsed.message) message = parsed.message;
    if (Array.isArray(parsed.suggestions)) suggestions = parsed.suggestions.slice(0, 8);
    logger.info({ aiMs: Date.now() - aiT0, totalMs: Date.now() - t0, isShopDay, isTomorrow, suggestionCount: suggestions.length }, '[PERF] GET /api/suggestions/shop-day');
  } catch (err) {
    logger.warn({ err, aiMs: Date.now() - aiT0, totalMs: Date.now() - t0 }, '[SUGGESTIONS] AI formatting failed — using raw list');
    message = isTomorrow
      ? "Tomorrow is your weekly shop — here are some regulars you might need:"
      : "It's your weekly shop day — here are some regulars you might need:";
  }

  res.json({ suggestions, message, isShopDay, isTomorrow });
});
