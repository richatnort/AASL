import { useCallback, useEffect, useState } from 'react';

export type ToastData = { id: number; message: string; type: 'success' | 'error' | 'info' };

let _nextId = 0;

type ToastProps = { toasts: ToastData[]; onDismiss: (id: number) => void };

export function Toast({ toasts, onDismiss }: ToastProps) {
  return (
    <div style={{
      position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)',
      display: 'flex', flexDirection: 'column', gap: '0.5rem', zIndex: 1000,
      pointerEvents: 'none', width: 'min(90vw, 360px)',
    }}>
      {toasts.map((t) => (
        <div key={t.id} style={{
          background: t.type === 'error' ? '#ef4444' : t.type === 'success' ? '#22c55e' : '#3b82f6',
          color: '#fff', padding: '0.75rem 1rem', borderRadius: '0.5rem',
          fontSize: '0.9rem', fontWeight: 500, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          pointerEvents: 'auto', cursor: 'pointer',
          animation: 'slideUp 0.2s ease',
        }} onClick={() => onDismiss(t.id)}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((message: string, type: ToastData['type'] = 'info') => {
    const id = ++_nextId;
    setToasts((ts) => [...ts, { id, message, type }]);
    setTimeout(() => dismiss(id), 4000);
  }, [dismiss]);

  return { toasts, show, dismiss };
}

// Auto-dismiss hook for items that need showing
export function AutoDismissToast({ toasts, onDismiss }: ToastProps) {
  useEffect(() => {}, []);
  return <Toast toasts={toasts} onDismiss={onDismiss} />;
}
