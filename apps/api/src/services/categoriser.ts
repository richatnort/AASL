import type { BuiltInCategory } from '@shopping-list/shared';
import { eq, sql } from 'drizzle-orm';
import Groq from 'groq-sdk';
import { db } from '../db/index.js';
import { categoryRules } from '../db/schema.js';
import { logger } from '../lib/logger.js';

// Keyword seed dictionary — TypeScript port of categoriser/seeds.js
const SEEDS: Record<BuiltInCategory, string[]> = {
  greengrocers: [
    'apple', 'pear', 'banana', 'grape', 'strawberry', 'raspberry', 'blueberry',
    'blackberry', 'cherry', 'mango', 'pineapple', 'melon', 'watermelon', 'peach',
    'plum', 'apricot', 'kiwi', 'lemon', 'lime', 'orange', 'grapefruit', 'avocado',
    'carrot', 'potato', 'sweet potato', 'onion', 'garlic', 'leek', 'celery',
    'broccoli', 'cauliflower', 'cabbage', 'kale', 'spinach', 'lettuce', 'rocket',
    'cucumber', 'courgette', 'aubergine', 'pepper', 'chilli', 'tomato', 'mushroom',
    'asparagus', 'artichoke', 'beetroot', 'parsnip', 'turnip', 'swede', 'pea',
    'bean', 'corn', 'sweetcorn', 'fennel', 'ginger', 'herbs', 'basil', 'coriander',
    'parsley', 'mint', 'thyme', 'rosemary', 'sage', 'dill', 'chive',
  ],
  butchers: [
    'chicken', 'beef', 'pork', 'lamb', 'mince', 'steak', 'sausage', 'bacon',
    'turkey', 'duck', 'goose', 'venison', 'rabbit', 'gammon', 'ham', 'salami',
    'chorizo', 'prosciutto', 'pancetta', 'lardons', 'brisket', 'ribs', 'chop',
    'fillet', 'breast', 'thigh', 'drumstick', 'wing', 'liver', 'kidney',
    'meatball', 'burger', 'patty', 'roast', 'joint', 'rack',
  ],
  supermarket: [
    'bread', 'milk', 'butter', 'cheese', 'cream', 'yogurt', 'egg', 'flour',
    'sugar', 'salt', 'pepper', 'oil', 'vinegar', 'pasta', 'rice', 'noodle',
    'cereal', 'oat', 'granola', 'juice', 'water', 'squash', 'fizzy', 'cola',
    'coffee', 'tea', 'cocoa', 'chocolate', 'biscuit', 'crisp', 'snack', 'nut',
    'jam', 'honey', 'spread', 'ketchup', 'sauce', 'mayo', 'mustard', 'dressing',
    'stock', 'tin', 'can', 'soup', 'beans', 'lentil', 'chickpea', 'tofu',
    'frozen', 'ice cream', 'pizza', 'pie', 'pastry', 'wrap', 'tortilla',
    'cracker', 'roll', 'bagel', 'muffin', 'cake', 'toilet', 'kitchen roll',
    'washing', 'detergent', 'shampoo', 'conditioner', 'soap', 'toothpaste',
    'tomato puree', 'tomato paste', 'passata', 'tinned tomato',
  ],
  needs_categorising: [], // no keywords — items end up here only when AI fails
};

export function normalise(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export type CategoriseResult =
  | { category: string }
  | { needsCategory: true };

// ── AI rate limiter: max 50 calls/hour per process ────────────────────────────
const AI_CALL_LIMIT_PER_HOUR = 50;
const aiCallLog: number[] = [];

function aiCallAllowed(): boolean {
  const now = Date.now();
  while (aiCallLog.length && aiCallLog[0]! < now - 3_600_000) aiCallLog.shift();
  if (aiCallLog.length >= AI_CALL_LIMIT_PER_HOUR) return false;
  aiCallLog.push(now);
  return true;
}

async function categoriseWithAI(term: string): Promise<string | null> {
  if (!aiCallAllowed()) return null;
  const t0 = Date.now();
  try {
    const groq = new Groq({ apiKey: process.env['GROQ_API_KEY'] });
    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: `Categorise this shopping item into exactly one of: greengrocers, butchers, supermarket.\n\ngreengrocers = fresh fruit, vegetables, herbs\nbutchers = meat, poultry, charcuterie\nsupermarket = everything else (dairy, dry goods, frozen, household)\n\nItem: "${term}"\n\nReply with only the category name, nothing else.` }],
      model: 'llama-3.1-8b-instant',
      temperature: 0.1,
      max_tokens: 20,
    });
    const text = completion.choices[0]?.message?.content?.trim().toLowerCase() ?? '';
    const result = ['greengrocers', 'butchers', 'supermarket'].includes(text) ? text : null;
    logger.info({ term, result, ms: Date.now() - t0 }, '[PERF] categorise-ai');
    return result;
  } catch (err) {
    logger.warn({ err, term, ms: Date.now() - t0 }, '[CATEGORISE] AI categorisation failed');
    return null;
  }
}

export async function categorise(rawName: string): Promise<CategoriseResult> {
  const term = normalise(rawName);

  // 1. Check learned rules table first (household-shared)
  const rule = await db
    .select({ category: categoryRules.category })
    .from(categoryRules)
    .where(eq(categoryRules.term, term))
    .limit(1);

  if (rule[0]) {
    return { category: rule[0].category };
  }

  // 2. Substring keyword match against seed dictionary
  for (const [category, keywords] of Object.entries(SEEDS) as [BuiltInCategory, string[]][]) {
    for (const keyword of keywords) {
      if (term.includes(keyword)) {
        return { category };
      }
    }
  }

  // 3. Try AI categorisation
  const aiCat = await categoriseWithAI(term);
  if (aiCat) {
    await learnCategory(term, aiCat, 'ai');
    return { category: aiCat };
  }

  // 4. No match — flag for manual categorisation
  return { needsCategory: true };
}

/** Seed hardcoded SEEDS into categoryRules at startup — onConflictDoNothing preserves user overrides. */
export async function seedCategoryRules(): Promise<void> {
  const entries = Object.entries(SEEDS) as [BuiltInCategory, string[]][];
  const rows = entries.flatMap(([category, keywords]) =>
    keywords.map((keyword) => ({ term: keyword, category, source: 'seed' as const, confirmedCount: 1 }))
  );
  if (rows.length === 0) return;
  await db.insert(categoryRules).values(rows).onConflictDoNothing();
  logger.info({ count: rows.length }, '[SEED] Category rules seeded into DB');
}

export async function learnCategory(rawName: string, category: string, source: 'ai' | 'manual' = 'manual'): Promise<void> {
  const term = normalise(rawName);
  await db
    .insert(categoryRules)
    .values({ term, category, source, confirmedCount: 1 })
    .onConflictDoUpdate({
      target: categoryRules.term,
      set: {
        category,
        source,
        confirmedCount: sql`${categoryRules.confirmedCount} + 1`,
        updatedAt: new Date(),
      },
    });
}
