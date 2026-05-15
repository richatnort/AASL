import type { AisleOrder, CategoryConfig, GiftCard, Item, User } from '@shopping-list/shared';
import { DEFAULT_AISLE_ORDER } from '@shopping-list/shared';
import { useEffect, useState } from 'react';
import { AlexaSyncButton } from './components/integrations/AlexaSyncButton.js';
import { AddItemForm } from './components/items/AddItemForm.js';
import { AislePicker } from './components/items/AislePicker.js';
import { CategoryPicker } from './components/items/CategoryPicker.js';
import { CategorySection } from './components/items/CategorySection.js';
import { NeedsCategorisingSection } from './components/items/NeedsCategorisingSection.js';
import { BottomNav } from './components/layout/BottomNav.js';
import { useToast } from './components/layout/Toast.js';
import { Toast } from './components/layout/Toast.js';
import { MealPlannerPage } from './components/meal-planner/MealPlannerPage.js';
import { RecipeModal } from './components/recipes/RecipeModal.js';
import { SettingsPage } from './components/settings/SettingsPage.js';
import { useItems } from './hooks/useItems.js';
import { useLocalStorage } from './hooks/useLocalStorage.js';
import { addAisleTerm, confirmCategory as apiConfirmCategory, getCategoryConfig, getGiftCardBalance, getGiftCards, getMe, getSettings, getShopDaySuggestions, renameItem, setCategoryOrder, syncAlexa } from './lib/api.js';

