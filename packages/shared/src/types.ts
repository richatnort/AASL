// Branded types — prevent mixing domain primitives at compile time
type Brand<K, T> = K & { readonly __brand: T };
export type ItemId = Brand<number, 'ItemId'>;
export type UserId = Brand<number, 'UserId'>;

// Built-in category keys — used in seed dictionary and AI categoriser
export type BuiltInCategory = 'greengrocers' | 'butchers' | 'supermarket' | 'needs_categorising';
export const BUILT_IN_CATEGORIES: BuiltInCategory[] = ['greengrocers', 'butchers', 'supermarket', 'needs_categorising'];

// General category key — can be a built-in or a user-defined custom category (e.g. 'costco')
export type Category = string;

// API response shapes — must match what the API routes return
export interface Item {
  id: ItemId;
  displayName: string;
  quantity: number;
  category: Category;
  alexaItemId: string | null;
  createdAt: string;
  aisleMatched?: boolean; // true = matched an aisle group; false = unmatched (badge shown); undefined = not in aisle sort mode
}

// Dynamic — keys are category strings (built-in or custom)
export type ItemsResponse = Record<string, Item[]>;

export interface NeedsCategoryResponse {
  needsCategory: true;
  name: string;
  quantity: number;
  alexaItemId?: string;
}

export interface AlexaSyncResult {
  added: Item[];
  savedUncategorised: number;
  skipped: string[];
  removed: string[];  // items ticked in Alexa app → checked off in our app
}

// ── Supermarket aisle sorting ─────────────────────────────────────────────────

export type SupermarketSortMode = 'az' | 'sainsburys_aisles';

export interface AisleGroup {
  id: string;
  name: string;
  terms: string[]; // case-insensitive substrings matched against item displayName
}

export type AisleOrder = AisleGroup[];

// Store walk order: entrance → Fruit & Veg (1–3) → down one side (28→13) → back up the other (12→4)
export const DEFAULT_AISLE_ORDER: AisleOrder = [
  { id: 'aisle_1_3',  name: 'Aisles 1–3',  terms: ['Fruit & Veg'] },
  { id: 'aisle_28',   name: 'Aisle 28',    terms: ['Bacon', 'Fresh meat', 'Sausages', 'Fresh fish', 'Halal meat', 'Fresh chicken'] },
  { id: 'aisle_27',   name: 'Aisle 27',    terms: ['Fresh ready meals', 'Pies & quiche', 'Fresh pizza & pasta', 'Meat free'] },
  { id: 'aisle_26',   name: 'Aisle 26',    terms: ['Cooked meats', 'Snacking & sharing', 'Fresh soup', 'Cheese', 'Butter & spreads'] },
  { id: 'aisle_25',   name: 'Aisle 25',    terms: ['Cream', 'Desserts', 'Yogurts', 'Milk alternatives', 'Fresh milk', 'Fresh juice'] },
  { id: 'aisle_24',   name: 'Aisle 24',    terms: ['African & Caribbean', 'Oils', 'Gravy & stuffing', 'Asian', 'Kosher', 'Eastern European'] },
  { id: 'aisle_23',   name: 'Aisle 23',    terms: ['Pasta', 'Canned tomatoes', 'Herbs, spices & stocks', 'Recipe sauces', 'Indian flavours', 'Rice & grains'] },
  { id: 'aisle_22',   name: 'Aisle 22',    terms: ['Mexican', 'Instant snacks', 'Soup', 'Canned tuna', 'Sauces & dressings', 'Canned pulses'] },
  { id: 'aisle_21',   name: 'Aisle 21',    terms: ['Cereal bars', 'Biscuits', 'Cereal', 'Porridge'] },
  { id: 'aisle_20',   name: 'Aisle 20',    terms: ['Tea', 'Herbal tea', 'Coffee', 'Chocolate', 'Sweets'] },
  { id: 'aisle_19',   name: 'Aisle 19',    terms: ['Long life juice', 'Squash', 'Water', 'Lemonade', 'Fizzy drinks', 'Energy drinks'] },
  { id: 'aisle_18',   name: 'Aisle 18',    terms: ['Sugar', 'Flour', 'Canned fruit', 'Celebration cakes', 'Cakes'] },
  { id: 'aisle_17',   name: 'Aisle 17',    terms: ['Bread', 'Bread rolls', 'Rolls & croissants', 'Flatbreads & wraps', 'Sliced bread', 'Home baking'] },
  { id: 'aisle_16',   name: 'Aisle 16',    terms: ['Mixers', 'Ale', 'Craft beer', 'No & low alcohol', 'Cider', 'Lager'] },
  { id: 'aisle_15',   name: 'Aisle 15',    terms: ['Spirits', 'Red wine', 'Rosé wine', 'White wine'] },
  { id: 'aisle_14',   name: 'Aisle 14',    terms: ['Frozen desserts', 'Ice cream', 'House wine', 'Frozen ready meals', 'Frozen vegetables'] },
  { id: 'aisle_13',   name: 'Aisle 13',    terms: ['Frozen chips', 'Frozen meat & fish', 'Frozen pizza', 'Frozen meat free', 'Frozen freefrom'] },
  { id: 'aisle_12',   name: 'Aisle 12',    terms: ['Crisps', 'Snacks', 'Nuts', 'Multipack snacks', 'Crackers', 'Crispbread'] },
  { id: 'aisle_11',   name: 'Aisle 11',    terms: ['Cat litter', 'Cat food', 'Dog food', 'Pet food'] },
  { id: 'aisle_10',   name: 'Aisle 10',    terms: ['Fabric conditioners', 'Laundry', 'Bleach', 'Cleaning'] },
  { id: 'aisle_9',    name: 'Aisle 9',     terms: ['Dishwasher tablets', 'Air fresheners', 'Light bulbs', 'Magazines'] },
  { id: 'aisle_8',    name: 'Aisle 8',     terms: ['Nappies', 'Baby wipes', 'Baby food', 'Baby milk'] },
  { id: 'aisle_7',    name: 'Aisle 7',     terms: ['Toilet rolls', 'Tissues', 'Washing & bathing', 'Feminine care', 'Shower gel'] },
  { id: 'aisle_6',    name: 'Aisle 6',     terms: ['Medicines', 'Wellness', 'Sports nutrition', 'Vitamins & minerals'] },
  { id: 'aisle_5',    name: 'Aisle 5',     terms: ['Skincare', 'Deodorants'] },
  { id: 'aisle_4',    name: 'Aisle 4',     terms: ['Cosmetics', 'Toothpaste', 'Cosmetic accessories', 'Haircare', 'Shampoo'] },
];

