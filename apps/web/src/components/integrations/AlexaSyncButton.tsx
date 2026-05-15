import type { AlexaSyncResult } from '@shopping-list/shared';
import { useState } from 'react';
import type { ApiError } from '../../lib/api.js';
import * as api from '../../lib/api.js';

type Props = {
  onSync: () => void;
  onToast: (msg: string, type: 'success' | 'error' | 'info') => void;
};

export function AlexaSyncButton({ onSync, onToast }: Props) {
  const [busy, setBusy] = useState(false);

  const handleSync = async () => {
    setBusy(true);
    try {
      const result: AlexaSyncResult = await api.syncAlexa();
      const added = result.added.length;
      const uncategorised = result.savedUncategorised;
      const skipped = result.skipped.length;

      const removed = result.removed.length;
      if (added === 0 && uncategorised === 0 && removed === 0) {
        onToast(`Nothing new (${skipped} already on list)`, 'info');
      } else {
        const parts = [];
        if (added > 0) parts.push(`${added} added`);
        if (uncategorised > 0) parts.push(`${uncategorised} need categorising`);
        if (removed > 0) parts.push(`${removed} ticked off via Alexa`);
        if (skipped > 0) parts.push(`${skipped} skipped`);
        onToast(parts.join(', '), 'success');
      }
      onSync();
    } catch (err: unknown) {
      const apiErr = err as ApiError;
      onToast(apiErr.error ?? 'Alexa sync failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={handleSync}
      disabled={busy}
      title="Sync from Alexa shopping list"
      style={{
        display: 'flex', alignItems: 'center', gap: '0.4rem',
        padding: '0.5rem 0.875rem', borderRadius: '999px',
        background: busy ? '#e0e0e0' : '#fff',
        border: '1.5px solid #e0e0e0',
        cursor: busy ? 'not-allowed' : 'pointer',
        fontSize: '0.85rem', fontWeight: 600, color: busy ? '#999' : '#333',
        transition: 'all 0.15s',
        boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
      }}
      onMouseEnter={(e) => { if (!busy) e.currentTarget.style.borderColor = '#2563eb'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e0e0e0'; }}
    >
      <span style={{ fontSize: '1rem' }}>🔁</span>
      {busy ? 'Syncing…' : 'Alexa'}
    </button>
  );
}
