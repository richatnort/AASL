import type {
  AisleOrder,
  AlexaStatus,
  AlexaSyncResult,
  CategoryConfig,
  CategoryRule,
  GiftCard,
  Item,
  ItemsResponse,
  MealPlan,
  MealPlanItem,
  NeedsCategoryResponse,
  SavedMeal,
  ShopSettingsWithMealPlanner,
  User,
} from '@shopping-list/shared';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ApiError = { error: string; code: string };

type AddItemResult = Item | NeedsCategoryResponse;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error', code: 'UNKNOWN' }));
    throw body as ApiError;
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export function getMe(): Promise<User> {
  return request<User>('/auth/me');
}

// ── Items ─────────────────────────────────────────────────────────────────────

export function getItems(): Promise<ItemsResponse> {
  return request<ItemsResponse>('/api/items');
}

export function addItem(name: string, quantity = 1): Promise<AddItemResult> {
  return request<AddItemResult>('/api/items', {
    method: 'POST',
    body: JSON.stringify({ name, quantity }),
  });
}

export function confirmCategory(
  name: string,
  quantity: number,
  category: string,
  alexaItemId?: string,
): Promise<Item> {
  return request<Item>('/api/items/confirm-category', {
    method: 'POST',
    body: JSON.stringify({ name, quantity, category, alexaItemId }),
  });
}

export function patchItem(id: number, quantity: number): Promise<Item> {
  return request<Item>(`/api/items/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ quantity }),
  });
}

export function checkItem(id: number): Promise<Item & { alexaWarning?: string | null }> {
  return request<Item & { alexaWarning?: string | null }>(`/api/items/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ checked: true }),
  });
}

export function deleteItem(id: number): Promise<void> {
  return request<void>(`/api/items/${id}`, { method: 'DELETE' });
}

// ── Categories ────────────────────────────────────────────────────────────────

export function getCategoryConfig(): Promise<CategoryConfig[]> {
  return request<CategoryConfig[]>('/api/categories/config');
}

export function setCategoryOrder(order: string[]): Promise<string[]> {
  return request<string[]>('/api/categories/order', {
    method: 'PATCH',
    body: JSON.stringify({ order }),
  });
}

export function upsertCategory(key: string, displayName: string, color: string): Promise<CategoryConfig> {
  return request<CategoryConfig>(`/api/categories/${encodeURIComponent(key)}`, {
    method: 'PATCH',
    body: JSON.stringify({ displayName, color }),
  });
}

export function addCategory(key: string, displayName: string, color: string): Promise<CategoryConfig> {
  return request<CategoryConfig>('/api/categories', {
    method: 'POST',
    body: JSON.stringify({ key, displayName, color }),
  });
}

export function deleteCategory(key: string): Promise<void> {
  return request<void>(`/api/categories/${encodeURIComponent(key)}`, { method: 'DELETE' });
}

// ── Rules ─────────────────────────────────────────────────────────────────────

export function getRules(q?: string): Promise<CategoryRule[]> {
  const url = q ? `/api/rules?q=${encodeURIComponent(q)}` : '/api/rules';
  return request<CategoryRule[]>(url);
}

export function updateRule(term: string, category: string): Promise<CategoryRule> {
  return request<CategoryRule>(`/api/rules/${encodeURIComponent(term)}`, {
    method: 'PATCH',
    body: JSON.stringify({ category }),
  });
}

export function deleteRule(term: string): Promise<void> {
  return request<void>(`/api/rules/${encodeURIComponent(term)}`, { method: 'DELETE' });
}

export function addRule(term: string, category: string): Promise<CategoryRule> {
  return request<CategoryRule>('/api/rules', {
    method: 'POST',
    body: JSON.stringify({ term, category }),
  });
}

export function recategoriseItems(): Promise<{ updated: number }> {
  return request<{ updated: number }>('/api/items/recategorise', { method: 'POST' });
}