export interface ShopSettings {
  shopDay: number | null; // 0=Sun, 1=Mon … 6=Sat; null = not set
  supermarketSortMode: SupermarketSortMode;
  supermarketAisleOrder: AisleOrder;
}

export interface ShopSuggestion {
  name: string;
  displayName: string;
  count: number;
}

export interface ApiError {
  error: string;
  code: string;
}

export interface User {
  id: UserId;
  email: string;
  name: string | null;
  isAdmin: boolean;
  approved: boolean;
  createdAt: string;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  db: 'ok' | 'error';
  alexa: 'ok' | 'error' | 'unknown';
}

// ── Settings types ────────────────────────────────────────────────────────────

export interface CategoryConfig {
  category: string;
  sortOrder: number;
  displayName: string | null;
  color: string | null;
  isBuiltIn: boolean;
}

export interface CategoryRule {
  term: string;
  category: string;
  source: 'ai' | 'manual' | 'seed';
  confirmedCount: number;
  updatedAt: string;
}

export interface GiftCard {
  id: number;
  name: string;
  categoryKey: string;
  /** Omitted from list/detail responses — only present in the row used internally for balance check */
  cardNumber?: string;
  /** Omitted from list/detail responses — only present in the row used internally for balance check */
  pin?: string;
  balanceCheckUrl: string;
  lastBalance: string | null;
  lastCheckedAt: string | null;
}

export interface AlexaStatus {
  sessionAgeDays: number | null;
  sessionExpired: boolean;
  lastError: string | null;
  proxyInProgress: boolean;
}

// ── Meal Planner ──────────────────────────────────────────────────────────────

export interface SavedMealIngredient {
  id: number;
  savedMealId: number;
  name: string;
  quantity: string | null;
  sortOrder: number;
}

export interface MealPlanItem {
  id: number;
  planId: number;
  mealName: string;
  days: number[];        // absolute day-of-week: 0=Sun…6=Sat
  recipeUrl: string | null;
  savedMealId: number | null;
  sortOrder: number;
  createdBy: number | null;
}

export interface MealPlan {
  id: number;
  weekStart: string;     // ISO date "2026-03-18"
  items: MealPlanItem[];
}

export interface SavedMeal {
  id: number;
  mealName: string;
  recipeUrl: string | null;
  createdBy: number | null;
  ingredients: SavedMealIngredient[];
}

export interface ShopSettingsWithMealPlanner extends ShopSettings {
  mealPlanStartDay: number | null; // 0=Sun…6=Sat; null = not set (defaults to shopDay)
}
