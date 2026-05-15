import type { Item } from '@shopping-list/shared';
import { useState } from 'react';

type Props = {
  item: Item;
  onUpdateQty: (id: number, qty: number, category: string) => void;
  onDelete: (id: number, category: string) => void;
  onCheck: (id: number, category: string) => void;
  onAssignAisle?: (id: number, displayName: string) => void;
  onRename?: (id: number, newName: string) => void;
};

export function ItemRow({ item, onUpdateQty, onDelete, onCheck, onAssignAisle, onRename }: Props) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const startEdit = () => {
    if (!onRename) return;
    setEditValue(item.displayName);
    setEditing(true);
  };

  const commitEdit = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== item.displayName) {
      onRename!(item.id, trimmed);
    }
    setEditing(false);
  };

  const cancelEdit = () => setEditing(false);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.75rem',
      padding: '0.75rem 1rem', background: '#fff',
      borderBottom: '1px solid #f0f0f0',
    }}>
      {/* Check-off button */}
      <button
        onClick={() => onCheck(item.id, item.category)}
        style={{
          width: '1.5rem', height: '1.5rem', borderRadius: '50%',
          border: '1.5px solid #d0d0d0', background: 'none', cursor: 'pointer',
          flexShrink: 0, fontSize: '0.7rem', color: '#d0d0d0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s', padding: 0,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = '#22c55e';
          e.currentTarget.style.color = '#22c55e';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = '#d0d0d0';
          e.currentTarget.style.color = '#d0d0d0';
        }}
        aria-label={`Check off ${item.displayName}`}
      >
        ✓
      </button>

      {/* Name — tap to edit if onRename provided */}
      {editing ? (
        <input
          autoFocus
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
            if (e.key === 'Escape') cancelEdit();
          }}
          style={{
            flex: 1, fontSize: '1rem', color: '#1a1a1a',
            border: 'none', borderBottom: '1.5px solid #2563eb',
            outline: 'none', background: 'transparent', padding: '0',
          }}
        />
      ) : (
        <span
          onClick={startEdit}
          style={{
            flex: 1, fontSize: '1rem', color: '#1a1a1a',
            cursor: onRename ? 'text' : 'default',
          }}
        >
          {item.displayName}
        </span>
      )}

      {/* Aisle unmatched badge + assign button — only shown in Sainsbury's aisles mode */}
      {item.aisleMatched === false && (
        <>
          <span
            aria-label="item has no aisle mapping"
            style={{
              background: '#fef3c7', color: '#92400e',
              borderRadius: '999px', padding: '0.1rem 0.4rem',
              fontSize: '0.7rem', fontWeight: 700, flexShrink: 0,
            }}
          >
            {'\u26A0'} no aisle
          </span>
          {onAssignAisle && (
            <button
              onClick={() => onAssignAisle(item.id, item.displayName)}
              title="Assign to an aisle"
              aria-label={`Assign ${item.displayName} to an aisle`}
              style={{
                background: 'none', border: '1.5px solid #d1d5db',
                borderRadius: '999px', cursor: 'pointer',
                fontSize: '0.75rem', padding: '0.1rem 0.4rem',
                color: '#6b7280', flexShrink: 0, transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#2563eb';
                e.currentTarget.style.color = '#2563eb';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#d1d5db';
                e.currentTarget.style.color = '#6b7280';
              }}
            >
              📍
            </button>
          )}
        </>
      )}

      {/* Qty controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <button
          onClick={() => {
            if (item.quantity > 1) onUpdateQty(item.id, item.quantity - 1, item.category);
          }}
          disabled={item.quantity <= 1}
          style={qtyBtnStyle(item.quantity <= 1)}
          aria-label="Decrease quantity"
        >
          −
        </button>
        <span style={{ minWidth: '1.5rem', textAlign: 'center', fontWeight: 600, fontSize: '0.95rem' }}>
          {item.quantity}
        </span>
        <button
          onClick={() => onUpdateQty(item.id, item.quantity + 1, item.category)}
          style={qtyBtnStyle(false)}
          aria-label="Increase quantity"
        >
          +
        </button>
      </div>

      {/* Delete */}
      <button
        onClick={() => onDelete(item.id, item.category)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#ccc', fontSize: '1.25rem', lineHeight: 1, padding: '0.25rem',
          borderRadius: '0.25rem', transition: 'color 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = '#ccc'; }}
        aria-label={`Remove ${item.displayName}`}
      >
        ×
      </button>
    </div>
  );
}

function qtyBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: '2rem', height: '2rem', borderRadius: '50%',
    border: '1.5px solid #e0e0e0', background: disabled ? '#f5f5f5' : '#fff',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '1.1rem', lineHeight: 1, color: disabled ? '#ccc' : '#333',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.15s',
  };
}
