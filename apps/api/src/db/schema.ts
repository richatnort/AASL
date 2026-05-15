import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

// Sessions are managed by connect-pg-simple — table auto-created on first run.

export const users = pgTable('users', {
  id:        serial('id').primaryKey(),
  googleId:  text('google_id').unique().notNull(),
  email:     text('email').notNull(),
  name:      text('name'),
  approved:  boolean('approved').default(false).notNull(),
  isAdmin:   boolean('is_admin').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const items = pgTable('items', {
  id:          serial('id').primaryKey(),
  name:        text('name').notNull(),         // normalised: "apples"
  displayName: text('display_name').notNull(), // as entered: "Apples"
  quantity:    integer('quantity').default(1).notNull(),
  category:    text('category').notNull(),     // any string — no enum constraint
  alexaItemId: text('alexa_item_id'),
  checked:     boolean('checked').default(false).notNull(),
  createdBy:   integer('created_by').references(() => users.id),
  createdAt:   timestamp('created_at').defaultNow(),
});

export const categoryRules = pgTable('category_rules', {
  term:           text('term').primaryKey(), // normalised: "eggs"
  category:       text('category').notNull(), // any string — no enum constraint
  source:         text('source').default('manual').notNull(), // 'ai' | 'manual'
  confirmedCount: integer('confirmed_count').default(1).notNull(),
  updatedAt:      timestamp('updated_at').defaultNow().$onUpdateFn(() => new Date()),
});

// ── Category display order + customisation ────────────────────────────────────
export const categoryOrder = pgTable('category_order', {
  category:    text('category').primaryKey(),
  sortOrder:   integer('sort_order').notNull(),
  displayName: text('display_name'),
  color:       text('color'),
  isBuiltIn:   boolean('is_built_in').default(true).notNull(),
});

// ── Gift cards ────────────────────────────────────────────────────────────────
export const giftCards = pgTable('gift_cards', {
  id:              serial('id').primaryKey(),
  name:            text('name').notNull(),
  categoryKey:     text('category_key').notNull(),
  cardNumber:      text('card_number').notNull(),
  pin:             text('pin').notNull(),
  balanceCheckUrl: text('balance_check_url').notNull(),
  lastBalance:     text('last_balance'),
  lastCheckedAt:   timestamp('last_checked_at'),
});

// ── App settings — simple key/value store ────────────────────────────────────
export const appSettings = pgTable('app_settings', {
  key:   text('key').primaryKey(),
  value: text('value').notNull(),
});

// ── Meal Planner ─────────────────────────────────────────────────────────────

export const mealPlans = pgTable('meal_plans', {
  id:        serial('id').primaryKey(),
  weekStart: date('week_start').notNull().unique(), // ISO date "2026-03-18"; one plan per week globally
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().$onUpdateFn(() => new Date()),
});

export const mealPlanItems = pgTable('meal_plan_items', {
  id:           serial('id').primaryKey(),
  planId:       integer('plan_id').notNull().references(() => mealPlans.id, { onDelete: 'cascade' }),
  mealName:     text('meal_name').notNull(),
  days:         integer('days').array().notNull(), // absolute day-of-week: 0=Sun…6=Sat
  recipeUrl:    text('recipe_url'),
  savedMealId:  integer('saved_meal_id').references(() => savedMeals.id, { onDelete: 'set null' }),
  sortOrder:    integer('sort_order').notNull().default(0),
  createdBy:    integer('created_by').references(() => users.id),
  createdAt:    timestamp('created_at').defaultNow(),
  updatedAt:    timestamp('updated_at').defaultNow().$onUpdateFn(() => new Date()),
});

export const savedMeals = pgTable('saved_meals', {
  id:        serial('id').primaryKey(),
  mealName:  text('meal_name').notNull(),
  recipeUrl: text('recipe_url'),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().$onUpdateFn(() => new Date()),
});

export const savedMealIngredients = pgTable('saved_meal_ingredients', {
  id:          serial('id').primaryKey(),
  savedMealId: integer('saved_meal_id').notNull().references(() => savedMeals.id, { onDelete: 'cascade' }),
  name:        text('name').notNull(),
  quantity:    text('quantity'),
  sortOrder:   integer('sort_order').notNull().default(0),
});

// ── Future: Phase 7 — smart aisle sorting ────────────────────────────────────
// Sort query: ORDER BY am.aisle_order NULLS LAST, i.display_name
export const aisleMap = pgTable('aisle_map', {
  id:         serial('id').primaryKey(),
  term:       text('term').notNull(),   // normalised item term
  aisleName:  text('aisle_name'),       // "Bakery", "World Foods"
  aisleOrder: integer('aisle_order'),   // 1..n — user-defined store walk order
});

// ── Future: Phase 6 — AI recipe agent ────────────────────────────────────────
// ingredients JSONB shape: [{ name, quantity, unit, isStaple }]
export const recipes = pgTable('recipes', {
  id:          serial('id').primaryKey(),
  name:        text('name').notNull(),
  rawText:     text('raw_text'),
  ingredients: jsonb('ingredients'),
  createdBy:   integer('created_by').references(() => users.id),
  createdAt:   timestamp('created_at').defaultNow(),
});
