import 'express-async-errors';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env relative to this file — works regardless of CWD
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// Startup guard — catch missing required secrets before any connections open
if (process.env['NODE_ENV'] === 'production' && !process.env['SESSION_SECRET']) {
  console.error('[FATAL] SESSION_SECRET must be set in production. Exiting.');
  process.exit(1);
}

import connectPgSimple from 'connect-pg-simple';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import session from 'express-session';
import helmet from 'helmet';
import passport from 'passport';

import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { startMealReminderCrons } from './cron/mealReminders.js';
import { db, pingDb, pool } from './db/index.js';
import { logger } from './lib/logger.js';
import { adminRouter } from './routes/admin.js';
import { alexaConfigRouter } from './routes/alexaConfig.js';
import { authRouter, configurePassport } from './routes/auth.js';
import { categoriesRouter } from './routes/categories.js';
import { giftCardsRouter } from './routes/giftCards.js';
import { itemsRouter } from './routes/items.js';
import { mealPlannerRouter } from './routes/mealPlanner.js';
import { recipesRouter } from './routes/recipes.js';
import { rulesRouter } from './routes/rules.js';
import { settingsRouter } from './routes/settings.js';
import { suggestionsRouter } from './routes/suggestions.js';
import { syncRouter } from './routes/sync.js';
import { seedCategoryRules } from './services/categoriser.js';

// ── App ──────────────────────────────────────────────────────────────────────
const app = express();

// Trust nginx reverse proxy (required for rate-limit and secure cookies behind proxy)
app.set('trust proxy', 1);

app.use(helmet());
app.use(express.json());

// ── Sessions (persisted in PostgreSQL) ───────────────────────────────────────
const PgSession = connectPgSimple(session);
app.use(
  session({
    store: new PgSession({ pool, createTableIfMissing: true }),
    secret: process.env['SESSION_SECRET'] ?? 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
  })
);

// ── Passport ─────────────────────────────────────────────────────────────────
configurePassport();
app.use(passport.initialize());
app.use(passport.session());

// ── Rate limiting ─────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests', code: 'RATE_LIMITED' },
});

const mealPlanLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests', code: 'RATE_LIMITED' },
});

const recipeLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests', code: 'RATE_LIMITED' },
});

const globalLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests', code: 'RATE_LIMITED' },
});

// ── Routes ───────────────────────────────────────────────────────────────────
app.use(globalLimiter);
app.use('/auth', authLimiter, authRouter);
app.use('/api/items', itemsRouter);
app.use('/api/sync', syncRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/rules', rulesRouter);
app.use('/api/alexa', alexaConfigRouter);
app.use('/api/gift-cards', giftCardsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/suggestions', suggestionsRouter);
app.use('/api/recipes', recipeLimiter, recipesRouter);
app.use('/api', mealPlanLimiter, mealPlannerRouter);
app.use('/admin', adminRouter);

// ── Health ───────────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  const dbOk = await pingDb();
  let alexaOk: 'ok' | 'error' | 'unknown' = 'unknown';
  try {
    const url = process.env['ALEXA_SERVICE_URL'];
    if (url) {
      const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) });
      alexaOk = r.ok ? 'ok' : 'error';
    }
  } catch {
    alexaOk = 'error';
  }
  const status = dbOk ? 'ok' : 'degraded';
  res.status(dbOk ? 200 : 503).json({ status, db: dbOk ? 'ok' : 'error', alexa: alexaOk });
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error(err, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
});

// ── Start ────────────────────────────────────────────────────────────────────
const port = Number(process.env['PORT'] ?? 3001);

// Run any pending Drizzle migrations before accepting traffic
const migrationsFolder = path.resolve(__dirname, '../drizzle');
await migrate(db, { migrationsFolder });
logger.info({ migrationsFolder }, 'DB migrations applied');

await seedCategoryRules();

if (process.env['TELEGRAM_BOT_TOKEN'] && process.env['TELEGRAM_CHAT_ID']) {
  startMealReminderCrons();
}

app.listen(port, () => {
  logger.info({ port }, 'API server listening');
});