export function App() {
  const [user, setUser] = useState<User | null | 'loading'>('loading');
  const [page, setPage] = useState<'list' | 'meal-planner' | 'settings'>('list');
  const [mealPlanStartDay, setMealPlanStartDay] = useState<number | null>(null); // loaded from settings
  const [aisleOrder, setAisleOrder] = useState<AisleOrder>(DEFAULT_AISLE_ORDER);
  const [pendingAisleItem, setPendingAisleItem] = useState<{ id: number; displayName: string } | null>(null);
  const [categoryConfigs, setCategoryConfigs] = useState<CategoryConfig[]>([]);
  const [giftCards, setGiftCards] = useState<GiftCard[]>([]);
  const { items, loading, needsCategory, load, addItem, confirmCategory, dismissCategory, updateQty, removeItem, checkItem } = useItems();
  const [collapsed, setCollapsed] = useLocalStorage<Record<string, boolean>>('collapsed', {});
  const { toasts, show: showToast, dismiss: dismissToast } = useToast();
  const [suggestions, setSuggestions] = useState<{ message: string | null; items: string[] } | null>(null);
  const [showRecipe, setShowRecipe] = useState(false);
  const [recipeInitialUrl, setRecipeInitialUrl] = useState<string | undefined>(undefined);

  // Auth check
  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  const runAlexaSync = () => {
    syncAlexa()
      .then((result) => {
        const added = result.added.length;
        const uncategorised = result.savedUncategorised;
        const removed = result.removed.length;
        if (added > 0 || uncategorised > 0 || removed > 0) {
          const parts = [];
          if (added > 0) parts.push(`${added} added from Alexa`);
          if (uncategorised > 0) parts.push(`${uncategorised} need categorising`);
          if (removed > 0) parts.push(`${removed} ticked off via Alexa`);
          showToast(parts.join(', '), 'info');
          void load();
        }
      })
      .catch(() => { /* Alexa unavailable — non-fatal */ });
  };

  // Load items, category config, gift cards, and auto-sync Alexa on auth
  useEffect(() => {
    if (user && user !== 'loading' && user.approved) {
      void load();
      getCategoryConfig()
        .then(setCategoryConfigs)
        .catch(() => { /* keep empty on error */ });
      getGiftCards()
        .then(setGiftCards)
        .catch(() => { /* non-fatal */ });
      getSettings()
        .then((s) => {
          setMealPlanStartDay(s.mealPlanStartDay ?? 3); // default Wednesday
          setAisleOrder(s.supermarketAisleOrder);
        })
        .catch(() => { setMealPlanStartDay(3); }); // fallback Wednesday on error
      // Check for shop day suggestions
      const today = new Date().toISOString().slice(0, 10);
      const dismissKey = `suggestions_dismissed_${today}`;
      if (!localStorage.getItem(dismissKey)) {
        getShopDaySuggestions()
          .then((r) => { if (r.suggestions.length > 0) setSuggestions({ message: r.message, items: r.suggestions }); })
          .catch(() => { /* non-fatal */ });
      }

      // Auto-sync Alexa silently on page load
      runAlexaSync();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Auto-refresh gift card balances whenever the list page becomes active
  useEffect(() => {
    if (page !== 'list' || !giftCards.length) return;
    for (const card of giftCards) {
      getGiftCardBalance(card.id)
        .then(({ balance }) => {
          setGiftCards((prev) => prev.map((c) => c.id === card.id ? { ...c, lastBalance: balance } : c));
        })
        .catch(() => { /* silent — stale balance stays */ });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, giftCards.length]);

  // Background Alexa poll every 5 minutes
  useEffect(() => {
    if (!user || user === 'loading') return;
    const interval = setInterval(runAlexaSync, 5 * 60 * 1000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const orderedCategories = categoryConfigs
    .map((c) => c.category)
    .filter((c) => c !== 'needs_categorising'); // rendered separately

  const toggleCollapse = (cat: string) => {
    setCollapsed({ ...collapsed, [cat]: !collapsed[cat] });
  };

  const moveCategory = (cat: string, direction: 'up' | 'down') => {
    const idx = orderedCategories.indexOf(cat);
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === orderedCategories.length - 1) return;
    const previousConfigs = [...categoryConfigs];
    const newConfigs = [...categoryConfigs];
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    [newConfigs[idx], newConfigs[swapIdx]] = [newConfigs[swapIdx]!, newConfigs[idx]!];
    setCategoryConfigs(newConfigs);
    setCategoryOrder(newConfigs.map((c) => c.category)).catch(() => setCategoryConfigs(previousConfigs));
  };

  const handleAdd = async (name: string): Promise<string | null> => {
    const err = await addItem(name);
    if (err) showToast(err, 'error');
    return err;
  };

  const handleConfirmCategory = async (category: string) => {
    const err = await confirmCategory(category);
    if (err) showToast(err, 'error');
    else showToast('Item added', 'success');
  };

  // Categorise an item that's in the needs_categorising section
  const handleCategoriseItem = async (item: Item, category: string) => {
    try {
      await apiConfirmCategory(item.displayName, item.quantity, category, item.alexaItemId ?? undefined);
      showToast('Item categorised', 'success');
      void load();
    } catch {
      showToast('Failed to categorise item', 'error');
    }
  };

  const handleDelete = (id: number, category: string) => {
    void removeItem(id, category);
    showToast('Item removed', 'info');
  };

  const handleCheck = async (id: number, category: string) => {
    const warning = await checkItem(id, category);
    if (warning) showToast(`${warning} — check your Alexa session`, 'error');
  };

  const handleAssignAisle = async (aisleId: string) => {
    if (!pendingAisleItem) return;
    try {
      await addAisleTerm(pendingAisleItem.displayName, aisleId);
      setPendingAisleItem(null);
      await load();
    } catch {
      showToast('Failed to assign aisle', 'error');
    }
  };

  const handleRename = async (id: number, newName: string) => {
    try {
      await renameItem(id, newName);
      void load();
    } catch {
      showToast('Failed to rename item', 'error');
    }
  };

  // Build gift card balance map: categoryKey → lastBalance
  const giftCardBalances: Record<string, string | null> = Object.fromEntries(
    giftCards.filter((c) => c.lastBalance).map((c) => [c.categoryKey, c.lastBalance])
  );

  const needsCategorisingItems = items['needs_categorising'] ?? [];
  const totalItems = orderedCategories.reduce((sum, cat) => sum + (items[cat]?.length ?? 0), 0)
    + needsCategorisingItems.length;

  // ── Loading auth ──────────────────────────────────────────────────────────
  if (user === 'loading') {
    return <Screen><Spinner /></Screen>;
  }

  // ── Not logged in ─────────────────────────────────────────────────────────
  if (!user) {
    return (
      <Screen>
        <div style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🛒</div>
          <h1 style={{ fontFamily: 'Rubik, sans-serif', fontSize: '1.75rem', margin: '0 0 0.5rem', color: '#1a1a1a' }}>
            Shopping List
          </h1>
          <p style={{ color: '#666', marginBottom: '2rem' }}>Sign in to manage your list</p>
          <a
            href="/auth/google"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.75rem',
              padding: '0.875rem 1.75rem', borderRadius: '0.5rem',
              background: '#fff', border: '1.5px solid #e0e0e0',
              color: '#333', fontWeight: 600, fontSize: '0.95rem',
              textDecoration: 'none', boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
              transition: 'box-shadow 0.15s',
            }}
          >
            <GoogleIcon /> Sign in with Google
          </a>
        </div>
      </Screen>
    );
  }

  // ── Pending approval ──────────────────────────────────────────────────────
  if (!user.approved) {
    return (
      <Screen>
        <div style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⏳</div>
          <h2 style={{ fontFamily: 'Rubik, sans-serif', color: '#1a1a1a', marginBottom: '0.5rem' }}>
            Access Pending
          </h2>
          <p style={{ color: '#666' }}>Ask Richard to approve your account.</p>
          <a href="/auth/logout" style={{ color: '#2563eb', marginTop: '1.5rem', display: 'inline-block' }}>
            Sign out
          </a>
        </div>
      </Screen>
    );
  }

  const handleNavigate = (newPage: 'list' | 'meal-planner' | 'settings') => {
    // Refresh gift cards, settings, and items when leaving settings
    if (page === 'settings' && newPage !== 'settings') {
      getGiftCards().then(setGiftCards).catch(() => {});
      getSettings()
        .then((s) => {
          setMealPlanStartDay(s.mealPlanStartDay ?? 3);
          setAisleOrder(s.supermarketAisleOrder);
        })
        .catch(() => {});
      void load();
    }
    setPage(newPage);
  };

  // ── Authenticated app shell ────────────────────────────────────────────────
  return (
    <Screen>
      {/* List page */}
      {page === 'list' && (
        <>
          {/* Header */}
          <header style={{
            position: 'sticky', top: 0, zIndex: 100,
            background: '#fff', borderBottom: '1px solid #f0f0f0',
            padding: '0.875rem 1rem',
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          }}>
            <span style={{ fontSize: '1.375rem' }}>🛒</span>
            <h1 style={{
              flex: 1, margin: 0, fontFamily: 'Rubik, sans-serif',
              fontSize: '1.125rem', fontWeight: 600, color: '#1a1a1a',
            }}>
              Shopping List
              {totalItems > 0 && (
                <span style={{ marginLeft: '0.5rem', color: '#999', fontWeight: 400, fontSize: '0.9rem' }}>
                  ({totalItems})
                </span>
              )}
            </h1>
            <button
              onClick={() => setShowRecipe(true)}
              title="Import recipe"
              style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.5rem 0.875rem', borderRadius: '999px',
                border: '1.5px solid #e0e0e0', background: '#fff',
                cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: '#333',
                boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
              }}
            >
              📋
            </button>
            <AlexaSyncButton onSync={load} onToast={showToast} />
          </header>

          {/* Gift card balance strip */}
          <GiftCardBalanceStrip giftCards={giftCards} categoryConfigs={categoryConfigs} />

          {/* Content */}
          <main data-main-content style={{ padding: '1rem', maxWidth: '600px', margin: '0 auto', paddingBottom: '72px' }}>
            <AddItemForm
              onAdd={handleAdd}
              onRecipeUrl={(url) => { setRecipeInitialUrl(url); setShowRecipe(true); }}
            />

            {/* Shop day suggestions banner */}
            {suggestions && (
              <ShopSuggestionsBanner
                message={suggestions.message}
                items={suggestions.items}
                onAdd={(name) => { void handleAdd(name); }}
                onDismiss={() => {
                  const today = new Date().toISOString().slice(0, 10);
                  localStorage.setItem(`suggestions_dismissed_${today}`, '1');
                  setSuggestions(null);
                }}
              />
            )}

            {loading ? (
              <Spinner />
            ) : (
              <>
                {/* Needs Categorising — always at top if present */}
                <NeedsCategorisingSection
                  items={needsCategorisingItems}
                  categoryConfigs={categoryConfigs}
                  onCategorise={handleCategoriseItem}
                  onDelete={handleDelete}
                />

                {/* Regular category sections */}
                {orderedCategories.map((cat, idx) => {
                  const cfg = categoryConfigs.find((c) => c.category === cat);
                  return (
                    <CategorySection
                      key={cat}
                      category={cat}
                      displayName={cfg?.displayName ?? undefined}
                      color={cfg?.color ?? undefined}
                      giftCardBalance={giftCardBalances[cat] ?? null}
                      items={items[cat] ?? []}
                      collapsed={collapsed[cat] ?? false}
                      onToggle={() => toggleCollapse(cat)}
                      onUpdateQty={updateQty}
                      onDelete={handleDelete}
                      onCheck={handleCheck}
                      onAssignAisle={(id, displayName) => setPendingAisleItem({ id, displayName })}
                      onRename={handleRename}
                      onMoveUp={idx > 0 ? () => moveCategory(cat, 'up') : undefined}
                      onMoveDown={idx < orderedCategories.length - 1 ? () => moveCategory(cat, 'down') : undefined}
                    />
                  );
                })}
              </>
            )}
          </main>
        </>
      )}

      {/* Meal planner page */}
      {page === 'meal-planner' && mealPlanStartDay !== null && (
        <MealPlannerPage mealPlanStartDay={mealPlanStartDay} onAddToList={handleAdd} />
      )}
      {page === 'meal-planner' && mealPlanStartDay === null && <Spinner />}

      {/* Settings page */}
      {page === 'settings' && (
        <SettingsPage
          categoryConfigs={categoryConfigs}
          onCategoriesChange={setCategoryConfigs}
          onClose={() => handleNavigate('list')}
        />
      )}

      {/* Bottom navigation — always visible */}
      <BottomNav activePage={page} onNavigate={handleNavigate} />

      {/* Category picker bottom sheet — for manual add that couldn't be categorised */}
      {needsCategory && (
        <CategoryPicker
          itemName={needsCategory.name}
          categories={categoryConfigs.filter((c) => c.category !== 'needs_categorising')}
          onSelect={handleConfirmCategory}
          onDismiss={dismissCategory}
        />
      )}

      {/* Aisle picker bottom sheet — for items with no aisle match in Sainsbury's mode */}
      {pendingAisleItem && (
        <AislePicker
          itemName={pendingAisleItem.displayName}
          aisleOrder={aisleOrder}
          onSelect={handleAssignAisle}
          onDismiss={() => setPendingAisleItem(null)}
        />
      )}

      {/* Recipe import modal */}
      {showRecipe && (
        <RecipeModal
          initialUrl={recipeInitialUrl}
          onAddItem={handleAdd}
          onClose={() => { setShowRecipe(false); setRecipeInitialUrl(undefined); }}
        />
      )}

      {/* Toasts */}
      <Toast toasts={toasts} onDismiss={dismissToast} />

      {/* Global styles */}
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: #f5f5f5; }
        @keyframes slideUp {
          from { transform: translateY(8px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @supports (padding: env(safe-area-inset-bottom)) {
          [data-bottom-nav] { padding-bottom: env(safe-area-inset-bottom) !important; }
          [data-main-content] { padding-bottom: calc(64px + env(safe-area-inset-bottom)) !important; }
          [data-meal-sheet] { padding-bottom: max(2rem, env(safe-area-inset-bottom)) !important; }
        }
      `}</style>
    </Screen>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100dvh', background: '#f5f5f5', fontFamily: 'Nunito Sans, sans-serif' }}>
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ textAlign: 'center', padding: '2rem', color: '#999' }}>
      Loading…
    </div>
  );
}

function GiftCardBalanceStrip({ giftCards, categoryConfigs }: { giftCards: GiftCard[]; categoryConfigs: CategoryConfig[] }) {
  const withBalance = giftCards.filter((c) => c.lastBalance);
  if (!withBalance.length) return null;
  return (
    <div style={{
      overflowX: 'auto', display: 'flex', gap: '0.5rem',
      padding: '0.5rem 1rem', background: '#fff', borderBottom: '1px solid #f0f0f0',
    }}>
      {withBalance.map((card) => {
        const cfg = categoryConfigs.find((c) => c.category === card.categoryKey);
        const color = cfg?.color ?? '#6b7280';
        return (
          <div key={card.id} style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0,
            padding: '0.3rem 0.75rem', borderRadius: '999px',
            background: `${color}12`, border: `1.5px solid ${color}40`,
            fontSize: '0.82rem', fontWeight: 600, color: '#1a1a1a',
          }}>
            <span>💳</span>
            <span style={{ color }}>{cfg?.displayName ?? card.categoryKey}</span>
            <span>{card.lastBalance}</span>
          </div>
        );
      })}
    </div>
  );
}

function ShopSuggestionsBanner({
  message,
  items,
  onAdd,
  onDismiss,
}: {
  message: string | null;
  items: string[];
  onAdd: (name: string) => void;
  onDismiss: () => void;
}) {
  const [added, setAdded] = useState<Set<string>>(new Set());

  const handleAdd = (name: string) => {
    onAdd(name);
    setAdded((prev) => new Set(prev).add(name));
  };

  return (
    <div style={{
      background: '#fffbeb', border: '1.5px solid #fde68a',
      borderRadius: '0.75rem', padding: '0.875rem 1rem',
      marginBottom: '0.75rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.625rem' }}>
        <span style={{ fontSize: '1rem' }}>🛒</span>
        <p style={{ flex: 1, margin: 0, fontSize: '0.875rem', color: '#92400e', fontWeight: 600 }}>
          {message ?? "It's your weekly shop — here are some regulars:"}
        </p>
        <button
          onClick={onDismiss}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#92400e', opacity: 0.6, fontSize: '1rem', lineHeight: 1, padding: '0.1rem' }}
        >
          ✕
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
        {items.map((name) => (
          <button
            key={name}
            onClick={() => handleAdd(name)}
            disabled={added.has(name)}
            style={{
              padding: '0.3rem 0.75rem', borderRadius: '999px',
              border: '1.5px solid #fcd34d',
              background: added.has(name) ? '#fef3c7' : '#fff',
              color: added.has(name) ? '#92400e' : '#374151',
              fontSize: '0.82rem', fontWeight: 600,
              cursor: added.has(name) ? 'default' : 'pointer',
              opacity: added.has(name) ? 0.6 : 1,
              transition: 'all 0.15s',
            }}
          >
            {added.has(name) ? `✓ ${name}` : `+ ${name}`}
          </button>
        ))}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/>
    </svg>
  );
}
