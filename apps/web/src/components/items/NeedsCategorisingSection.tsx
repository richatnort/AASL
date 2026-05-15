import type { CategoryConfig, Item } from '@shopping-list/shared';
import { useState } from 'react';

type Props = {
  items: Item[];
  categoryConfigs: CategoryConfig[];
  onCategorise: (item: Item, category: string) => Promise<void>;
  onDelete: (id: number, category: string) => void;
};

export function NeedsCategorisingSection({ items, categoryConfigs, onCategorise, onDelete }: Props) {
  if (items.length === 0) return null;

  return (
    <div style={{ marginBottom: '0.75rem' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        background: '#f59e0b', borderRadius: '0.625rem 0.625rem 0 0',
        padding: '0.625rem 0.875rem',
      }}>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem', flex: 1 }}>
          Needs Categorising
        </span>
        <span style={{
          background: 'rgba(255,255,255,0.25)', color: '#fff',
          borderRadius: '999px', padding: '0.1rem 0.5rem',
          fontSize: '0.75rem', fontWeight: 700,
        }}>
          {items.length}
        </span>
      </div>

      {/* Items */}
      <div style={{
        background: '#fff', borderRadius: '0 0 0.625rem 0.625rem',
        boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
        overflow: 'hidden',
      }}>
        {items.map((item, idx) => (
          <NeedsCategorisingRow
            key={item.id}
            item={item}
            categoryConfigs={categoryConfigs}
            isLast={idx === items.length - 1}
            onSave={(category) => onCategorise(item, category)}
            onDelete={() => onDelete(item.id, 'needs_categorising')}
          />
        ))}
      </div>
    </div>
  );
}

function NeedsCategorisingRow({
  item,
  categoryConfigs,
  isLast,
  onSave,
  onDelete,
}: {
  item: Item;
  categoryConfigs: CategoryConfig[];
  isLast: boolean;
  onSave: (category: string) => Promise<void>;
  onDelete: () => void;
}) {
  const selectable = categoryConfigs.filter((c) => c.category !== 'needs_categorising');
  const [selected, setSelected] = useState(selectable[0]?.category ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await onSave(selected);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.625rem',
      padding: '0.625rem 0.875rem',
      borderBottom: isLast ? 'none' : '1px solid #f0f0f0',
    }}>
      {/* Item name */}
      <span style={{ flex: 1, fontSize: '0.95rem', color: '#1a1a1a' }}>
        {item.displayName}
        {item.quantity > 1 && (
          <span style={{ marginLeft: '0.35rem', color: '#999', fontSize: '0.85rem' }}>×{item.quantity}</span>
        )}
      </span>

      {/* Category dropdown */}
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        disabled={saving}
        style={{
          padding: '0.35rem 0.5rem', borderRadius: '0.375rem',
          border: '1.5px solid #e0e0e0', fontSize: '0.85rem',
          background: '#fff', cursor: 'pointer', maxWidth: '8rem',
        }}
      >
        {selectable.map((c) => (
          <option key={c.category} value={c.category}>
            {c.displayName ?? c.category}
          </option>
        ))}
      </select>

      {/* Save button */}
      <button
        onClick={() => void handleSave()}
        disabled={saving || !selected}
        style={{
          padding: '0.35rem 0.75rem', borderRadius: '0.375rem',
          background: '#2563eb', color: '#fff', border: 'none',
          cursor: saving ? 'not-allowed' : 'pointer',
          fontSize: '0.85rem', fontWeight: 600, opacity: saving ? 0.6 : 1,
          whiteSpace: 'nowrap',
        }}
      >
        {saving ? '…' : 'Save'}
      </button>

      {/* Delete */}
      <button
        onClick={onDelete}
        title="Remove"
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#dc2626', fontSize: '1rem', opacity: 0.7,
          padding: '0.25rem', lineHeight: 1,
        }}
      >
        ✕
      </button>
    </div>
  );
}
