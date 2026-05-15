import { useEffect, useState } from 'react';
import { parseRecipe } from '../../lib/api.js';

type Props = {
  initialUrl?: string;
  manualIngredients?: string[];  // pre-loaded ingredients — skips URL fetch
  manualTitle?: string;
  onAddItem: (name: string) => Promise<string | null>;
  onClose: () => void;
};

export function RecipeModal({ initialUrl, manualIngredients, manualTitle, onAddItem, onClose }: Props) {
  const isManual = manualIngredients !== undefined && manualIngredients.length > 0;

  const [url, setUrl] = useState('');
  const [fetching, setFetching] = useState(false);
  const [ingredients, setIngredients] = useState<string[]>(isManual ? manualIngredients : []);
  const [title, setTitle] = useState<string | undefined>(isManual ? manualTitle : undefined);
  const [added, setAdded] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [addingAll, setAddingAll] = useState(false);

  // Auto-fetch when opened via URL (not used in manual mode)
  useEffect(() => {
    if (isManual || !initialUrl) return;
    setUrl(initialUrl);
    setFetching(true);
    setError(null);
    setIngredients([]);
    setAdded(new Set());
    setTitle(undefined);
    parseRecipe(initialUrl)
      .then((result) => { setIngredients(result.ingredients); setTitle(result.title); })
      .catch((err: unknown) => { const e = err as { error?: string }; setError(e.error ?? 'Could not parse this recipe page'); })
      .finally(() => setFetching(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUrl]);

  const handleFetch = async () => {
    if (!url.trim()) return;
    setFetching(true);
    setError(null);
    setIngredients([]);
    setAdded(new Set());
    setTitle(undefined);
    try {
      const result = await parseRecipe(url.trim());
      setIngredients(result.ingredients);
      setTitle(result.title);
    } catch (err: unknown) {
      const e = err as { error?: string };
      setError(e.error ?? 'Could not parse this recipe page');
    } finally {
      setFetching(false);
    }
  };

  const handleAdd = async (idx: number) => {
    const name = ingredients[idx];
    if (!name || added.has(idx)) return;
    await onAddItem(name);
    setAdded((prev) => new Set(prev).add(idx));
  };

  const handleAddAll = async () => {
    setAddingAll(true);
    for (let i = 0; i < ingredients.length; i++) {
      if (!added.has(i)) {
        await handleAdd(i);
        await new Promise((r) => setTimeout(r, 100)); // slight delay to avoid hammering
      }
    }
    setAddingAll(false);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          zIndex: 200, animation: 'fadeIn 0.15s ease',
        }}
      />

      {/* Modal */}
      <div style={{
        position: 'fixed', left: '50%', top: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(calc(100vw - 2rem), 520px)',
        maxHeight: '80dvh',
        background: '#fff', borderRadius: '1rem',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        zIndex: 201, display: 'flex', flexDirection: 'column',
        animation: 'slideUp 0.2s ease',
        fontFamily: 'Nunito Sans, sans-serif',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          padding: '1rem 1.25rem', borderBottom: '1px solid #f0f0f0',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: '1.25rem' }}>📋</span>
          <h2 style={{ flex: 1, margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#1a1a1a', fontFamily: 'Rubik, sans-serif' }}>
            {isManual ? 'Meal Ingredients' : 'Import Recipe'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: '1.25rem', lineHeight: 1, padding: '0.25rem' }}>
            ✕
          </button>
        </div>

        {/* URL input — hidden in manual mode */}
        {!isManual && <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleFetch(); }}
              placeholder="https://www.bbcgoodfood.com/recipes/..."
              disabled={fetching}
              style={{
                flex: 1, padding: '0.625rem 0.875rem',
                border: '1.5px solid #e0e0e0', borderRadius: '0.5rem',
                fontSize: '0.9rem', outline: 'none',
                opacity: fetching ? 0.6 : 1,
              }}
            />
            <button
              onClick={() => void handleFetch()}
              disabled={fetching || !url.trim()}
              style={{
                padding: '0.625rem 1rem', borderRadius: '0.5rem',
                background: '#2563eb', color: '#fff', border: 'none',
                cursor: fetching || !url.trim() ? 'not-allowed' : 'pointer',
                fontWeight: 700, fontSize: '0.875rem',
                opacity: fetching || !url.trim() ? 0.6 : 1, whiteSpace: 'nowrap',
              }}
            >
              {fetching ? 'Fetching…' : 'Fetch'}
            </button>
          </div>
          {error && (
            <p style={{ margin: '0.5rem 0 0', color: '#dc2626', fontSize: '0.85rem' }}>{error}</p>
          )}
        </div>}

        {/* Ingredient list */}
        {ingredients.length > 0 && (
          <>
            <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
              {title && <p style={{ margin: '0 0 0.5rem', fontWeight: 700, fontSize: '0.95rem', color: '#1a1a1a' }}>{title}</p>}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: '#666' }}>
                  {added.size} of {ingredients.length} added
                </span>
                <button
                  onClick={() => void handleAddAll()}
                  disabled={addingAll || added.size === ingredients.length}
                  style={{
                    padding: '0.35rem 0.875rem', borderRadius: '999px',
                    background: '#2563eb', color: '#fff', border: 'none',
                    cursor: addingAll || added.size === ingredients.length ? 'not-allowed' : 'pointer',
                    fontWeight: 600, fontSize: '0.8rem',
                    opacity: addingAll || added.size === ingredients.length ? 0.5 : 1,
                  }}
                >
                  {addingAll ? 'Adding…' : 'Add All'}
                </button>
              </div>
            </div>

            <div style={{ overflowY: 'auto', flex: 1 }}>
              {ingredients.map((ing, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.625rem 1.25rem',
                    borderBottom: idx < ingredients.length - 1 ? '1px solid #f9f9f9' : 'none',
                    background: added.has(idx) ? '#f0fdf4' : '#fff',
                    transition: 'background 0.2s',
                  }}
                >
                  <span style={{
                    flex: 1, fontSize: '0.9rem',
                    color: added.has(idx) ? '#15803d' : '#1a1a1a',
                    textDecoration: added.has(idx) ? 'line-through' : 'none',
                    opacity: added.has(idx) ? 0.7 : 1,
                  }}>
                    {ing}
                  </span>
                  <button
                    onClick={() => void handleAdd(idx)}
                    disabled={added.has(idx)}
                    style={{
                      padding: '0.3rem 0.75rem', borderRadius: '999px',
                      border: `1.5px solid ${added.has(idx) ? '#86efac' : '#2563eb'}`,
                      background: added.has(idx) ? '#dcfce7' : '#fff',
                      color: added.has(idx) ? '#15803d' : '#2563eb',
                      cursor: added.has(idx) ? 'default' : 'pointer',
                      fontWeight: 600, fontSize: '0.8rem', transition: 'all 0.15s',
                      flexShrink: 0,
                    }}
                  >
                    {added.has(idx) ? '✓ Added' : '+ Add'}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {ingredients.length === 0 && !fetching && !error && !isManual && (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#999', fontSize: '0.9rem' }}>
            Paste a recipe URL above to extract the ingredients
          </div>
        )}
      </div>
    </>
  );
}
