// Server-side internal types — not shared with the frontend.
// For the public API contract types, see @shopping-list/shared.

import type {
  appSettings,
  categoryOrder,
  categoryRules,
  giftCards,
  items,
  mealPlanItems,
  mealPlans,
  savedMealIngredients,
  savedMeals,
  users,
} from '../db/schema.js';

// Raw DB row shapes (as returned by Drizzle before mapping)
export type UserRow = typeof users.$inferSelect;
export type ItemRow = typeof items.$inferSelect;
export type CategoryRuleRow = typeof categoryRules.$inferSelect;
export type CategoryOrderRow = typeof categoryOrder.$inferSelect;
export type GiftCardRow = typeof giftCards.$inferSelect;
export type AppSettingRow = typeof appSettings.$inferSelect;
export type MealPlanRow = typeof mealPlans.$inferSelect;
export type MealPlanItemRow = typeof mealPlanItems.$inferSelect;
export type SavedMealRow = typeof savedMeals.$inferSelect;
export type SavedMealIngredientRow = typeof savedMealIngredients.$inferSelect;

// Categoriser service result
export type CategoriserResult = {
  category: string;
  source: 'db' | 'ai' | 'default';
};
