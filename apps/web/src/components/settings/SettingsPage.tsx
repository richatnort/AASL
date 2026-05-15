import type { AisleOrder, AlexaStatus, CategoryConfig, CategoryRule, GiftCard, ShopSettingsWithMealPlanner, SupermarketSortMode } from '@shopping-list/shared';
import { DEFAULT_AISLE_ORDER } from '@shopping-list/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import {addCategory, addRule, alexaAuthRefresh, alexaAuthStart,createGiftCard, deleteCategory, deleteGiftCard, deleteRule, 
  getAlexaStatus, 
  getCategoryConfig, getGiftCardBalance,
  getGiftCards, 
  getRules, 
  getSettings, recategoriseItems,setCategoryOrder,updateGiftCard, updateRule, updateSettings,upsertCategory, 
} from '../../lib/api.js';

type Tab = 'rules' | 'categories' | 'gift-cards' | 'alexa' | 'shopping';

type Props = {
  categoryConfigs: CategoryConfig[];
  onCategoriesChange: (configs: CategoryConfig[]) => void;
  onClose: () => void;
};

export function SettingsPage({ categoryConfigs, onCategoriesChange, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('rules');

  return (
    <div style={{ minHeight: '100dvh', background: '#f5f5f5', fontFamily: 'Nunito Sans, sans-serif' }}>
      {/* Header */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: '#fff', borderBottom: '1px solid #f0f0f0',
        padding: '0.875rem 1rem',
        display: 'flex', alignItems: 'center', gap: '0.75rem',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#666', fontSize: '1rem', padding: '0.25rem 0.5rem',
            borderRadius: '0.375rem',
          }}
        >
          ← Back
        </button>
        <h1 style={{
          flex: 1, margin: 0, fontFamily: 'Rubik, sans-serif',
          fontSize: '1.125rem', fontWeight: 600, color: '#1a1a1a',
        }}>
          Settings
        </h1>
        <a href="/auth/logout" style={{ color: '#999', fontSize: '0.85rem', textDecoration: 'none' }}>
          Sign out
        </a>
      </header>

      {/* Tabs */}
      <div style={{
        display: 'flex', background: '#fff',
        borderBottom: '1px solid #f0f0f0',
        overflowX: 'auto',
      }}>
        {(['rules', 'categories', 'gift-cards', 'alexa', 'shopping'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '0.75rem 1.25rem', background: 'none', border: 'none',
              cursor: 'pointer', whiteSpace: 'nowrap', fontSize: '0.9rem',
              fontWeight: tab === t ? 700 : 400,
              color: tab === t ? '#2563eb' : '#666',
              borderBottom: tab === t ? '2px solid #2563eb' : '2px solid transparent',
              transition: 'all 0.15s',
            }}
          >
            {t === 'rules' ? 'Rules' : t === 'categories' ? 'Categories' : t === 'gift-cards' ? 'Gift Cards' : t === 'alexa' ? 'Alexa' : 'Shopping'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <main style={{ padding: '1rem', maxWidth: '600px', margin: '0 auto' }}>
        {tab === 'rules' && <RulesTab categoryConfigs={categoryConfigs} />}
        {tab === 'categories' && (
          <CategoriesTab
            categoryConfigs={categoryConfigs}
            onCategoriesChange={onCategoriesChange}
          />
        )}
        {tab === 'gift-cards' && <GiftCardsTab categoryConfigs={categoryConfigs} />}
        {tab === 'alexa' && <AlexaTab />}
        {tab === 'shopping' && <ShoppingTab />}
      </main>
    </div>
  );
}

// ── Rules Tab ─────────────────────────────────────────────────────────────────

function RulesTab({ categoryConfigs }: { categoryConfigs: CategoryConfig[] }) {
  const [rules, setRules] = useState<CategoryRule[]>([]);
  const [search, setSearch] = useState('');
  const [showSeeds, setShowSeeds] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const PAGE_SIZE = 25;
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [newTerm, setNewTerm] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [addingRule, setAddingRule] = useState(false);

  // Close dropdown on outside click
  useEffect(() => {
    if (!openDropdown) return;
    const handler = () => setOpenDropdown(null);
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openDropdown]);

  const fetchRules = useCallback(async (q?: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getRules(q || undefined);
      setRules(data);
    } catch {
      setError('Failed to load rules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchRules(); }, [fetchRules]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearch(q);
    setPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void fetchRules(q), 300);
  };

  const handleCategoryChange = async (term: string, category: string) => {
    setSaving(term);
    try {
      const updated = await updateRule(term, category);
      setRules((prev) => prev.map((r) => r.term === term ? updated : r));
    } finally {
      setSaving(null);
    }
  };

  const handleDeleteRule = async (term: string) => {
    setDeleting(term);
    const previous = rules;
    setRules((prev) => prev.filter((r) => r.term !== term));
    try {
      await deleteRule(term);
    } catch {
      setRules(previous);
    } finally {
      setDeleting(null);
    }
  };

  const handleAddRule = async () => {
    const cat = newCategory || categoryConfigs[0]?.category || '';
    if (!newTerm.trim() || !cat) return;
    setAddingRule(true);
    try {
      const created = await addRule(newTerm.trim(), cat);
      setRules((prev) => {
        const idx = prev.findIndex((r) => r.term === created.term);
        if (idx >= 0) { const next = [...prev]; next[idx] = created; return next; }
        return [created, ...prev];
      });
      setNewTerm('');
      setPage(1);
      await recategoriseItems();
    } finally {
      setAddingRule(false);
    }
  };

  const visibleRules = search ? rules : rules.filter((r) => showSeeds || r.source !== 'seed');
  const seedCount = rules.filter((r) => r.source === 'seed').length;
  const totalPages = search ? 1 : Math.ceil(visibleRules.length / PAGE_SIZE);
  const pagedRules = search ? visibleRules : visibleRules.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      {/* Add rule form — stacked for mobile: input full-width, then dropdown + button row */}
      <div style={{ marginBottom: '0.75rem' }}>
        <input
          type="text"
          placeholder="New term (e.g. tomato puree)"
          value={newTerm}
          onChange={(e) => setNewTerm(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleAddRule(); }}
          style={{
            display: 'block', width: '100%', padding: '0.625rem 0.875rem',
            borderRadius: '0.625rem', border: '1.5px solid #e0e0e0',
            fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box',
            marginBottom: '0.5rem',
          }}
        />
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <select
            value={newCategory || categoryConfigs[0]?.category || ''}
            onChange={(e) => setNewCategory(e.target.value)}
            style={{
              flex: 1, padding: '0.625rem 0.5rem', borderRadius: '0.625rem',
              border: '1.5px solid #e0e0e0', fontSize: '0.85rem',
              background: '#fff', cursor: 'pointer', outline: 'none',
              minWidth: 0,
            }}
          >
            {categoryConfigs.map((c) => (
              <option key={c.category} value={c.category}>{c.displayName ?? c.category}</option>
            ))}
          </select>
          <button
            onClick={() => void handleAddRule()}
            disabled={!newTerm.trim() || addingRule}
            style={{
              flexShrink: 0, padding: '0.625rem 1.25rem', borderRadius: '0.625rem',
              border: 'none', background: '#2563eb', color: '#fff',
              fontSize: '0.9rem', fontWeight: 600,
              cursor: newTerm.trim() && !addingRule ? 'pointer' : 'not-allowed',
              opacity: newTerm.trim() && !addingRule ? 1 : 0.5,
            }}
          >
            {addingRule ? '...' : 'Add'}
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', alignItems: 'center' }}>
        <input
          type="search"
          placeholder="Search rules..."
          value={search}
          onChange={handleSearch}
          style={{
            flex: 1, padding: '0.75rem 1rem', borderRadius: '0.75rem',
            border: '1.5px solid #e0e0e0', fontSize: '0.95rem',
            boxSizing: 'border-box', outline: 'none',
          }}
        />
        {!search && (
          <button
            onClick={() => { setShowSeeds((v) => !v); setPage(1); }}
            style={{
              padding: '0.5rem 0.75rem', borderRadius: '0.75rem', flexShrink: 0,
              border: '1.5px solid #e0e0e0', fontSize: '0.8rem', fontWeight: 600,
              background: showSeeds ? '#f3f4f6' : '#fff', cursor: 'pointer', color: '#6b7280',
            }}
          >
            {showSeeds ? `Hide seeds (${seedCount})` : `Show seeds (${seedCount})`}
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>Loading…</div>
      ) : error ? (
        <div style={{ textAlign: 'center', color: '#dc2626', padding: '2rem' }}>{error}</div>
      ) : visibleRules.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>No rules yet</div>
      ) : (
        <div style={{ background: '#fff', borderRadius: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          {pagedRules.map((rule, idx) => {
            const selectedLabel = categoryConfigs.find((c) => c.category === rule.category)?.displayName ?? rule.category;
            const isOpen = openDropdown === rule.term;
            return (
              <div
                key={rule.term}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '0.75rem 1rem',
                  borderBottom: idx < pagedRules.length - 1 ? '1px solid #f0f0f0' : 'none',
                  borderRadius: idx === 0 ? '0.75rem 0.75rem 0 0' : idx === pagedRules.length - 1 ? '0 0 0.75rem 0.75rem' : undefined,
                }}
              >
                <span style={{ flex: 1, fontSize: '0.95rem', color: '#1a1a1a' }}>{rule.term}</span>
                <div style={{ position: 'relative' }} onMouseDown={(e) => e.stopPropagation()}>
                  <button
                    disabled={saving === rule.term}
                    onClick={() => setOpenDropdown(isOpen ? null : rule.term)}
                    style={{
                      padding: '0.375rem 0.625rem', borderRadius: '0.375rem',
                      border: '1.5px solid #e0e0e0', fontSize: '0.85rem',
                      background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem',
                    }}
                  >
                    {selectedLabel} <span style={{ fontSize: '0.65rem', opacity: 0.6 }}>▾</span>
                  </button>
                  {isOpen && (
                    <div style={{
                      position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 50,
                      background: '#fff', border: '1.5px solid #e0e0e0', borderRadius: '0.5rem',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.12)', minWidth: '10rem', overflow: 'hidden',
                    }}>
                      {categoryConfigs.map((c) => (
                        <button
                          key={c.category}
                          onClick={() => { void handleCategoryChange(rule.term, c.category); setOpenDropdown(null); }}
                          style={{
                            display: 'block', width: '100%', padding: '0.6rem 0.875rem',
                            background: rule.category === c.category ? '#f0f4ff' : 'none',
                            border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '0.85rem',
                            color: rule.category === c.category ? '#2563eb' : '#1a1a1a',
                          }}
                        >
                          {c.displayName ?? c.category}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <span style={{
                  fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '999px',
                  background: rule.source === 'ai' ? '#dbeafe' : rule.source === 'seed' ? '#f0fdf4' : '#f3f4f6',
                  color: rule.source === 'ai' ? '#1d4ed8' : rule.source === 'seed' ? '#15803d' : '#6b7280',
                  fontWeight: 600, flexShrink: 0,
                }}>
                  {rule.source === 'ai' ? '🤖 AI' : rule.source === 'seed' ? '🌱 Seed' : '✋ Manual'}
                </span>
                <button
                  onClick={() => void handleDeleteRule(rule.term)}
                  disabled={deleting === rule.term}
                  title="Delete rule"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#dc2626', fontSize: '1rem', lineHeight: 1,
                    padding: '0.25rem', opacity: deleting === rule.term ? 0.4 : 0.7,
                    flexShrink: 0,
                  }}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.75rem' }}>
        <span style={{ color: '#999', fontSize: '0.8rem' }}>
          {visibleRules.length} rule{visibleRules.length !== 1 ? 's' : ''}{!showSeeds && !search && seedCount > 0 ? ` (${seedCount} seeds hidden)` : ''}
        </span>
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{ padding: '0.25rem 0.625rem', borderRadius: '0.375rem', border: '1.5px solid #e0e0e0', background: '#fff', cursor: page === 1 ? 'default' : 'pointer', color: page === 1 ? '#ccc' : '#333', fontSize: '0.85rem' }}
            >
              ←
            </button>
            <span style={{ fontSize: '0.8rem', color: '#666' }}>{page} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              style={{ padding: '0.25rem 0.625rem', borderRadius: '0.375rem', border: '1.5px solid #e0e0e0', background: '#fff', cursor: page === totalPages ? 'default' : 'pointer', color: page === totalPages ? '#ccc' : '#333', fontSize: '0.85rem' }}
            >
              →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Categories Tab ────────────────────────────────────────────────────────────

function CategoriesTab({
  categoryConfigs,
  onCategoriesChange,
}: {
  categoryConfigs: CategoryConfig[];
  onCategoriesChange: (c: CategoryConfig[]) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#3b82f6');
  const [addError, setAddError] = useState('');

  const startEdit = (cfg: CategoryConfig) => {
    setEditing(cfg.category);
    setEditName(cfg.displayName ?? cfg.category);
    setEditColor(cfg.color ?? '#6b7280');
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const updated = await upsertCategory(editing, editName, editColor);
      onCategoriesChange(categoryConfigs.map((c) => c.category === editing ? updated : c));
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (key: string) => {
    if (!confirm(`Delete category "${key}"? Items with this category will keep the key but won't appear in a section.`)) return;
    try {
      await deleteCategory(key);
      const updated = categoryConfigs.filter((c) => c.category !== key);
      onCategoriesChange(updated);
      await setCategoryOrder(updated.map((c) => c.category));
    } catch {
      alert('Failed to delete category');
    }
  };

  const handleMove = async (key: string, dir: 'up' | 'down') => {
    const idx = categoryConfigs.findIndex((c) => c.category === key);
    if (dir === 'up' && idx === 0) return;
    if (dir === 'down' && idx === categoryConfigs.length - 1) return;
    const previous = [...categoryConfigs];
    const newConfigs = [...categoryConfigs];
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    [newConfigs[idx], newConfigs[swapIdx]] = [newConfigs[swapIdx]!, newConfigs[idx]!];
    onCategoriesChange(newConfigs);
    try {
      await setCategoryOrder(newConfigs.map((c) => c.category));
    } catch {
      onCategoriesChange(previous); // rollback
    }
  };

  const handleAdd = async () => {
    setAddError('');
    if (!newKey.trim() || !newName.trim()) { setAddError('Key and name are required'); return; }
    if (!/^[a-z0-9_-]+$/.test(newKey)) { setAddError('Key must be lowercase letters, numbers, hyphens or underscores'); return; }
    try {
      const created = await addCategory(newKey, newName, newColor);
      onCategoriesChange([...categoryConfigs, created]);
      setShowAdd(false);
      setNewKey(''); setNewName(''); setNewColor('#3b82f6');
    } catch (err: unknown) {
      const e = err as { code?: string };
      setAddError(e.code === 'ALREADY_EXISTS' ? 'Key already exists' : 'Failed to add category');
    }
  };

  return (
    <div>
      <div style={{ background: '#fff', borderRadius: '0.75rem', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: '1rem' }}>
        {categoryConfigs.map((cfg, idx) => (
          <div key={cfg.category} style={{
            borderBottom: idx < categoryConfigs.length - 1 ? '1px solid #f0f0f0' : 'none',
          }}>
            {editing === cfg.category ? (
              <div style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Display name"
                  style={{ padding: '0.5rem', borderRadius: '0.375rem', border: '1.5px solid #e0e0e0', fontSize: '0.9rem' }}
                />
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="color"
                    value={editColor}
                    onChange={(e) => setEditColor(e.target.value)}
                    style={{ width: '2.5rem', height: '2rem', padding: '0', border: 'none', cursor: 'pointer', borderRadius: '0.25rem' }}
                  />
                  <input
                    value={editColor}
                    onChange={(e) => setEditColor(e.target.value)}
                    placeholder="#rrggbb"
                    style={{ flex: 1, padding: '0.5rem', borderRadius: '0.375rem', border: '1.5px solid #e0e0e0', fontSize: '0.9rem', fontFamily: 'monospace' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={() => setEditing(null)} style={btnStyle('ghost')}>Cancel</button>
                  <button onClick={() => void saveEdit()} disabled={saving} style={btnStyle('primary')}>Save</button>
                </div>
              </div>
            ) : (
              <div style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{
                  width: '1rem', height: '1rem', borderRadius: '50%',
                  background: cfg.color ?? '#6b7280', flexShrink: 0,
                }} />
                <span style={{ flex: 1, fontSize: '0.95rem', color: '#1a1a1a', fontWeight: 500 }}>
                  {cfg.displayName ?? cfg.category}
                </span>
                <span style={{ fontSize: '0.75rem', color: '#999', fontFamily: 'monospace' }}>{cfg.category}</span>
                <button onClick={() => startEdit(cfg)} style={btnStyle('ghost-sm')}>Rename</button>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <button
                    onClick={() => void handleMove(cfg.category, 'up')}
                    disabled={idx === 0}
                    style={{ ...btnStyle('ghost-sm'), opacity: idx === 0 ? 0.3 : 1, padding: '0.1rem 0.4rem', fontSize: '0.65rem' }}
                  >▲</button>
                  <button
                    onClick={() => void handleMove(cfg.category, 'down')}
                    disabled={idx === categoryConfigs.length - 1}
                    style={{ ...btnStyle('ghost-sm'), opacity: idx === categoryConfigs.length - 1 ? 0.3 : 1, padding: '0.1rem 0.4rem', fontSize: '0.65rem' }}
                  >▼</button>
                </div>
                {!cfg.isBuiltIn && (
                  <button onClick={() => void handleDelete(cfg.category)} style={btnStyle('danger-sm')}>✕</button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {showAdd ? (
        <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', fontWeight: 700 }}>Add category</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value.toLowerCase())}
              placeholder="Key (e.g. costco)"
              style={{ padding: '0.5rem', borderRadius: '0.375rem', border: '1.5px solid #e0e0e0', fontSize: '0.9rem', fontFamily: 'monospace' }}
            />
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Display name (e.g. Costco)"
              style={{ padding: '0.5rem', borderRadius: '0.375rem', border: '1.5px solid #e0e0e0', fontSize: '0.9rem' }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                style={{ width: '2.5rem', height: '2rem', padding: '0', border: 'none', cursor: 'pointer', borderRadius: '0.25rem' }}
              />
              <input
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                placeholder="#rrggbb"
                style={{ flex: 1, padding: '0.5rem', borderRadius: '0.375rem', border: '1.5px solid #e0e0e0', fontSize: '0.9rem', fontFamily: 'monospace' }}
              />
            </div>
            {addError && <p style={{ color: '#dc2626', fontSize: '0.8rem', margin: 0 }}>{addError}</p>}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => { setShowAdd(false); setAddError(''); }} style={btnStyle('ghost')}>Cancel</button>
              <button onClick={() => void handleAdd()} style={btnStyle('primary')}>Add</button>
            </div>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)} style={{ ...btnStyle('primary'), width: '100%' }}>
          + Add category
        </button>
      )}
    </div>
  );
}

// ── Gift Cards Tab ────────────────────────────────────────────────────────────

function GiftCardsTab({ categoryConfigs }: { categoryConfigs: CategoryConfig[] }) {
  const [cards, setCards] = useState<GiftCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingId, setCheckingId] = useState<number | null>(null);
  const [balanceResult, setBalanceResult] = useState<{ id: number; message: string; ok: boolean } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', categoryKey: '', cardNumber: '', pin: '', balanceCheckUrl: '' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getGiftCards().then(setCards).finally(() => setLoading(false));
  }, []);

  const startAdd = () => {
    setForm({ name: '', categoryKey: categoryConfigs[0]?.category ?? '', cardNumber: '', pin: '', balanceCheckUrl: '' });
    setEditingId(null);
    setFormError('');
    setShowForm(true);
  };

  const startEdit = (card: GiftCard) => {
    // cardNumber and pin are not returned by the list endpoint; user re-enters them to change
    setForm({ name: card.name, categoryKey: card.categoryKey, cardNumber: '', pin: '', balanceCheckUrl: card.balanceCheckUrl });
    setEditingId(card.id);
    setFormError('');
    setShowForm(true);
  };

  const handleSave = async () => {
    setFormError('');
    if (!form.name || !form.balanceCheckUrl) {
      setFormError('Name and balance check URL are required');
      return;
    }
    // On create, credentials are required; on edit, they're optional (keep existing if blank)
    if (editingId == null && (!form.cardNumber || !form.pin)) {
      setFormError('Card number and PIN are required');
      return;
    }
    setSaving(true);
    try {
      if (editingId != null) {
        // Only send credentials if the user filled them in (change); otherwise keep existing
        const patch: Parameters<typeof updateGiftCard>[1] = {
          name: form.name,
          categoryKey: form.categoryKey,
          balanceCheckUrl: form.balanceCheckUrl,
        };
        if (form.cardNumber) patch.cardNumber = form.cardNumber;
        if (form.pin) patch.pin = form.pin;
        const updated = await updateGiftCard(editingId, patch);
        setCards((prev) => prev.map((c) => c.id === editingId ? updated : c));
      } else {
        const created = await createGiftCard(form as Parameters<typeof createGiftCard>[0]);
        setCards((prev) => [...prev, created]);
      }
      setShowForm(false);
    } catch {
      setFormError('Failed to save gift card');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this gift card?')) return;
    try {
      await deleteGiftCard(id);
      setCards((prev) => prev.filter((c) => c.id !== id));
    } catch {
      alert('Failed to delete gift card');
    }
  };

  const handleCheckBalance = async (id: number) => {
    setCheckingId(id);
    setBalanceResult(null);
    try {
      const { balance } = await getGiftCardBalance(id);
      setCards((prev) => prev.map((c) => c.id === id ? { ...c, lastBalance: balance, lastCheckedAt: new Date().toISOString() } : c));
      setBalanceResult({ id, message: `Balance: ${balance} ✓`, ok: true });
      setTimeout(() => setBalanceResult(null), 5000);
    } catch (err: unknown) {
      const e = err as { error?: string };
      setBalanceResult({ id, message: e.error ?? 'Could not retrieve balance — check manually', ok: false });
      setTimeout(() => setBalanceResult(null), 5000);
    } finally {
      setCheckingId(null);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>Loading…</div>;

  return (
    <div>
      {cards.length === 0 && !showForm && (
        <div style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>No gift cards saved</div>
      )}

      {cards.map((card) => {
        const catCfg = categoryConfigs.find((c) => c.category === card.categoryKey);
        const catColor = catCfg?.color ?? '#6b7280';
        const catLabel = catCfg?.displayName ?? card.categoryKey;
        const maskedNumber = card.cardNumber && card.cardNumber.length > 4
          ? `•••• ${card.cardNumber.slice(-4)}`
          : (card.cardNumber ?? '••••');

        return (
          <div key={card.id} style={{
            background: '#fff', borderRadius: '0.75rem', padding: '1rem',
            marginBottom: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            borderLeft: `4px solid ${catColor}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <span style={{ flex: 1, fontWeight: 700, fontSize: '1rem' }}>💳 {card.name}</span>
              {card.lastBalance && (
                <span style={{
                  background: '#dcfce7', color: '#16a34a', borderRadius: '999px',
                  padding: '0.2rem 0.6rem', fontSize: '0.85rem', fontWeight: 700,
                }}>
                  {card.lastBalance}
                </span>
              )}
            </div>
            <p style={{ margin: '0 0 0.25rem', fontSize: '0.8rem', color: '#666' }}>
              Category: <span style={{ color: catColor, fontWeight: 600 }}>{catLabel}</span>
            </p>
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', color: '#666', fontFamily: 'monospace' }}>
              {maskedNumber}
            </p>
            {card.lastCheckedAt && (
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', color: '#999' }}>
                Last checked: {new Date(card.lastCheckedAt).toLocaleString()}
              </p>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                onClick={() => void handleCheckBalance(card.id)}
                disabled={checkingId === card.id}
                style={btnStyle('primary')}
              >
                {checkingId === card.id ? 'Checking…' : 'Check Balance'}
              </button>
              <button onClick={() => startEdit(card)} style={btnStyle('ghost')}>Edit</button>
              <button onClick={() => void handleDelete(card.id)} style={btnStyle('danger')}>Delete</button>
            </div>
            {balanceResult?.id === card.id && (
              <p style={{
                margin: '0.5rem 0 0', fontSize: '0.85rem', fontWeight: 600,
                color: balanceResult.ok ? '#16a34a' : '#dc2626',
              }}>
                {balanceResult.message}
              </p>
            )}
          </div>
        );
      })}

      {showForm ? (
        <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', fontWeight: 700 }}>
            {editingId != null ? 'Edit gift card' : 'Add gift card'}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name (e.g. Sainsbury's)" style={inputStyle()} />
            <select value={form.categoryKey} onChange={(e) => setForm({ ...form, categoryKey: e.target.value })} style={{ ...inputStyle(), cursor: 'pointer' }}>
              {categoryConfigs.map((c) => (
                <option key={c.category} value={c.category}>{c.displayName ?? c.category}</option>
              ))}
            </select>
            <input value={form.cardNumber} onChange={(e) => setForm({ ...form, cardNumber: e.target.value })} placeholder={editingId != null ? 'Card number (leave blank to keep existing)' : 'Card number'} autoComplete="off" data-1p-ignore="true" data-lpignore="true" data-bwignore="true" style={inputStyle()} />
            <input value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} placeholder={editingId != null ? 'PIN (leave blank to keep existing)' : 'PIN'} autoComplete="off" data-1p-ignore="true" data-lpignore="true" data-bwignore="true" style={inputStyle()} />
            <input value={form.balanceCheckUrl} onChange={(e) => setForm({ ...form, balanceCheckUrl: e.target.value })} placeholder="Balance check URL" style={inputStyle()} />
            {formError && <p style={{ color: '#dc2626', fontSize: '0.8rem', margin: 0 }}>{formError}</p>}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => setShowForm(false)} style={btnStyle('ghost')}>Cancel</button>
              <button onClick={() => void handleSave()} disabled={saving} style={btnStyle('primary')}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button onClick={startAdd} style={{ ...btnStyle('primary'), width: '100%' }}>
          + Add gift card
        </button>
      )}
    </div>
  );
}

// ── Alexa Tab ─────────────────────────────────────────────────────────────────

function AlexaTab() {
  const [status, setStatus] = useState<AlexaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reauthing, setReauthing] = useState(false);
  const [proxyUrl, setProxyUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    getAlexaStatus()
      .then(setStatus)
      .catch(() => setMessage({ text: 'Could not reach Alexa service', ok: false }))
      .finally(() => setLoading(false));
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    setMessage(null);
    try {
      const res = await alexaAuthRefresh();
      setMessage({ text: res.success ? 'Token refreshed' : (res.error ?? 'Refresh failed'), ok: res.success });
      if (res.success) {
        const updated = await getAlexaStatus().catch(() => null);
        if (updated) setStatus(updated);
      }
    } finally {
      setRefreshing(false);
    }
  };

  const handleReauth = async () => {
    setReauthing(true);
    setMessage(null);
    try {
      const res = await alexaAuthStart();
      if (res.proxyUrl) setProxyUrl(res.proxyUrl);
      setMessage({ text: 'Re-auth proxy started — open the URL below in your browser', ok: true });
    } finally {
      setReauthing(false);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>Loading…</div>;

  const connected = status && !status.sessionExpired && status.sessionAgeDays != null;

  return (
    <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
      <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700 }}>Alexa connection</h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
        <Row label="Status">
          <span style={{ fontWeight: 600, color: connected ? '#16a34a' : '#dc2626' }}>
            {connected ? '🟢 Connected' : '🔴 Disconnected'}
          </span>
        </Row>
        {status?.sessionAgeDays != null && (
          <Row label="Session age">
            {status.sessionAgeDays === 0 ? 'Less than 1 day' : `${status.sessionAgeDays} day${status.sessionAgeDays !== 1 ? 's' : ''}`}
          </Row>
        )}
        {status?.lastError && (
          <Row label="Last error">
            <span style={{ color: '#dc2626', fontSize: '0.85rem' }}>{status.lastError}</span>
          </Row>
        )}
        {status?.proxyInProgress && (
          <Row label="Proxy">
            <span style={{ color: '#f59e0b' }}>Re-auth in progress</span>
          </Row>
        )}
      </div>

      {message && (
        <div style={{
          padding: '0.75rem', borderRadius: '0.5rem', marginBottom: '1rem',
          background: message.ok ? '#dcfce7' : '#fee2e2',
          color: message.ok ? '#15803d' : '#b91c1c', fontSize: '0.9rem',
        }}>
          {message.text}
        </div>
      )}

      {proxyUrl && (
        <div style={{
          padding: '0.75rem', borderRadius: '0.5rem', marginBottom: '1rem',
          background: '#fef9c3', fontSize: '0.85rem',
        }}>
          <p style={{ margin: '0 0 0.5rem', fontWeight: 600 }}>Open this URL in your browser on the home network:</p>
          <code style={{ wordBreak: 'break-all', color: '#1d4ed8' }}>{proxyUrl}</code>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button onClick={() => void handleRefresh()} disabled={refreshing} style={btnStyle('primary')}>
          {refreshing ? 'Refreshing…' : 'Refresh Token'}
        </button>
        <button onClick={() => void handleReauth()} disabled={reauthing} style={btnStyle('ghost')}>
          {reauthing ? 'Starting…' : 'Full Re-auth'}
        </button>
      </div>

      <p style={{ margin: '1rem 0 0', fontSize: '0.8rem', color: '#999', lineHeight: 1.5 }}>
        Full re-auth opens a login proxy on your home network. You'll be given a URL to open in your browser to sign in to Amazon.
      </p>
    </div>
  );
}

// ── Shopping Tab ──────────────────────────────────────────────────────────────

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function ShoppingTab() {
  const [settings, setSettings] = useState<ShopSettingsWithMealPlanner | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [mealPlanStartDay, setMealPlanStartDay] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  const [sortMode, setSortMode] = useState<SupermarketSortMode>('az');
  const [aisleOrder, setAisleOrder] = useState<AisleOrder>(DEFAULT_AISLE_ORDER);
  const [aisleDirty, setAisleDirty] = useState(false);
  const [savingAisle, setSavingAisle] = useState(false);
  const [aisleSaved, setAisleSaved] = useState(false);

  useEffect(() => {
    getSettings()
      .then((s) => {
        setSettings(s);
        setSelected(s.shopDay);
        setSortMode(s.supermarketSortMode);
        setAisleOrder(s.supermarketAisleOrder);
        setMealPlanStartDay(s.mealPlanStartDay);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const updated = await updateSettings({ shopDay: selected });
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleSortModeChange = (mode: SupermarketSortMode) => {
    const prev = sortMode;
    setSortMode(mode);
    updateSettings({ supermarketSortMode: mode }).catch(() => {
      setSortMode(prev); // revert on failure
    });
  };

  const handleMoveAisle = (idx: number, dir: 'up' | 'down') => {
    const next = [...aisleOrder];
    const swap = dir === 'up' ? idx - 1 : idx + 1;
    [next[idx], next[swap]] = [next[swap]!, next[idx]!];
    setAisleOrder(next);
    setAisleDirty(true);
  };

  const handleSaveAisle = async () => {
    setSavingAisle(true);
    try {
      await updateSettings({ supermarketAisleOrder: aisleOrder });
      setAisleDirty(false);
      setAisleSaved(true);
      setTimeout(() => setAisleSaved(false), 3000);
    } finally {
      setSavingAisle(false);
    }
  };

  const handleResetAisle = () => {
    setAisleOrder(DEFAULT_AISLE_ORDER);
    setAisleDirty(true);
  };

  if (loading) return <div style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>Loading…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Weekly shop day */}
      <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem', fontWeight: 700 }}>Weekly shop day</h3>
        <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: '#666' }}>
          Set the day you do your weekly food shop. The day before and on the day, AI suggestions will appear at the top of your list.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
          {DAY_NAMES.map((name, day) => (
            <button
              key={day}
              onClick={() => setSelected(selected === day ? null : day)}
              style={{
                padding: '0.5rem 0.875rem', borderRadius: '999px',
                border: `2px solid ${selected === day ? '#2563eb' : '#e0e0e0'}`,
                background: selected === day ? '#eff6ff' : '#fff',
                color: selected === day ? '#2563eb' : '#374151',
                fontWeight: selected === day ? 700 : 400,
                cursor: 'pointer', fontSize: '0.875rem', transition: 'all 0.15s',
              }}
            >
              {name}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            onClick={() => void handleSave()}
            disabled={saving || selected === settings?.shopDay}
            style={btnStyle('primary')}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          {saved && <span style={{ color: '#16a34a', fontSize: '0.85rem', fontWeight: 600 }}>Saved ✓</span>}
          {selected !== null && (
            <span style={{ fontSize: '0.85rem', color: '#666' }}>
              AI suggestions will show on {DAY_NAMES[(selected + 6) % 7]} and {DAY_NAMES[selected]}
            </span>
          )}
        </div>
      </div>

      {/* Meal planning week start */}
      <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem', fontWeight: 700 }}>Planning week starts on</h3>
        <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: '#666' }}>
          The first day shown in the Meals planner. Defaults to your shop day if not set.
        </p>
        <select
          value={mealPlanStartDay ?? ''}
          onChange={(e) => {
            const val = e.target.value === '' ? null : Number(e.target.value);
            const prev = mealPlanStartDay;
            setMealPlanStartDay(val);
            updateSettings({ mealPlanStartDay: val }).catch(() => setMealPlanStartDay(prev));
          }}
          style={{
            padding: '0.5rem 0.75rem', borderRadius: '0.5rem',
            border: '1.5px solid #e0e0e0', fontSize: '0.9rem',
            background: '#fff', color: '#1a1a1a', cursor: 'pointer',
            minWidth: '160px',
          }}
        >
          <option value="">Same as shop day</option>
          {DAY_NAMES.map((name, day) => (
            <option key={day} value={day}>{name}</option>
          ))}
        </select>
      </div>

      {/* Supermarket sort order */}
      <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem', fontWeight: 700 }}>Supermarket sort order</h3>
        <p style={{ margin: '0 0 0.875rem', fontSize: '0.85rem', color: '#666' }}>
          How items in the Supermarket section are ordered on your list.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: sortMode === 'sainsburys_aisles' ? '1.25rem' : '0' }}>
          {(['az', 'sainsburys_aisles'] as SupermarketSortMode[]).map((mode) => (
            <label key={mode} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer' }}>
              <input
                type="radio"
                name="supermarketSortMode"
                value={mode}
                checked={sortMode === mode}
                onChange={() => handleSortModeChange(mode)}
                style={{ accentColor: '#2563eb', width: '1rem', height: '1rem' }}
              />
              <span style={{ fontSize: '0.9rem', color: '#1a1a1a' }}>
                {mode === 'az' ? 'A–Z (alphabetical)' : "Sainsbury's aisle order"}
              </span>
            </label>
          ))}
        </div>

        {/* Aisle group editor — visible only when Sainsbury's aisles mode is active */}
        {sortMode === 'sainsburys_aisles' && (
          <>
            <p style={{ margin: '0 0 0.625rem', fontSize: '0.8rem', color: '#888' }}>
              Reorder aisle groups to match the current shop layout. Items are matched by name against each group's terms.
            </p>

            <div style={{ background: '#f9f9f9', borderRadius: '0.5rem', overflow: 'hidden', border: '1px solid #ebebeb', marginBottom: '0.875rem' }}>
              {aisleOrder.map((group, idx) => (
                <div
                  key={group.id}
                  style={{
                    borderBottom: idx < aisleOrder.length - 1 ? '1px solid #ebebeb' : 'none',
                    padding: '0.5rem 0.75rem',
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    background: '#fff',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1a1a1a' }}>{group.name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {group.terms.slice(0, 5).join(', ')}{group.terms.length > 5 ? '…' : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', flexShrink: 0 }}>
                    <button
                      onClick={() => handleMoveAisle(idx, 'up')}
                      disabled={idx === 0}
                      style={{ ...btnStyle('ghost-sm'), opacity: idx === 0 ? 0.3 : 1, lineHeight: 1, padding: '0.15rem 0.4rem' }}
                    >▲</button>
                    <button
                      onClick={() => handleMoveAisle(idx, 'down')}
                      disabled={idx === aisleOrder.length - 1}
                      style={{ ...btnStyle('ghost-sm'), opacity: idx === aisleOrder.length - 1 ? 0.3 : 1, lineHeight: 1, padding: '0.15rem 0.4rem' }}
                    >▼</button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <button
                onClick={() => void handleSaveAisle()}
                disabled={savingAisle || !aisleDirty}
                style={btnStyle('primary')}
              >
                {savingAisle ? 'Saving…' : 'Save aisle order'}
              </button>
              <button onClick={handleResetAisle} style={btnStyle('ghost')}>
                Reset to default
              </button>
              {aisleSaved && <span style={{ color: '#16a34a', fontSize: '0.85rem', fontWeight: 600 }}>Saved ✓</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
      <span style={{ minWidth: '7rem', fontSize: '0.85rem', color: '#999', paddingTop: '0.1rem' }}>{label}</span>
      <span style={{ fontSize: '0.9rem', color: '#1a1a1a' }}>{children}</span>
    </div>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    padding: '0.5rem', borderRadius: '0.375rem',
    border: '1.5px solid #e0e0e0', fontSize: '0.9rem',
    width: '100%', boxSizing: 'border-box',
  };
}

function btnStyle(variant: 'primary' | 'ghost' | 'ghost-sm' | 'danger' | 'danger-sm'): React.CSSProperties {
  const base: React.CSSProperties = {
    border: 'none', borderRadius: '0.375rem', cursor: 'pointer',
    fontWeight: 600, transition: 'all 0.15s', fontSize: '0.875rem',
    padding: '0.5rem 0.875rem',
  };
  if (variant === 'primary') return { ...base, background: '#2563eb', color: '#fff' };
  if (variant === 'ghost') return { ...base, background: '#f3f4f6', color: '#374151' };
  if (variant === 'ghost-sm') return { ...base, background: '#f3f4f6', color: '#374151', padding: '0.25rem 0.5rem', fontSize: '0.8rem' };
  if (variant === 'danger') return { ...base, background: '#fee2e2', color: '#dc2626' };
  return { ...base, background: '#fee2e2', color: '#dc2626', padding: '0.25rem 0.5rem', fontSize: '0.8rem' };
}
