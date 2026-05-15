import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { mealPlanItems, mealPlans, savedMealIngredients, savedMeals } from '../db/schema.js';
import { logger } from '../lib/logger.js';

// ── Week start ────────────────────────────────────────────────────────────────

/** Returns the Monday of the given date's week as YYYY-MM-DD */
export function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon…6=Sat
  const diff = day === 0 ? -6 : 1 - day; // shift back to Monday
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0]!;
}

// ── Meat detection ────────────────────────────────────────────────────────────

const MEAT_KEYWORDS = [
  'chicken', 'beef', 'lamb', 'pork', 'mince', 'bacon', 'sausage', 'sausages',
  'turkey', 'duck', 'venison', 'salmon', 'tuna', 'cod', 'haddock', 'prawn',
  'prawns', 'shrimp', 'gammon', 'ham', 'steak', 'brisket', 'chorizo',
  'pancetta', 'lardons', 'mackerel', 'trout', 'fish', 'meatball', 'meatballs',
  'ribs', 'chops', 'chop',
];

/** Returns the first matched meat keyword found in the ingredient list, or null */
export function detectMeat(ingredients: string[]): string | null {
  for (const ingredient of ingredients) {
    const lower = ingredient.toLowerCase();
    for (const keyword of MEAT_KEYWORDS) {
      if (lower.includes(keyword)) return keyword;
    }
  }
  return null;
}

// ── Today's meal ──────────────────────────────────────────────────────────────

export interface TodaysMeal {
  mealName: string;
  ingredients: string[];
}

/**
 * Looks up the current week's meal plan and returns the meal assigned to today.
 * Ingredients are populated from saved_meal_ingredients if the item is linked to
 * a saved meal; otherwise the list is empty (meal has no tracked ingredients).
 */
export async function getTodaysMeal(): Promise<TodaysMeal | null> {
  const now = new Date();
  const weekStart = getWeekStart(now);
  const todayDow = now.getDay(); // 0=Sun…6=Sat

  // Find the plan for this week
  const [plan] = await db
    .select({ id: mealPlans.id })
    .from(mealPlans)
    .where(eq(mealPlans.weekStart, weekStart))
    .limit(1);

  if (!plan) return null;

  // Find a meal item that includes today's day-of-week
  const items = await db
    .select()
    .from(mealPlanItems)
    .where(eq(mealPlanItems.planId, plan.id));

  const todayItem = items.find(item => item.days.includes(todayDow));
  if (!todayItem) return null;

  // Fetch ingredients from the linked saved meal (if any)
  let ingredients: string[] = [];
  if (todayItem.savedMealId !== null) {
    const rows = await db
      .select({ name: savedMealIngredients.name })
      .from(savedMealIngredients)
      .where(eq(savedMealIngredients.savedMealId, todayItem.savedMealId));
    ingredients = rows.map(r => r.name);
  }

  return { mealName: todayItem.mealName, ingredients };
}

// ── Telegram ──────────────────────────────────────────────────────────────────

export async function sendTelegramMessage(text: string): Promise<void> {
  const token = process.env['TELEGRAM_BOT_TOKEN'];
  const chatId = process.env['TELEGRAM_CHAT_ID'];
  if (!token || !chatId) {
    logger.warn('Telegram env vars not set — skipping notification');
    return;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const body = await res.text();
      logger.error({ status: res.status, body }, 'Telegram sendMessage failed');
    }
  } catch (err) {
    logger.error(err, 'Telegram sendMessage threw');
  }
}
