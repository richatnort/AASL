import type { AisleOrder } from '@shopping-list/shared';

type Props = {
  itemName: string;
  aisleOrder: AisleOrder;
  onSelect: (aisleId: string) => void;
  onDismiss: () => void;
};

export function AislePicker({ itemName, aisleOrder, onSelect, onDismiss }: Props) {
  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onDismiss}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          zIndex: 200, animation: 'fadeIn 0.15s ease',
        }}
      />

      {/* Bottom sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: '#fff', borderRadius: '1rem 1rem 0 0',
        padding: '1.5rem 1rem 2rem', zIndex: 201,
        animation: 'slideUp 0.2s ease',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
        maxHeight: '80dvh', overflowY: 'auto',
      }}>
        {/* Handle */}
        <div style={{
          width: '2.5rem', height: '0.25rem', background: '#e0e0e0',
          borderRadius: '999px', margin: '0 auto 1.25rem',
        }} />

        <p style={{ margin: '0 0 1.25rem', fontSize: '0.95rem', color: '#555', textAlign: 'center' }}>
          Which aisle is <strong style={{ color: '#1a1a1a' }}>{itemName}</strong> in?
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {aisleOrder.map((group) => (
            <button
              key={group.id}
              onClick={() => onSelect(group.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '1rem',
                padding: '0.875rem 1rem', borderRadius: '0.75rem',
                border: '2px solid #f0f0f0', background: '#fafafa',
                cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#eff6ff';
                e.currentTarget.style.borderColor = '#2563eb';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#fafafa';
                e.currentTarget.style.borderColor = '#f0f0f0';
              }}
            >
              <span style={{ fontWeight: 600, color: '#1a1a1a', fontSize: '0.95rem', flex: 1 }}>
                {group.name}
              </span>
              <span style={{ fontSize: '0.75rem', color: '#999', flexShrink: 0 }}>
                {group.terms.slice(0, 3).join(', ')}{group.terms.length > 3 ? '…' : ''}
              </span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
