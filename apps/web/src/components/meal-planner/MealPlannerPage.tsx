import type { MealPlan, MealPlanItem, SavedMeal } from '@shopping-list/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addMealItem, 
  addSavedMealToWeek,createOrGetMealPlan,createSavedMeal, deleteMealItem,deleteSavedMeal,
  getMealPlan, 
  getSavedMeals, updateMealItem, updateSavedMeal, 
} from '../../lib/api.js';
import { useToast } from '../layout/Toast.js';
import { Toast } from '../layout/Toast.js';
import { RecipeModal } from '../recipes/RecipeModal.js';

// ── Date helpers ──────────────────────────────────────────────────────────────

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Returns the ISO date string (YYYY-MM-DD) of the most recent occurrence of
 *  `startDay` (0=Sun…6=Sat) on or before `date`. */
function getWeekStart(date: Date, startDay: number): string {
  const day = date.getDay(); // 0=Sun…6=Sat
  const diff = (day - startDay + 7) % 7;
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate() - diff);
  return localDateStr(d);
}

function addWeeks(isoDate: string, weeks: number): string {
  const [y, m, day] = isoDate.split('-').map(Number);
  const d = new Date(y!, m! - 1, day! + weeks * 7);
  return localDateStr(d);
}

function formatWeekRange(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00`);
  const end = new Date(`${weekStart}T00:00:00`);
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${fmt(start)} – ${fmt(end)}`;
}

/** Returns the absolute ISO date for a given day-of-week within the week starting at weekStart. */
function dayDate(weekStart: string, dayOfWeek: number): Date {
  const start = new Date(`${weekStart}T00:00:00`);
  const startDow = start.getDay();
  const offset = (dayOfWeek - startDow + 7) % 7;
  const d = new Date(start);
  d.setDate(d.getDate() + offset);
  return d;
}

function formatDayLabel(weekStart: string, dayOfWeek: number): string {
  const d = dayDate(weekStart, dayOfWeek);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
}

function isToday(weekStart: string, dayOfWeek: number): boolean {
  return localDateStr(dayDate(weekStart, dayOfWeek)) === localDateStr(new Date());
}

function shortDay(dayOfWeek: number): string {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek]!;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SAGE = '#5a8a6e';
const SAGE_LIGHT = '#e8f2ec';
const SAGE_TEXT = '#3d6b52';

// ── Types ─────────────────────────────────────────────────────────────────────

type View = 'this-week' | 'saved-meals';

type SheetMode =
  | { type: 'add' }
  | { type: 'edit'; item: MealPlanItem; savedMealId?: number }
  | { type: 'add-to-week'; savedMeal: SavedMeal }
  | { type: 'add-saved-meal' }
  | { type: 'edit-saved-meal'; meal: SavedMeal };

type Props = {
  mealPlanStartDay: number; // 0=Sun…6=Sat
  onAddToList?: (name: string) => Promise<string | null>; // forward ingredient adds to shopping list
};

// ── Component ─────────────────────────────────────────────────────────────────

