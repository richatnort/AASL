import type { CategoryConfig } from '@shopping-list/shared';

type Props = {
  itemName: string;
  categories: CategoryConfig[];
  onSelect: (category: string) => void;
  onDismiss: () => void;
};

export function CategoryPicker({ itemName, categories, onSelect, onDismiss }: Props) {
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
      }}>
        {/* Handle */}
        <div style={{
          width: '2.5rem', height: '0.25rem', background: '#e0e0e0',
          borderRadius: '999px', margin: '0 auto 1.25rem',
        }} />

        <p style={{ margin: '0 0 1.25rem', fontSize: '0.95rem', color: '#555', textAlign: 'center' }}>
          Where does <strong style={{ color: '#1a1a1a' }}>{itemName}</strong> go?
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {categories.map(({ category, displayName, color }) => {
            const label = displayName ?? category;
            const bg = color ?? '#6b7280';
            return (
              <button
                key={category}
                onClick={() => onSelect(category)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '1rem',
                  padding: '1rem', borderRadius: '0.75rem',
                  border: `2px solid ${bg}20`, background: `${bg}08`,
                  cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = `${bg}15`;
                  e.currentTarget.style.borderColor = bg;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = `${bg}08`;
                  e.currentTarget.style.borderColor = `${bg}20`;
                }}
              >
                <span style={{
                  width: '1.25rem', height: '1.25rem', borderRadius: '50%',
                  background: bg, flexShrink: 0,
                }} />
                <span style={{ fontWeight: 600, color: bg, fontSize: '1rem' }}>{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
