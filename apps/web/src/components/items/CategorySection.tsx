import type { Item } from '@shopping-list/shared';
import { ItemRow } from './ItemRow.js';

type Props = {
  category: string;
  displayName?: string;
  color?: string;
  giftCardBalance?: string | null;
  items: Item[];
  collapsed: boolean;
  onToggle: () => void;
  onUpdateQty: (id: number, qty: number, category: string) => void;
  onDelete: (id: number, category: string) => void;
  onCheck: (id: number, category: string) => void;
  onAssignAisle?: (id: number, displayName: string) => void;
  onRename?: (id: number, newName: string) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
};

export function CategorySection({
  category, displayName, color, giftCardBalance,
  items, collapsed, onToggle, onUpdateQty, onDelete, onCheck, onAssignAisle, onRename, onMoveUp, onMoveDown,
}: Props) {
  const label = displayName ?? category;
  const bg = color ?? '#6b7280';

  return (
    <div style={{ marginBottom: '0.75rem', borderRadius: '0.75rem', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'stretch', background: bg }}>
        <button
          onClick={onToggle}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: '0.75rem',
            padding: '0.875rem 1rem', background: 'transparent', color: '#fff',
            border: 'none', cursor: 'pointer', textAlign: 'left',
          }}
        >
          <span style={{ flex: 1, fontWeight: 600, fontSize: '1rem', fontFamily: 'Rubik, sans-serif' }}>
            {label}
          </span>
          {giftCardBalance && (
            <span style={{
              background: 'rgba(255,255,255,0.2)', borderRadius: '999px',
              padding: '0.1rem 0.6rem', fontSize: '0.8rem', fontWeight: 600,
              border: '1px solid rgba(255,255,255,0.3)',
            }}>
              💳 {giftCardBalance}
            </span>
          )}
          <span style={{
            background: 'rgba(255,255,255,0.25)', borderRadius: '999px',
            padding: '0.1rem 0.6rem', fontSize: '0.8rem', fontWeight: 700,
          }}>
            {items.length}
          </span>
          <span style={{ fontSize: '0.75rem', opacity: 0.9, marginLeft: '0.25rem' }}>
            {collapsed ? '▼' : '▲'}
          </span>
        </button>

        {/* Move up/down buttons */}
        {(onMoveUp ?? onMoveDown) && (
          <div style={{
            display: 'flex', flexDirection: 'column',
            borderLeft: '1px solid rgba(255,255,255,0.2)',
          }}>
            <button
              onClick={onMoveUp}
              disabled={!onMoveUp}
              title="Move up"
              style={{
                flex: 1, width: '2.25rem', background: 'transparent', color: '#fff',
                border: 'none', cursor: onMoveUp ? 'pointer' : 'default',
                opacity: onMoveUp ? 1 : 0.3, fontSize: '0.7rem', lineHeight: 1,
              }}
            >
              ▲
            </button>
            <button
              onClick={onMoveDown}
              disabled={!onMoveDown}
              title="Move down"
              style={{
                flex: 1, width: '2.25rem', background: 'transparent', color: '#fff',
                border: 'none', cursor: onMoveDown ? 'pointer' : 'default',
                opacity: onMoveDown ? 1 : 0.3, fontSize: '0.7rem', lineHeight: 1,
              }}
            >
              ▼
            </button>
          </div>
        )}
      </div>

      {/* Items */}
      {!collapsed && (
        <div>
          {items.length === 0 ? (
            <div style={{ padding: '1rem', color: '#999', fontSize: '0.9rem', background: '#fff', textAlign: 'center' }}>
              Nothing here yet
            </div>
          ) : (
            items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                onUpdateQty={onUpdateQty}
                onDelete={onDelete}
                onCheck={onCheck}
                onAssignAisle={onAssignAisle}
                onRename={onRename}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