export function renameItem(id: number, displayName: string): Promise<Item & { alexaWarning?: string | null }> {
  return request<Item & { alexaWarning?: string | null }>(`/api/items/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ displayName }),
  });
}

// ── Gift Cards ────────────────────────────────────────────────────────────────

export function getGiftCards(): Promise<GiftCard[]> {
  return request<GiftCard[]>('/api/gift-cards');
}

export function createGiftCard(data: {
  name: string;
  categoryKey: string;
  cardNumber: string;
  pin: string;
  balanceCheckUrl: string;
}): Promise<GiftCard> {
  return request<GiftCard>('/api/gift-cards', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateGiftCard(
  id: number,
  data: Partial<{ name: string; categoryKey: string; cardNumber: string; pin: string; balanceCheckUrl: string }>,
): Promise<GiftCard> {
  return request<GiftCard>(`/api/gift-cards/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function deleteGiftCard(id: number): Promise<void> {
  return request<void>(`/api/gift-cards/${id}`, { method: 'DELETE' });
}

export function getGiftCardBalance(id: number): Promise<{ balance: string; checkedAt: string }> {
  return request(`/api/gift-cards/${id}/balance`);
}

// ── Alexa Config ──────────────────────────────────────────────────────────────

export function getAlexaStatus(): Promise<AlexaStatus> {
  return request<AlexaStatus>('/api/alexa/status');
}

export function alexaAuthRefresh(): Promise<{ success: boolean; error?: string }> {
  return request('/api/alexa/auth/refresh', { method: 'POST' });
}

export function alexaAuthStart(): Promise<{ success: boolean; proxyUrl?: string; status?: string }> {
  return request('/api/alexa/auth/start', { method: 'POST' });
}

// ── Alexa Sync ────────────────────────────────────────────────────────────────

export function syncAlexa(): Promise<AlexaSyncResult> {
  return request<AlexaSyncResult>('/api/sync/alexa', { method: 'POST' });
}

// ── Settings ──────────────────────────────────────────────────────────────────

export function getSettings(): Promise<ShopSettingsWithMealPlanner> {
  return request<ShopSettingsWithMealPlanner>('/api/settings');
}

export function updateSettings(data: Partial<ShopSettingsWithMealPlanner>): Promise<ShopSettingsWithMealPlanner> {
  return request<ShopSettingsWithMealPlanner>('/api/settings', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function addAisleTerm(term: string, aisleId: string): Promise<{ aisleId: string; term: string; aisleOrder: AisleOrder }> {
  return request('/api/settings/aisle-term', {
    method: 'POST',
    body: JSON.stringify({ term, aisleId }),
  });
}

// ── Suggestions ───────────────────────────────────────────────────────────────

export function getShopDaySuggestions(): Promise<{
  suggestions: string[];
  message: string | null;
  isShopDay: boolean;
  isTomorrow: boolean;
}> {
  return request('/api/suggestions/shop-day');
}

// ── Recipes ───────────────────────────────────────────────────────────────────

export function parseRecipe(url: string): Promise<{ ingredients: string[]; title?: string }> {
  return request('/api/recipes/parse', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
}

// ── Meal Planner ──────────────────────────────────────────────────────────────

export function getMealPlan(weekStart: string): Promise<{ plan: MealPlan | null }> {
  return request<{ plan: MealPlan | null }>(`/api/meal-plans?weekStart=${encodeURIComponent(weekStart)}`);
}

export function createOrGetMealPlan(weekStart: string): Promise<{ plan: MealPlan }> {
  return request<{ plan: MealPlan }>('/api/meal-plans', {
    method: 'POST',
    body: JSON.stringify({ weekStart }),
  });
}

export function addMealItem(
  planId: number,
  item: { mealName: string; days: number[]; recipeUrl?: string; sortOrder?: number; saveToLibrary?: boolean },
): Promise<MealPlanItem> {
  return request<MealPlanItem>(`/api/meal-plans/${planId}/items`, {
    method: 'POST',
    body: JSON.stringify(item),
  });
}

export function updateMealItem(
  planId: number,
  itemId: number,
  updates: { mealName?: string; days?: number[]; recipeUrl?: string | null; sortOrder?: number; savedMealId?: number; saveToLibrary?: boolean },
): Promise<MealPlanItem> {
  return request<MealPlanItem>(`/api/meal-plans/${planId}/items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export function deleteMealItem(planId: number, itemId: number): Promise<void> {
  return request<void>(`/api/meal-plans/${planId}/items/${itemId}`, { method: 'DELETE' });
}

export function getSavedMeals(): Promise<SavedMeal[]> {
  return request<SavedMeal[]>('/api/saved-meals');
}

export function createSavedMeal(meal: { mealName: string; recipeUrl?: string; ingredients?: { name: string; quantity?: string }[] }): Promise<SavedMeal> {
  return request<SavedMeal>('/api/saved-meals', {
    method: 'POST',
    body: JSON.stringify(meal),
  });
}

export function updateSavedMeal(id: number, updates: { mealName?: string; recipeUrl?: string | null; ingredients?: { name: string; quantity?: string }[] }): Promise<SavedMeal> {
  return request<SavedMeal>(`/api/saved-meals/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export function deleteSavedMeal(id: number): Promise<void> {
  return request<void>(`/api/saved-meals/${id}`, { method: 'DELETE' });
}

export function addSavedMealToWeek(savedMealId: number, planId: number, days: number[]): Promise<MealPlanItem> {
  return request<MealPlanItem>(`/api/saved-meals/${savedMealId}/add-to-week`, {
    method: 'POST',
    body: JSON.stringify({ planId, days }),
  });
}
