import cron from 'node-cron';
import { logger } from '../lib/logger.js';
import { detectMeat, getTodaysMeal, sendTelegramMessage } from '../services/mealNotifications.js';

// ── 7 AM — dinner announcement ────────────────────────────────────────────────

async function morningMealNotification(): Promise<void> {
  try {
    const meal = await getTodaysMeal();
    if (!meal) {
      logger.info('[cron:7am] No meal planned for today — skipping notification');
      return;
    }

    const meat = detectMeat(meal.ingredients);
    let message: string;

    if (meat) {
      message =
        `🍽 <b>Tonight's dinner:</b> ${meal.mealName}\n` +
        `🥩 Contains <b>${meat}</b> — don't forget to get it out of the freezer!`;
    } else {
      message = `🍽 <b>Tonight's dinner:</b> ${meal.mealName}`;
    }

    await sendTelegramMessage(message);
    logger.info({ meal: meal.mealName, meat }, '[cron:7am] Meal notification sent');
  } catch (err) {
    logger.error(err, '[cron:7am] morningMealNotification failed');
  }
}

// ── 10 AM — freezer reminder ──────────────────────────────────────────────────

async function freezerReminder(): Promise<void> {
  try {
    const meal = await getTodaysMeal();
    if (!meal) return;

    const meat = detectMeat(meal.ingredients);
    if (!meat) return;

    const message =
      `⏰ <b>Freezer reminder:</b> get the <b>${meat}</b> out for tonight's ${meal.mealName}!`;

    await sendTelegramMessage(message);
    logger.info({ meal: meal.mealName, meat }, '[cron:10am] Freezer reminder sent');
  } catch (err) {
    logger.error(err, '[cron:10am] freezerReminder failed');
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────

export function startMealReminderCrons(): void {
  // 7:00 AM every day
  cron.schedule('0 7 * * *', morningMealNotification, { timezone: 'Europe/London' });
  // 10:00 AM every day
  cron.schedule('0 10 * * *', freezerReminder, { timezone: 'Europe/London' });
  logger.info('[cron] Meal reminder crons scheduled (07:00 and 10:00 Europe/London)');
}
