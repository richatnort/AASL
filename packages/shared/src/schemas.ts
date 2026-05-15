import { z } from 'zod';

// Category key validation — accepts any non-empty string (built-in or custom)
export const CategorySchema = z.string().min(1);

// POST /api/items
export const AddItemSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200, 'Name too long').trim(),
  quantity: z.number().int().min(1).default(1),
});
export type AddItemInput = z.infer<typeof AddItemSchema>;

// POST /api/items/confirm-category
export const ConfirmCategorySchema = z.object({
  name: z.string().min(1).max(200).trim(),
  quantity: z.number().int().min(1).default(1),
  category: CategorySchema,
  alexaItemId: z.string().optional(),
});
export type ConfirmCategoryInput = z.infer<typeof ConfirmCategorySchema>;

// PATCH /api/items/:id
export const PatchItemSchema = z.object({
  quantity: z.number().int().min(1).optional(),
  checked:  z.boolean().optional(),
  displayName: z.string().min(1).max(200).trim().optional(),
}).refine((d) => d.quantity !== undefined || d.checked !== undefined || d.displayName !== undefined, {
  message: 'At least one field required',
});
export type PatchItemInput = z.infer<typeof PatchItemSchema>;

// Alexa items response validation — applied at the API boundary
export const AlexaItemSchema = z.object({
  id: z.string(),
  text: z.string(),
  completed: z.boolean(),
});
export const AlexaResponseSchema = z.array(AlexaItemSchema);
export type AlexaItem = z.infer<typeof AlexaItemSchema>;

// ── Settings schemas ──────────────────────────────────────────────────────────

// PATCH /api/rules/:term
export const UpdateRuleSchema = z.object({
  category: z.string().min(1),
});
export type UpdateRuleInput = z.infer<typeof UpdateRuleSchema>;

// PATCH /api/categories/:key
export const UpsertCategorySchema = z.object({
  displayName: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a 6-digit hex colour e.g. #f06c00'),
});
export type UpsertCategoryInput = z.infer<typeof UpsertCategorySchema>;

// POST /api/categories
export const AddCategorySchema = z.object({
  key: z.string().min(1).max(50).regex(/^[a-z0-9_-]+$/, 'Key must be lowercase letters, numbers, hyphens or underscores'),
  displayName: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a 6-digit hex colour e.g. #f06c00'),
});
export type AddCategoryInput = z.infer<typeof AddCategorySchema>;

// POST /api/gift-cards and PATCH /api/gift-cards/:id
export const GiftCardSchema = z.object({
  name: z.string().min(1).max(100),
  categoryKey: z.string().min(1),
  cardNumber: z.string().min(1).max(50),
  pin: z.string().min(1).max(20),
  balanceCheckUrl: z.string().url('Must be a valid URL'),
});
export type GiftCardInput = z.infer<typeof GiftCardSchema>;

// ── Meal Planner schemas ──────────────────────────────────────────────────────

const safeRecipeUrl = z
  .string()
  .url('Must be a valid URL')
  .refine(
    (u) => /^https?:\/\//i.test(u),
    'URL must use http or https'
  );

// null = explicitly clear an existing URL; undefined = leave unchanged
const safeRecipeUrlOrNull = safeRecipeUrl.nullable();

export const MealPlanItemSchema = z.object({
  mealName: z
    .string()
    .min(1, 'Meal name is required')
    .max(200, 'Meal name too long')
    .trim()
    .refine((v) => !/<[^>]*>/.test(v), 'Meal name cannot contain HTML tags')
    .refine((v) => !/javascript:/i.test(v), 'Invalid meal name'),
  days: z
    .array(z.number().int().min(0).max(6))
    .min(1, 'Select at least one day')
    .refine((arr) => new Set(arr).size === arr.length, 'Duplicate days not allowed'),
  recipeUrl: safeRecipeUrlOrNull.optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  // When editing: optionally link to a saved meal to toggle library membership
  savedMealId: z.number().int().optional(),
  saveToLibrary: z.boolean().optional(),
});
export type MealPlanItemInput = z.infer<typeof MealPlanItemSchema>;

export const CreateMealPlanSchema = z.object({
  weekStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
});
export type CreateMealPlanInput = z.infer<typeof CreateMealPlanSchema>;

const savedMealIngredientSchema = z.object({
  name: z.string().min(1, 'Ingredient name is required').max(200, 'Ingredient name too long').trim(),
  quantity: z.string().max(50, 'Quantity too long').trim().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const SavedMealSchema = z.object({
  mealName: z
    .string()
    .min(1, 'Meal name is required')
    .max(200, 'Meal name too long')
    .trim()
    .refine((v) => !/<[^>]*>/.test(v), 'Meal name cannot contain HTML tags')
    .refine((v) => !/javascript:/i.test(v), 'Invalid meal name'),
  recipeUrl: safeRecipeUrlOrNull.optional(),
  ingredients: z.array(savedMealIngredientSchema).optional(),
});
export type SavedMealInput = z.infer<typeof SavedMealSchema>;

export const AddToWeekSchema = z.object({
  planId: z.number().int().min(1),
  days: z
    .array(z.number().int().min(0).max(6))
    .min(1, 'Select at least one day')
    .refine((arr) => new Set(arr).size === arr.length, 'Duplicate days not allowed'),
});
export type AddToWeekInput = z.infer<typeof AddToWeekSchema>;