export function MealPlannerPage({ mealPlanStartDay, onAddToList }: Props) {
  const todayWeekStart = getWeekStart(new Date(), mealPlanStartDay);
  const [weekOffset, setWeekOffset] = useState(0);
  const currentWeekStart = addWeeks(todayWeekStart, weekOffset);

  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(true);
  const [savedMeals, setSavedMeals] = useState<SavedMeal[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);

  const [view, setView] = useState<View>('this-week');
  const [sheet, setSheet] = useState<SheetMode | null>(null);

  // Recipe modal for "Add to shopping list" — url mode or manual ingredients mode
  type RecipeModalTarget = { url: string } | { title: string; ingredients: string[] };
  const [recipeModalTarget, setRecipeModalTarget] = useState<RecipeModalTarget | null>(null);

  // Confirm delete state
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'item'; planId: number; itemId: number } | { type: 'saved'; id: number } | null>(null);

  const { toasts, show: showToast, dismiss: dismissToast } = useToast();

  const isPastWeek = currentWeekStart < todayWeekStart;

  // ── Fetch plan for current week ──────────────────────────────────────────────

  const loadPlan = useCallback(async () => {
    setPlanLoading(true);
    try {
      const { plan: fetched } = await getMealPlan(currentWeekStart);
      setPlan(fetched);
    } catch {
      showToast('Failed to load meal plan', 'error');
    } finally {
      setPlanLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWeekStart]);

  useEffect(() => { void loadPlan(); }, [loadPlan]);

  // Refresh on tab focus
  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === 'visible') void loadPlan(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [loadPlan]);

  // ── Fetch saved meals ─────────────────────────────────────────────────────

  const loadSavedMeals = useCallback(async () => {
    setSavedLoading(true);
    try {
      const meals = await getSavedMeals();
      setSavedMeals(meals);
    } catch {
      showToast('Failed to load saved meals', 'error');
    } finally {
      setSavedLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load on mount (for ingredient lookup in This Week) and when switching to Saved Meals
  useEffect(() => { void loadSavedMeals(); }, [loadSavedMeals]);
  useEffect(() => {
    if (view === 'saved-meals') void loadSavedMeals();
  }, [view, loadSavedMeals]);

  // ── Ensure plan exists before mutating ───────────────────────────────────

  const ensurePlan = async (): Promise<MealPlan> => {
    if (plan) return plan;
    const { plan: created } = await createOrGetMealPlan(currentWeekStart);
    setPlan(created);
    return created;
  };

  // ── Meal item CRUD ────────────────────────────────────────────────────────

  const handleAddItem = async (form: MealItemForm) => {
    const existingItems = plan?.items ?? [];
    const nameLower = form.mealName.trim().toLowerCase();
    const clash = existingItems.find(
      (i) => i.mealName.toLowerCase() === nameLower && i.days.some((d) => form.days.includes(d))
    );
    if (clash) {
      showToast(`"${form.mealName}" is already planned on that day`, 'error');
      return;
    }
    try {
      const p = await ensurePlan();
      const item = await addMealItem(p.id, {
        mealName: form.mealName,
        days: form.days,
        recipeUrl: form.recipeUrl || undefined,
        saveToLibrary: form.saveToLibrary,
      });
      setPlan((prev) => prev ? { ...prev, items: [...prev.items, item] } : prev);
      setSheet(null);
      showToast('Meal added', 'success');
    } catch {
      showToast('Failed to add meal', 'error');
    }
  };

  const handleUpdateItem = async (planId: number, itemId: number, form: MealItemForm, savedMealId?: number) => {
    try {
      const item = await updateMealItem(planId, itemId, {
        mealName: form.mealName,
        days: form.days,
        // Send null to explicitly clear an existing URL; omit if never set
        recipeUrl: form.recipeUrl === '' ? null : (form.recipeUrl || undefined),
        savedMealId,
        saveToLibrary: form.saveToLibrary,
      });
      setPlan((prev) => prev ? { ...prev, items: prev.items.map((i) => i.id === itemId ? item : i) } : prev);
      setSheet(null);
      showToast('Meal updated', 'success');
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'NOT_FOUND') {
        showToast('Meal was deleted. Closing.', 'error');
        setPlan((prev) => prev ? { ...prev, items: prev.items.filter((i) => i.id !== itemId) } : prev);
        setSheet(null);
      } else {
        showToast('Failed to update meal', 'error');
      }
    }
  };

  const handleDeleteItem = async (planId: number, itemId: number) => {
    try {
      await deleteMealItem(planId, itemId);
      setPlan((prev) => prev ? { ...prev, items: prev.items.filter((i) => i.id !== itemId) } : prev);
      showToast('Meal deleted', 'info');
    } catch {
      showToast('Could not delete. Try again.', 'error');
    }
    setConfirmDelete(null);
    setSheet(null);
  };

  // ── Saved meals CRUD ───────────────────────────────────────────────────────

  type IngredientInput = { name: string; quantity: string };

  const handleAddSavedMeal = async (form: { mealName: string; recipeUrl: string; ingredients: IngredientInput[] }) => {
    try {
      const meal = await createSavedMeal({
        mealName: form.mealName,
        recipeUrl: form.recipeUrl || undefined,
        ingredients: form.ingredients.filter((i) => i.name.trim()),
      });
      setSavedMeals((prev) => [...prev, meal].sort((a, b) => a.mealName.localeCompare(b.mealName)));
      setSheet(null);
      showToast('Meal saved to library', 'success');
    } catch {
      showToast('Failed to save meal', 'error');
    }
  };

  const handleUpdateSavedMeal = async (id: number, form: { mealName: string; recipeUrl: string; ingredients: IngredientInput[] }) => {
    try {
      const meal = await updateSavedMeal(id, {
        mealName: form.mealName,
        recipeUrl: form.recipeUrl || null,
        ingredients: form.ingredients.filter((i) => i.name.trim()),
      });
      setSavedMeals((prev) => prev.map((m) => m.id === id ? meal : m));
      setSheet(null);
      showToast('Meal updated', 'success');
    } catch {
      showToast('Failed to update meal', 'error');
    }
  };

  const handleDeleteSavedMeal = async (id: number) => {
    try {
      await deleteSavedMeal(id);
      setSavedMeals((prev) => prev.filter((m) => m.id !== id));
      showToast('Meal removed from library', 'info');
    } catch {
      showToast('Could not delete. Try again.', 'error');
    }
    setConfirmDelete(null);
    setSheet(null);
  };

  const handleAddToWeek = async (savedMeal: SavedMeal, days: number[]) => {
    const existingItems = plan?.items ?? [];
    const nameLower = savedMeal.mealName.toLowerCase();
    const clash = existingItems.find(
      (i) => i.mealName.toLowerCase() === nameLower && i.days.some((d) => days.includes(d))
    );
    if (clash) {
      showToast(`"${savedMeal.mealName}" is already planned on that day`, 'error');
      return;
    }
    try {
      const p = await ensurePlan();
      const item = await addSavedMealToWeek(savedMeal.id, p.id, days);
      setPlan((prev) => prev ? { ...prev, items: [...prev.items, item] } : prev);
      setSheet(null);
      setView('this-week');
      showToast(`${savedMeal.mealName} added to this week`, 'success');
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'NOT_FOUND') {
        showToast('Could not add meal. Try refreshing.', 'error');
      } else {
        showToast('Failed to add meal to week', 'error');
      }
    }
  };

  // ── Group items by first day (for this-week display) ─────────────────────

  const groupedItems = (() => {
    if (!plan) return [];
    // Build ordered list of days in this week
    const daysInWeek: number[] = [];
    for (let i = 0; i < 7; i++) {
      daysInWeek.push((mealPlanStartDay + i) % 7);
    }

    // For each item, find the earliest day within this week
    const itemsWithEarliestDay = plan.items.map((item) => {
      const sortedDays = [...item.days].sort((a, b) => {
        const ai = daysInWeek.indexOf(a);
        const bi = daysInWeek.indexOf(b);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
      return { item, earliestDay: sortedDays[0] ?? item.days[0]! };
    });

    // Group by earliest day
    const byDay = new Map<number, MealPlanItem[]>();
    for (const { item, earliestDay } of itemsWithEarliestDay) {
      const existing = byDay.get(earliestDay) ?? [];
      existing.push(item);
      byDay.set(earliestDay, existing);
    }

    // Return in week order
    return daysInWeek
      .filter((d) => byDay.has(d))
      .map((d) => ({ day: d, items: byDay.get(d)! }));
  })();

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: 'Nunito Sans, sans-serif' }}>
      {/* Safe-area + bottom-nav padding */}
      <style>{`
        @supports (padding: env(safe-area-inset-bottom)) {
          [data-main-content] { padding-bottom: calc(64px + env(safe-area-inset-bottom)) !important; }
          [data-meal-sheet] { padding-bottom: max(2rem, env(safe-area-inset-bottom)) !important; }
        }
      `}</style>

      <div data-main-content style={{ padding: '16px', paddingBottom: '80px', maxWidth: '600px', margin: '0 auto' }}>
        {/* Sub-tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          {(['this-week', 'saved-meals'] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: '8px 20px', borderRadius: '999px',
                border: `1.5px solid ${SAGE}`,
                background: view === v ? SAGE : 'transparent',
                color: view === v ? '#fff' : SAGE,
                fontWeight: view === v ? 700 : 600,
                fontSize: '14px', cursor: 'pointer',
                touchAction: 'manipulation', minHeight: '44px',
                fontFamily: 'Nunito Sans, sans-serif',
              }}
            >
              {v === 'this-week' ? 'This Week' : 'Saved Meals'}
            </button>
          ))}
        </div>

        {view === 'this-week' ? (
          <ThisWeekView
            weekOffset={weekOffset}
            currentWeekStart={currentWeekStart}
            isPastWeek={isPastWeek}
            mealPlanStartDay={mealPlanStartDay}
            loading={planLoading}
            groupedItems={groupedItems}
            onPrev={() => setWeekOffset((o) => Math.max(o - 1, -4))}
            onNext={() => setWeekOffset((o) => Math.min(o + 1, 2))}
            onAdd={() => setSheet({ type: 'add' })}
            onEdit={(item) => setSheet({ type: 'edit', item })}
            onAddToList={(item) => {
              const savedMeal = item.savedMealId != null ? savedMeals.find((m) => m.id === item.savedMealId) : null;
              if (item.savedMealId != null && !savedMeal && savedLoading) {
                showToast('Still loading meal details, please try again', 'info');
                return;
              }
              if (savedMeal && savedMeal.ingredients.length > 0) {
                setRecipeModalTarget({
                  title: savedMeal.mealName,
                  ingredients: savedMeal.ingredients.map((ing) =>
                    ing.quantity ? `${ing.name} (${ing.quantity})` : ing.name
                  ),
                });
              } else {
                const safeUrl = item.recipeUrl && /^https?:\/\//i.test(item.recipeUrl) ? item.recipeUrl : null;
                if (safeUrl) setRecipeModalTarget({ url: safeUrl });
              }
            }}
          />
        ) : (
          <SavedMealsView
            meals={savedMeals}
            loading={savedLoading}
            onAddNew={() => setSheet({ type: 'add-saved-meal' })}
            onEdit={(meal) => setSheet({ type: 'edit-saved-meal', meal })}
            onAddToWeek={(meal) => setSheet({ type: 'add-to-week', savedMeal: meal })}
          />
        )}
      </div>

      {/* Bottom sheet */}
      {sheet && (
        <MealSheet
          sheet={sheet}
          mealPlanStartDay={mealPlanStartDay}
          currentWeekStart={currentWeekStart}
          isPastWeek={isPastWeek}
          savedMeals={savedMeals}
          onClose={() => setSheet(null)}
          onAddItem={handleAddItem}
          onUpdateItem={handleUpdateItem}
          onDeleteItem={(planId, itemId) => setConfirmDelete({ type: 'item', planId, itemId })}
          onAddSavedMeal={handleAddSavedMeal}
          onUpdateSavedMeal={handleUpdateSavedMeal}
          onDeleteSavedMeal={(id) => setConfirmDelete({ type: 'saved', id })}
          onAddToWeek={handleAddToWeek}
          planId={plan?.id ?? null}
        />
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <DeleteConfirm
          onConfirm={() => {
            if (confirmDelete.type === 'item') void handleDeleteItem(confirmDelete.planId, confirmDelete.itemId);
            else void handleDeleteSavedMeal(confirmDelete.id);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* Recipe modal */}
      {recipeModalTarget && (
        <RecipeModal
          initialUrl={'url' in recipeModalTarget ? recipeModalTarget.url : undefined}
          manualIngredients={'ingredients' in recipeModalTarget ? recipeModalTarget.ingredients : undefined}
          manualTitle={'title' in recipeModalTarget ? recipeModalTarget.title : undefined}
          onAddItem={onAddToList ?? (async () => null)}
          onClose={() => setRecipeModalTarget(null)}
        />
      )}

      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

// ── This Week View ────────────────────────────────────────────────────────────

function ThisWeekView({
  weekOffset, currentWeekStart, isPastWeek, mealPlanStartDay, loading,
  groupedItems, onPrev, onNext, onAdd, onEdit, onAddToList,
}: {
  weekOffset: number;
  currentWeekStart: string;
  isPastWeek: boolean;
  mealPlanStartDay: number;
  loading: boolean;
  groupedItems: { day: number; items: MealPlanItem[] }[];
  onPrev: () => void;
  onNext: () => void;
  onAdd: () => void;
  onEdit: (item: MealPlanItem) => void;
  onAddToList: (item: MealPlanItem) => void;
}) {
  return (
    <>
      {/* Week nav header */}
      <div style={{ textAlign: 'center', marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', letterSpacing: '0.08em', marginBottom: '4px' }}>
          PLANNING WEEK
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <button
            onClick={onPrev}
            disabled={weekOffset <= -4}
            style={navBtnStyle(weekOffset <= -4)}
            aria-label="Previous week"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <span style={{ fontFamily: 'Rubik, sans-serif', fontSize: '16px', fontWeight: 500, color: '#1a1a1a' }}>
            {formatWeekRange(currentWeekStart)}
          </span>
          <button
            onClick={onNext}
            disabled={weekOffset >= 2}
            style={navBtnStyle(weekOffset >= 2)}
            aria-label="Next week"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Past week banner */}
      {isPastWeek && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          background: '#fffbeb', border: '1px solid #fde68a',
          borderRadius: '8px', padding: '10px 14px', marginBottom: '12px',
          fontSize: '14px', color: '#92400e',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          Past week — view only
        </div>
      )}

      {/* Add meal button */}
      {!isPastWeek && (
        <button
          onClick={onAdd}
          style={{
            width: '100%', padding: '12px 0', borderRadius: '10px',
            background: SAGE, color: '#fff', border: 'none',
            fontFamily: 'Nunito Sans, sans-serif', fontSize: '16px', fontWeight: 700,
            cursor: 'pointer', marginBottom: '16px', minHeight: '44px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            touchAction: 'manipulation',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Meal
        </button>
      )}

      {/* Loading */}
      {loading && <div style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem' }}>Loading…</div>}

      {/* Empty state */}
      {!loading && groupedItems.length === 0 && (
        <div style={{ textAlign: 'center', color: '#9ca3af', marginTop: '48px' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" style={{ display: 'block', margin: '0 auto 12px' }}>
            <path d="M3 11l19-9-9 19-2-8-8-2z"/>
          </svg>
          <div style={{ fontSize: '15px', fontWeight: 600 }}>No meals planned yet</div>
          <div style={{ fontSize: '13px', marginTop: '4px' }}>
            {isPastWeek ? 'Nothing was planned this week.' : 'Tap Add Meal to plan your week'}
          </div>
        </div>
      )}

      {/* Meal cards grouped by day */}
      {!loading && groupedItems.map(({ day, items }) => (
        <div key={day}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', marginTop: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', letterSpacing: '0.08em' }}>
              {formatDayLabel(currentWeekStart, day)}
            </span>
            {isToday(currentWeekStart, day) && (
              <span style={{
                background: SAGE, color: '#fff', fontSize: '10px', fontWeight: 700,
                padding: '1px 7px', borderRadius: '999px', letterSpacing: '0.05em',
              }}>TODAY</span>
            )}
          </div>
          {items.map((item) => (
            <MealCard
              key={item.id}
              item={item}
              isPastWeek={isPastWeek}
              onEdit={() => onEdit(item)}
              onAddToList={() => onAddToList(item)}
            />
          ))}
        </div>
      ))}
    </>
  );
}

function MealCard({ item, isPastWeek, onEdit, onAddToList }: {
  item: MealPlanItem;
  isPastWeek: boolean;
  onEdit: () => void;
  onAddToList: () => void;
}) {
  const safeUrl = item.recipeUrl && /^https?:\/\//i.test(item.recipeUrl) ? item.recipeUrl : null;
  const hasShoppingList = safeUrl !== null || item.savedMealId != null;

  return (
    <div style={{
      background: '#fff', borderRadius: '12px', padding: '16px',
      marginBottom: '12px', border: '1px solid #e5e5e5',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        <span style={{ fontFamily: 'Rubik, sans-serif', fontSize: '17px', fontWeight: 500, color: '#1a1a1a' }}>
          {item.mealName}
        </span>
        {!isPastWeek && (
          <button
            onClick={onEdit}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '4px', borderRadius: '6px', touchAction: 'manipulation', minWidth: '32px', minHeight: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            aria-label="Edit meal"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
        )}
      </div>

      {/* Day chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
        {[...item.days].sort().map((d) => (
          <span key={d} style={{
            background: SAGE_LIGHT, color: SAGE_TEXT, borderRadius: '20px',
            padding: '2px 10px', fontSize: '12px', fontWeight: 600,
          }}>
            {shortDay(d)}
          </span>
        ))}
      </div>

      {/* Recipe link */}
      {safeUrl && (
        <a
          href={safeUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            marginTop: '10px', color: SAGE, fontSize: '14px',
            overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
            textDecoration: 'none', minHeight: '44px',
            touchAction: 'manipulation',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
          </svg>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {safeUrl.replace(/^https?:\/\/(www\.)?/, '')}
          </span>
        </a>
      )}

      {/* Add to shopping list */}
      {hasShoppingList && (
        <button
          onClick={onAddToList}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            marginTop: '12px', padding: '10px 0', width: '100%',
            border: `1.5px solid ${SAGE}`, borderRadius: '8px',
            color: SAGE, fontSize: '15px', fontWeight: 600,
            background: 'transparent', cursor: 'pointer',
            touchAction: 'manipulation', minHeight: '44px',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
          </svg>
          Add to shopping list
        </button>
      )}
    </div>
  );
}

// ── Saved Meals View ──────────────────────────────────────────────────────────

function SavedMealsView({ meals, loading, onAddNew, onEdit, onAddToWeek }: {
  meals: SavedMeal[];
  loading: boolean;
  onAddNew: () => void;
  onEdit: (meal: SavedMeal) => void;
  onAddToWeek: (meal: SavedMeal) => void;
}) {
  return (
    <>
      <button
        onClick={onAddNew}
        style={{
          width: '100%', padding: '12px 0', borderRadius: '10px',
          background: SAGE, color: '#fff', border: 'none',
          fontFamily: 'Nunito Sans, sans-serif', fontSize: '16px', fontWeight: 700,
          cursor: 'pointer', marginBottom: '16px', minHeight: '44px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          touchAction: 'manipulation',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Save a new meal
      </button>

      {loading && <div style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem' }}>Loading…</div>}

      {!loading && meals.length === 0 && (
        <div style={{ textAlign: 'center', color: '#9ca3af', marginTop: '48px' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" style={{ display: 'block', margin: '0 auto 12px' }}>
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
          </svg>
          <div style={{ fontSize: '15px', fontWeight: 600 }}>No saved meals yet</div>
          <div style={{ fontSize: '13px', marginTop: '4px' }}>Tap "Save a new meal" to build your collection</div>
        </div>
      )}

      {meals.map((meal) => {
        const safeUrl = meal.recipeUrl && /^https?:\/\//i.test(meal.recipeUrl) ? meal.recipeUrl : null;
        return (
          <div key={meal.id} style={{
            background: '#fff', borderRadius: '12px', padding: '16px',
            marginBottom: '12px', border: '1px solid #e5e5e5',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
              <span style={{ fontFamily: 'Rubik, sans-serif', fontSize: '17px', fontWeight: 500, color: '#1a1a1a' }}>
                {meal.mealName}
              </span>
              <button
                onClick={() => onEdit(meal)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '4px', touchAction: 'manipulation', minWidth: '32px', minHeight: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                aria-label="Edit saved meal"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
            </div>

            {safeUrl ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', color: '#9ca3af', fontSize: '13px', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                </svg>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {safeUrl.replace(/^https?:\/\/(www\.)?/, '')}
                </span>
              </div>
            ) : meal.ingredients.length > 0 ? (
              <div style={{ marginTop: '6px', fontSize: '13px', color: SAGE_TEXT }}>
                {meal.ingredients.length} ingredient{meal.ingredients.length !== 1 ? 's' : ''} saved
              </div>
            ) : (
              <div style={{ marginTop: '6px', fontSize: '13px', color: '#d1d5db', fontStyle: 'italic' }}>No recipe saved</div>
            )}

            <button
              onClick={() => onAddToWeek(meal)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                marginTop: '12px', padding: '10px 0', width: '100%',
                border: `1.5px solid ${SAGE}`, borderRadius: '8px',
                color: SAGE, fontSize: '15px', fontWeight: 600,
                background: 'transparent', cursor: 'pointer',
                touchAction: 'manipulation', minHeight: '44px',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              Add to this week
            </button>
          </div>
        );
      })}
    </>
  );
}

// ── Meal Sheet ────────────────────────────────────────────────────────────────

type MealItemForm = {
  mealName: string;
  days: number[];
  recipeUrl: string;
  saveToLibrary: boolean;
};

function MealSheet({
  sheet, mealPlanStartDay, currentWeekStart, isPastWeek, savedMeals, onClose,
  onAddItem, onUpdateItem, onDeleteItem,
  onAddSavedMeal, onUpdateSavedMeal, onDeleteSavedMeal,
  onAddToWeek, planId,
}: {
  sheet: SheetMode;
  mealPlanStartDay: number;
  currentWeekStart: string;
  isPastWeek: boolean;
  savedMeals: SavedMeal[];
  onClose: () => void;
  onAddItem: (form: MealItemForm) => Promise<void>;
  onUpdateItem: (planId: number, itemId: number, form: MealItemForm, savedMealId?: number) => Promise<void>;
  onDeleteItem: (planId: number, itemId: number) => void;
  onAddSavedMeal: (form: { mealName: string; recipeUrl: string; ingredients: { name: string; quantity: string }[] }) => Promise<void>;
  onUpdateSavedMeal: (id: number, form: { mealName: string; recipeUrl: string; ingredients: { name: string; quantity: string }[] }) => Promise<void>;
  onDeleteSavedMeal: (id: number) => void;
  onAddToWeek: (savedMeal: SavedMeal, days: number[]) => Promise<void>;
  planId: number | null;
}) {
  const daysInWeek: number[] = [];
  for (let i = 0; i < 7; i++) daysInWeek.push((mealPlanStartDay + i) % 7);

  // ── Add meal (choice screen) ─────────────────────────────────────────────
  if (sheet.type === 'add') {
    return (
      <AddMealSheet
        savedMeals={savedMeals}
        daysInWeek={daysInWeek}
        onClose={onClose}
        onAddItem={onAddItem}
        onAddToWeek={onAddToWeek}
      />
    );
  }

  // ── Edit meal item ────────────────────────────────────────────────────────
  if (sheet.type === 'edit') {
    const editItem = sheet.item;
    return (
      <MealItemForm
        daysInWeek={daysInWeek}
        initialName={editItem.mealName}
        initialDays={editItem.days}
        initialRecipeUrl={editItem.recipeUrl ?? ''}
        isEdit
        onClose={onClose}
        onSave={async (form) => {
          if (planId) await onUpdateItem(planId, editItem.id, form, sheet.savedMealId);
        }}
        onDelete={planId && !isPastWeek ? () => onDeleteItem(planId, editItem.id) : undefined}
      />
    );
  }

  // ── Add / Edit saved meal ─────────────────────────────────────────────────
  if (sheet.type === 'add-saved-meal' || sheet.type === 'edit-saved-meal') {
    const editMeal = sheet.type === 'edit-saved-meal' ? sheet.meal : null;
    return (
      <SimpleMealForm
        title={editMeal ? 'Edit saved meal' : 'Save a new meal'}
        initialName={editMeal?.mealName ?? ''}
        initialUrl={editMeal?.recipeUrl ?? ''}
        initialIngredients={editMeal?.ingredients.map((i) => ({ name: i.name, quantity: i.quantity ?? '' })) ?? []}
        onClose={onClose}
        onSave={async (name, url, ingredients) => {
          if (editMeal) await onUpdateSavedMeal(editMeal.id, { mealName: name, recipeUrl: url, ingredients });
          else await onAddSavedMeal({ mealName: name, recipeUrl: url, ingredients });
        }}
        onDelete={editMeal ? () => onDeleteSavedMeal(editMeal.id) : undefined}
      />
    );
  }

  // ── Add to this week ──────────────────────────────────────────────────────
  if (sheet.type === 'add-to-week') {
    return (
      <AddToWeekSheet
        savedMeal={sheet.savedMeal}
        daysInWeek={daysInWeek}
        onClose={onClose}
        onAdd={(days) => onAddToWeek(sheet.savedMeal, days)}
      />
    );
  }

  return null;
}

// ── Add Meal Sheet (choice → new or from library) ────────────────────────────

function AddMealSheet({ savedMeals, daysInWeek, onClose, onAddItem, onAddToWeek }: {
  savedMeals: SavedMeal[];
  daysInWeek: number[];
  onClose: () => void;
  onAddItem: (form: MealItemForm) => Promise<void>;
  onAddToWeek: (savedMeal: SavedMeal, days: number[]) => Promise<void>;
}) {
  const [step, setStep] = useState<'choice' | 'new' | 'library'>('choice');

  // New-meal form state
  const [name, setName] = useState('');
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set());
  const [recipeUrl, setRecipeUrl] = useState('');
  const [saveToLibrary, setSaveToLibrary] = useState(false);
  const [newErrors, setNewErrors] = useState<{ name?: string; days?: string }>({});
  const [saving, setSaving] = useState(false);

  // Library state
  const [search, setSearch] = useState('');
  const [selectedMeal, setSelectedMeal] = useState<SavedMeal | null>(null);
  const [libDays, setLibDays] = useState<Set<number>>(new Set());
  const [libError, setLibError] = useState('');
  const [libAdding, setLibAdding] = useState(false);

  const filteredMeals = savedMeals.filter((m) =>
    m.mealName.toLowerCase().includes(search.toLowerCase())
  );

  const toggleSetDay = (prev: Set<number>, d: number): Set<number> => {
    const next = new Set(prev);
    next.has(d) ? next.delete(d) : next.add(d);
    return next;
  };

  const row1 = daysInWeek.slice(0, 4);
  const row2 = daysInWeek.slice(4);

  const handleSaveNew = async () => {
    const errs: { name?: string; days?: string } = {};
    if (!name.trim()) errs.name = 'Meal name is required';
    if (selectedDays.size === 0) errs.days = 'Select at least one day';
    setNewErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setSaving(true);
    try {
      await onAddItem({ mealName: name.trim(), days: Array.from(selectedDays), recipeUrl, saveToLibrary });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveLib = async () => {
    if (!selectedMeal) { setLibError('Select a meal from the list'); return; }
    if (libDays.size === 0) { setLibError('Select at least one day'); return; }
    setLibError('');
    setLibAdding(true);
    try {
      await onAddToWeek(selectedMeal, Array.from(libDays));
    } finally {
      setLibAdding(false);
    }
  };

  const title = step === 'library' ? 'From Library' : step === 'new' ? 'New Meal' : 'Add Meal';

  return (
    <BottomSheet onClose={onClose}>
      <h2 style={{ margin: '0 0 20px', fontFamily: 'Rubik, sans-serif', fontSize: '18px', fontWeight: 600, color: '#1a1a1a' }}>
        {title}
      </h2>

      {/* ── Choice step ── */}
      {step === 'choice' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {([
            { label: 'From Library', sub: `${savedMeals.length} saved meal${savedMeals.length !== 1 ? 's' : ''}`, icon: '📚', onTap: () => setStep('library') },
            { label: 'New Meal', sub: 'Type a new name', icon: '✏️', onTap: () => setStep('new') },
          ] as const).map(({ label, sub, icon, onTap }) => (
            <button
              key={label}
              onClick={onTap}
              style={{
                border: '2px solid #e5e7eb', borderRadius: '14px', padding: '18px 12px',
                background: '#fff', cursor: 'pointer', textAlign: 'center',
                fontFamily: 'Nunito Sans, sans-serif', touchAction: 'manipulation',
              }}
            >
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>{icon}</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#1a1a1a' }}>{label}</div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>{sub}</div>
            </button>
          ))}
        </div>
      )}

      {/* ── New meal step ── */}
      {step === 'new' && (
        <>
          <button onClick={() => setStep('choice')} style={backBtnStyle}>← Back</button>

          <label style={labelStyle}>MEAL NAME</label>
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setNewErrors({}); }}
            placeholder="e.g. Fish and chips"
            autoFocus
            style={{ ...inputStyle, borderColor: newErrors.name ? '#ef4444' : '#e5e5e5' }}
          />
          {newErrors.name && <div style={errorStyle}>{newErrors.name}</div>}

          <label style={{ ...labelStyle, marginTop: '16px' }}>WHICH DAYS?</label>
          {[row1, row2].map((row, ri) => (
            <div key={ri} style={{ display: 'flex', gap: '8px', marginBottom: ri === 0 ? '8px' : '0', flexWrap: 'wrap' }}>
              {row.map((d) => (
                <DayChip key={d} day={d} selected={selectedDays.has(d)} onToggle={() => setSelectedDays((prev) => toggleSetDay(prev, d))} />
              ))}
            </div>
          ))}
          {newErrors.days && <div style={errorStyle}>{newErrors.days}</div>}

          <label style={{ ...labelStyle, marginTop: '16px' }}>RECIPE URL <span style={{ color: '#9ca3af', fontSize: '10px' }}>(OPTIONAL)</span></label>
          <input type="url" inputMode="url" value={recipeUrl} onChange={(e) => setRecipeUrl(e.target.value)} placeholder="https://..." style={inputStyle} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '16px', padding: '12px 14px', border: '1px solid #e5e5e5', borderRadius: '10px', background: '#f9f9f9' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={SAGE} strokeWidth="1.5"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#1a1a1a' }}>Save to Meal Library</span>
            </div>
            <button
              role="switch"
              aria-checked={saveToLibrary}
              onClick={() => setSaveToLibrary((v) => !v)}
              style={{ width: '44px', height: '24px', borderRadius: '12px', border: 'none', background: saveToLibrary ? SAGE : '#d1d5db', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', touchAction: 'manipulation' }}
            >
              <span style={{ display: 'block', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', position: 'absolute', top: '3px', left: saveToLibrary ? '23px' : '3px', transition: 'left 0.2s' }} />
            </button>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
            <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
            <button onClick={() => void handleSaveNew()} disabled={saving} style={saveBtnStyle(saving)}>
              {saving ? 'Saving…' : 'Save Meal'}
            </button>
          </div>
        </>
      )}

      {/* ── Library step ── */}
      {step === 'library' && (
        <>
          <button onClick={() => setStep('choice')} style={backBtnStyle}>← Back</button>

          {savedMeals.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#9ca3af', padding: '32px 0' }}>
              <div style={{ fontSize: '15px', fontWeight: 600 }}>No saved meals yet</div>
              <div style={{ fontSize: '13px', marginTop: '4px' }}>Add meals to your library from the Saved Meals tab</div>
            </div>
          ) : (
            <>
              {savedMeals.length > 5 && (
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search meals…"
                  style={{ ...inputStyle, marginBottom: '12px' }}
                />
              )}
              <div style={{ maxHeight: '240px', overflowY: 'auto', marginBottom: '16px' }}>
                {filteredMeals.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#9ca3af', padding: '16px 0', fontSize: '14px' }}>No meals match your search</div>
                ) : filteredMeals.map((meal) => (
                  <button
                    key={meal.id}
                    onClick={() => { setSelectedMeal(meal); setLibError(''); }}
                    style={{
                      display: 'flex', alignItems: 'center', width: '100%',
                      padding: '12px 14px', marginBottom: '8px',
                      border: `1.5px solid ${selectedMeal?.id === meal.id ? SAGE : '#e5e7eb'}`,
                      borderRadius: '10px',
                      background: selectedMeal?.id === meal.id ? SAGE_LIGHT : '#fff',
                      cursor: 'pointer', touchAction: 'manipulation',
                      fontFamily: 'Nunito Sans, sans-serif', textAlign: 'left',
                    }}
                  >
                    <span style={{ flex: 1, fontSize: '15px', fontWeight: 600, color: '#1a1a1a' }}>{meal.mealName}</span>
                    {selectedMeal?.id === meal.id && (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={SAGE} strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    )}
                  </button>
                ))}
              </div>

              <label style={labelStyle}>WHICH DAYS?</label>
              {[row1, row2].map((row, ri) => (
                <div key={ri} style={{ display: 'flex', gap: '8px', marginBottom: ri === 0 ? '8px' : '0', flexWrap: 'wrap' }}>
                  {row.map((d) => (
                    <DayChip key={d} day={d} selected={libDays.has(d)} onToggle={() => setLibDays((prev) => toggleSetDay(prev, d))} />
                  ))}
                </div>
              ))}
              {libError && <div style={errorStyle}>{libError}</div>}

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
                <button onClick={() => void handleSaveLib()} disabled={libAdding} style={saveBtnStyle(libAdding)}>
                  {libAdding ? 'Adding…' : 'Add to Plan'}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </BottomSheet>
  );
}

// ── Meal Item Form (bottom sheet) ─────────────────────────────────────────────

function MealItemForm({
  daysInWeek, initialName, initialDays, initialRecipeUrl, isEdit,
  onClose, onSave, onDelete,
}: {
  daysInWeek: number[];
  initialName: string;
  initialDays: number[];
  initialRecipeUrl: string;
  isEdit: boolean;
  onClose: () => void;
  onSave: (form: MealItemForm) => Promise<void>;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set(initialDays));
  const [recipeUrl, setRecipeUrl] = useState(initialRecipeUrl);
  const [saveToLibrary, setSaveToLibrary] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; days?: string }>({});

  const toggleDay = (d: number) => {
    setSelectedDays((prev) => {
      const next = new Set(prev);
      next.has(d) ? next.delete(d) : next.add(d);
      return next;
    });
  };

  const validate = () => {
    const errs: typeof errors = {};
    if (!name.trim()) errs.name = 'Meal name is required';
    if (selectedDays.size === 0) errs.days = 'Select at least one day';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await onSave({ mealName: name.trim(), days: Array.from(selectedDays), recipeUrl, saveToLibrary });
    } finally {
      setSaving(false);
    }
  };

  // Row layout for day chips: first 4, then 3
  const row1 = daysInWeek.slice(0, 4);
  const row2 = daysInWeek.slice(4);

  return (
    <BottomSheet onClose={onClose}>
      <h2 style={{ margin: '0 0 20px', fontFamily: 'Rubik, sans-serif', fontSize: '18px', fontWeight: 600, color: '#1a1a1a' }}>
        {isEdit ? 'Edit Meal' : 'Add Meal'}
      </h2>

      {/* Meal name */}
      <label style={labelStyle}>MEAL NAME</label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Chicken Tikka Masala"
        style={{ ...inputStyle, borderColor: errors.name ? '#ef4444' : '#e5e5e5' }}
      />
      {errors.name && <div style={errorStyle}>{errors.name}</div>}

      {/* Day chips */}
      <label style={{ ...labelStyle, marginTop: '16px' }}>WHICH DAYS?</label>
      {[row1, row2].map((row, ri) => (
        <div key={ri} style={{ display: 'flex', gap: '8px', marginBottom: ri === 0 ? '8px' : '0', flexWrap: 'wrap' }}>
          {row.map((d) => (
            <DayChip key={d} day={d} selected={selectedDays.has(d)} onToggle={() => toggleDay(d)} />
          ))}
        </div>
      ))}
      {errors.days && <div style={errorStyle}>{errors.days}</div>}

      {/* Recipe URL */}
      <label style={{ ...labelStyle, marginTop: '16px' }}>RECIPE URL <span style={{ color: '#9ca3af', fontSize: '10px' }}>(OPTIONAL)</span></label>
      <input
        type="url"
        inputMode="url"
        value={recipeUrl}
        onChange={(e) => setRecipeUrl(e.target.value)}
        placeholder="https://..."
        style={inputStyle}
      />

      {/* Save to library toggle */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginTop: '16px', padding: '12px 14px',
        border: '1px solid #e5e5e5', borderRadius: '10px', background: '#f9f9f9',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={SAGE} strokeWidth="1.5">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
          </svg>
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#1a1a1a' }}>Save to Meal Library</span>
        </div>
        <button
          role="switch"
          aria-checked={saveToLibrary}
          onClick={() => setSaveToLibrary((v) => !v)}
          style={{
            width: '44px', height: '24px', borderRadius: '12px', border: 'none',
            background: saveToLibrary ? SAGE : '#d1d5db',
            cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
            touchAction: 'manipulation',
          }}
        >
          <span style={{
            display: 'block', width: '18px', height: '18px', borderRadius: '50%',
            background: '#fff', position: 'absolute', top: '3px',
            left: saveToLibrary ? '23px' : '3px', transition: 'left 0.2s',
          }} />
        </button>
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
        <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
        <button onClick={() => void handleSave()} disabled={saving} style={saveBtnStyle(saving)}>
          {saving ? 'Saving…' : 'Save Meal'}
        </button>
      </div>

      {/* Delete */}
      {onDelete && (
        <button
          onClick={onDelete}
          style={{
            display: 'block', width: '100%', marginTop: '12px', padding: '12px',
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#ef4444', fontSize: '14px', fontWeight: 600,
            textAlign: 'center', minHeight: '44px', touchAction: 'manipulation',
          }}
        >
          Delete this meal
        </button>
      )}
    </BottomSheet>
  );
}

// ── Simple meal form (for saved meals) ───────────────────────────────────────

function SimpleMealForm({ title, initialName, initialUrl, initialIngredients, onClose, onSave, onDelete }: {
  title: string;
  initialName: string;
  initialUrl: string;
  initialIngredients: { name: string; quantity: string }[];
  onClose: () => void;
  onSave: (name: string, url: string, ingredients: { name: string; quantity: string }[]) => Promise<void>;
  onDelete?: () => void;
}) {
  type Ingredient = { name: string; quantity: string; uid: number };
  const uidRef = useRef(0);
  const nextUid = () => { uidRef.current += 1; return uidRef.current; };

  const defaultMode = initialIngredients.length > 0 ? 'ingredients' : 'url';
  const [name, setName] = useState(initialName);
  const [mode, setMode] = useState<'url' | 'ingredients'>(defaultMode);
  const [url, setUrl] = useState(initialUrl);
  const [ingredients, setIngredients] = useState<Ingredient[]>(
    initialIngredients.length > 0
      ? initialIngredients.map((i) => ({ ...i, uid: nextUid() }))
      : [{ name: '', quantity: '', uid: nextUid() }]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const addIngredient = () => setIngredients((prev) => [...prev, { name: '', quantity: '', uid: nextUid() }]);

  const removeIngredient = (idx: number) => {
    setIngredients((prev) => prev.length === 1 ? [{ name: '', quantity: '', uid: nextUid() }] : prev.filter((_, i) => i !== idx));
  };

  const updateIngredient = (idx: number, field: 'name' | 'quantity', value: string) => {
    setIngredients((prev) => prev.map((ing, i) => i === idx ? { ...ing, [field]: value } : ing));
  };

  const handleModeSwitch = (newMode: 'url' | 'ingredients') => {
    setMode(newMode);
    // Preserve both states — only the active mode's data is submitted on save
  };

  const handleSave = async () => {
    if (!name.trim()) { setError('Meal name is required'); return; }
    if (mode === 'ingredients' && !ingredients.some((i) => i.name.trim())) {
      setError('Add at least one ingredient, or switch to Recipe URL');
      return;
    }
    setSaving(true);
    try {
      if (mode === 'url') {
        await onSave(name.trim(), url, []);
      } else {
        await onSave(name.trim(), '', ingredients.map(({ name: n, quantity }) => ({ name: n, quantity })));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet onClose={onClose}>
      <h2 style={{ margin: '0 0 20px', fontFamily: 'Rubik, sans-serif', fontSize: '18px', fontWeight: 600, color: '#1a1a1a' }}>
        {title}
      </h2>

      <label style={labelStyle}>MEAL NAME</label>
      <input
        type="text"
        value={name}
        onChange={(e) => { setName(e.target.value); setError(''); }}
        placeholder="e.g. Chilli Con Carne"
        style={{ ...inputStyle, borderColor: error ? '#ef4444' : '#e5e5e5' }}
      />
      {error && <div style={errorStyle}>{error}</div>}

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '20px', marginBottom: '16px' }}>
        {(['url', 'ingredients'] as const).map((m) => (
          <button
            key={m}
            onClick={() => handleModeSwitch(m)}
            style={{
              flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer',
              border: `1.5px solid ${mode === m ? SAGE : '#e5e5e5'}`,
              background: mode === m ? SAGE_LIGHT : '#fff',
              color: mode === m ? SAGE_TEXT : '#6b7280',
              fontWeight: mode === m ? 700 : 600,
              fontSize: '13px', touchAction: 'manipulation',
              fontFamily: 'Nunito Sans, sans-serif',
            }}
          >
            {m === 'url' ? 'Recipe URL' : 'Manual Ingredients'}
          </button>
        ))}
      </div>

      {mode === 'url' ? (
        <>
          <label style={labelStyle}>RECIPE URL <span style={{ color: '#9ca3af', fontSize: '10px' }}>(OPTIONAL)</span></label>
          <input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." style={inputStyle} />
        </>
      ) : (
        <>
          <label style={labelStyle}>INGREDIENTS</label>
          {ingredients.map((ing, idx) => (
            <div key={ing.uid} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
              <input
                type="text"
                value={ing.name}
                onChange={(e) => updateIngredient(idx, 'name', e.target.value)}
                placeholder="e.g. Chicken Breast"
                style={{ ...inputStyle, flex: 1 }}
              />
              <input
                type="text"
                value={ing.quantity}
                onChange={(e) => updateIngredient(idx, 'quantity', e.target.value)}
                placeholder="e.g. 500g"
                style={{ ...inputStyle, width: '80px', flex: 'none' }}
              />
              <button
                onClick={() => removeIngredient(idx)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af',
                  fontSize: '18px', padding: '4px 6px', lineHeight: 1, flexShrink: 0,
                  minWidth: '32px', minHeight: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                aria-label="Remove ingredient"
              >
                ×
              </button>
            </div>
          ))}
          <button
            onClick={addIngredient}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: 'none', border: `1.5px dashed ${SAGE}`,
              borderRadius: '8px', color: SAGE, cursor: 'pointer',
              fontSize: '14px', fontWeight: 600, padding: '10px 14px',
              width: '100%', marginTop: '4px', touchAction: 'manipulation',
              fontFamily: 'Nunito Sans, sans-serif',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add ingredient
          </button>
        </>
      )}

      <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
        <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
        <button onClick={() => void handleSave()} disabled={saving} style={saveBtnStyle(saving)}>
          {saving ? 'Saving…' : 'Save Meal'}
        </button>
      </div>

      {onDelete && (
        <button onClick={onDelete} style={{ display: 'block', width: '100%', marginTop: '12px', padding: '12px', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '14px', fontWeight: 600, textAlign: 'center', minHeight: '44px', touchAction: 'manipulation' }}>
          Delete from library
        </button>
      )}
    </BottomSheet>
  );
}

// ── Add to Week Sheet ─────────────────────────────────────────────────────────

function AddToWeekSheet({ savedMeal, daysInWeek, onClose, onAdd }: {
  savedMeal: SavedMeal;
  daysInWeek: number[];
  onClose: () => void;
  onAdd: (days: number[]) => Promise<void>;
}) {
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const toggleDay = (d: number) => {
    setSelectedDays((prev) => {
      const next = new Set(prev);
      next.has(d) ? next.delete(d) : next.add(d);
      return next;
    });
  };

  const handleAdd = async () => {
    if (selectedDays.size === 0) { setError('Select at least one day'); return; }
    setAdding(true);
    try { await onAdd(Array.from(selectedDays)); } finally { setAdding(false); }
  };

  const row1 = daysInWeek.slice(0, 4);
  const row2 = daysInWeek.slice(4);

  return (
    <BottomSheet onClose={onClose}>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontFamily: 'Rubik, sans-serif', fontSize: '17px', fontWeight: 600, color: '#1a1a1a' }}>{savedMeal.mealName}</div>
        <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '2px' }}>Which days this week?</div>
      </div>

      {[row1, row2].map((row, ri) => (
        <div key={ri} style={{ display: 'flex', gap: '8px', marginBottom: ri === 0 ? '8px' : '0', flexWrap: 'wrap' }}>
          {row.map((d) => (
            <DayChip key={d} day={d} selected={selectedDays.has(d)} onToggle={() => toggleDay(d)} />
          ))}
        </div>
      ))}
      {error && <div style={errorStyle}>{error}</div>}

      <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
        <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
        <button onClick={() => void handleAdd()} disabled={adding} style={saveBtnStyle(adding)}>
          {adding ? 'Adding…' : 'Add to Plan'}
        </button>
      </div>
    </BottomSheet>
  );
}

// ── Bottom Sheet wrapper ──────────────────────────────────────────────────────

function BottomSheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, animation: 'fadeIn 0.15s ease' }} />
      <div
        data-meal-sheet
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: '#fff', borderRadius: '20px 20px 0 0',
          padding: '16px 20px 2rem', paddingBottom: '2rem',
          maxHeight: '90vh', overflowY: 'auto',
          zIndex: 201, animation: 'slideUp 0.2s ease',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
        }}
      >
        {/* Drag handle */}
        <div style={{ width: '40px', height: '4px', background: '#d1d5db', borderRadius: '2px', margin: '0 auto 20px' }} />
        {children}
      </div>
    </>
  );
}

// ── Delete confirmation ───────────────────────────────────────────────────────

function DeleteConfirm({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <>
      <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 300, animation: 'fadeIn 0.15s ease' }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: '#fff', borderRadius: '20px 20px 0 0',
        padding: '24px 20px 2rem',
        zIndex: 301, animation: 'slideUp 0.2s ease',
        textAlign: 'center',
      }}>
        <div style={{ width: '40px', height: '4px', background: '#d1d5db', borderRadius: '2px', margin: '0 auto 20px' }} />
        <div style={{ fontFamily: 'Rubik, sans-serif', fontSize: '17px', fontWeight: 600, marginBottom: '8px' }}>Delete this meal?</div>
        <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '20px' }}>This cannot be undone.</div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={onCancel} style={cancelBtnStyle}>Keep</button>
          <button onClick={onConfirm} style={{ flex: 1, padding: '14px', borderRadius: '10px', border: 'none', background: '#ef4444', color: '#fff', fontWeight: 700, fontSize: '16px', cursor: 'pointer', minHeight: '48px', fontFamily: 'Nunito Sans, sans-serif' }}>
            Delete
          </button>
        </div>
      </div>
    </>
  );
}

// ── Day Chip ──────────────────────────────────────────────────────────────────

function DayChip({ day, selected, onToggle }: { day: number; selected: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        minWidth: '60px', minHeight: '44px',
        borderRadius: '22px', padding: '0 12px',
        fontSize: '14px', fontWeight: 600,
        border: `1.5px solid ${selected ? SAGE : '#e5e5e5'}`,
        background: selected ? SAGE : '#f5f5f5',
        color: selected ? '#fff' : '#6b7280',
        cursor: 'pointer', touchAction: 'manipulation',
        transition: 'all 0.1s',
        fontFamily: 'Nunito Sans, sans-serif',
      }}
    >
      {shortDay(day)}
    </button>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px', borderRadius: '10px',
  border: '1.5px solid #e5e5e5', fontSize: '16px',
  boxSizing: 'border-box', fontFamily: 'Nunito Sans, sans-serif',
  color: '#1a1a1a', background: '#fff',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 700, color: '#9ca3af',
  letterSpacing: '0.08em', marginBottom: '8px',
};

const errorStyle: React.CSSProperties = {
  color: '#ef4444', fontSize: '12px', marginTop: '4px', fontWeight: 600,
};

const backBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '4px',
  background: 'none', border: 'none', cursor: 'pointer',
  color: SAGE, fontSize: '14px', fontWeight: 700,
  fontFamily: 'Nunito Sans, sans-serif', padding: '0 0 16px',
  touchAction: 'manipulation',
};

const cancelBtnStyle: React.CSSProperties = {
  flex: 1, padding: '14px', borderRadius: '10px',
  border: '1.5px solid #e5e5e5', background: '#fff',
  fontWeight: 600, fontSize: '16px', cursor: 'pointer',
  minHeight: '48px', fontFamily: 'Nunito Sans, sans-serif', color: '#374151',
};

function saveBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    flex: 1, padding: '14px', borderRadius: '10px',
    border: 'none', background: disabled ? '#9ca3af' : SAGE,
    color: '#fff', fontWeight: 700, fontSize: '16px',
    cursor: disabled ? 'default' : 'pointer',
    minHeight: '48px', fontFamily: 'Nunito Sans, sans-serif',
  };
}

function navBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '44px', height: '44px', borderRadius: '50%',
    border: '1.5px solid #e5e5e5', background: '#fff',
    cursor: disabled ? 'default' : 'pointer',
    color: disabled ? '#d1d5db' : '#1a1a1a',
    opacity: disabled ? 0.5 : 1,
    touchAction: 'manipulation',
  };
}
