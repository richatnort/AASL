import { useRef, useState } from 'react';

type Props = {
  onAdd: (name: string) => Promise<string | null>;
  onRecipeUrl?: (url: string) => void;
};

function isUrl(s: string): boolean {
  try {
    const p = new URL(s);
    return p.protocol === 'https:' || p.protocol === 'http:';
  } catch { return false; }
}

export function AddItemForm({ onAdd, onRecipeUrl }: Props) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = value.trim();
    if (!name) return;
    if (onRecipeUrl && isUrl(name)) {
      setValue('');
      onRecipeUrl(name);
      return;
    }
    setBusy(true);
    setError(null);
    const err = await onAdd(name);
    setBusy(false);
    if (err) {
      setError(err);
    } else {
      setValue('');
      inputRef.current?.focus();
    }
  };

  return (
    <form onSubmit={submit} style={{ padding: '1rem', background: '#fff', borderRadius: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: '1rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(null); }}
          placeholder="Add an item…"
          disabled={busy}
          autoComplete="off"
          style={{
            flex: 1, padding: '0.75rem 1rem', borderRadius: '0.5rem',
            border: error ? '1.5px solid #ef4444' : '1.5px solid #e0e0e0',
            fontSize: '1rem', outline: 'none', transition: 'border-color 0.15s',
            background: busy ? '#f9f9f9' : '#fff',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = '#2563eb'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = error ? '#ef4444' : '#e0e0e0'; }}
        />
        <button
          type="submit"
          disabled={busy || !value.trim()}
          style={{
            padding: '0.75rem 1.25rem', borderRadius: '0.5rem',
            background: busy || !value.trim() ? '#e0e0e0' : '#2563eb',
            color: busy || !value.trim() ? '#999' : '#fff',
            border: 'none', cursor: busy || !value.trim() ? 'not-allowed' : 'pointer',
            fontWeight: 600, fontSize: '0.95rem', transition: 'all 0.15s',
            whiteSpace: 'nowrap',
          }}
        >
          {busy ? '…' : 'Add'}
        </button>
      </div>
      {error && (
        <p style={{ margin: '0.4rem 0 0', color: '#ef4444', fontSize: '0.85rem' }}>{error}</p>
      )}
    </form>
  );
}
