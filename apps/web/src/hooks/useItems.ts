import type { Item, ItemsResponse, NeedsCategoryResponse } from '@shopping-list/shared';
import { useCallback, useState } from 'react';
import * as api from '../lib/api.js';

export type NeedsCategoryItem = NeedsCategoryResponse & { alexaItemId?: string };

type State = {
  items: ItemsResponse;
  loading: boolean;
  error: string | null;
  needsCategory: NeedsCategoryItem | null;
};

export function useItems() {
  const [state, setState] = useState<State>({
    items: {},
    loading: true,
    error: null,
    needsCategory: null,
  });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const items = await api.getItems();
      setState((s) => ({ ...s, items, loading: false }));
    } catch {
      setState((s) => ({ ...s, loading: false, error: 'Failed to load items' }));
    }
  }, []);

  const addItem = useCallback(async (name: string): Promise<string | null> => {
    try {
      const result = await api.addItem(name);
      if ('needsCategory' in result) {
        setState((s) => ({ ...s, needsCategory: result as NeedsCategoryItem }));
        return null;
      }
      const item = result as Item;
      setState((s) => ({
        ...s,
        items: {
          ...s.items,
          [item.category]: [...(s.items[item.category] ?? []), item],
        },
      }));
      return null;
    } catch (err: unknown) {
      const apiErr = err as { code?: string };
      if (apiErr.code === 'ALREADY_EXISTS') return 'Already on the list';
      return 'Failed to add item';
    }
  }, []);

  const confirmCategory = useCallback(
    async (category: string): Promise<string | null> => {
      if (!state.needsCategory) return null;
      const { name, quantity, alexaItemId } = state.needsCategory;
      try {
        const item = await api.confirmCategory(name, quantity, category, alexaItemId);
        setState((s) => ({
          ...s,
          needsCategory: null,
          items: {
            ...s.items,
            [item.category]: [...(s.items[item.category] ?? []), item],
          },
        }));
        return null;
      } catch {
        return 'Failed to save item';
      }
    },
    [state.needsCategory],
  );

  const dismissCategory = useCallback(() => {
    setState((s) => ({ ...s, needsCategory: null }));
  }, []);

  const updateQty = useCallback(async (id: number, quantity: number, category: string) => {
    setState((s) => ({
      ...s,
      items: {
        ...s.items,
        [category]: (s.items[category] ?? []).map((i) => (i.id === id ? { ...i, quantity } : i)),
      },
    }));
    try {
      await api.patchItem(id, quantity);
    } catch {
      const items = await api.getItems().catch(() => null);
      if (items) setState((s) => ({ ...s, items }));
    }
  }, []);

  const removeItem = useCallback(async (id: number, category: string) => {
    setState((s) => ({
      ...s,
      items: {
        ...s.items,
        [category]: (s.items[category] ?? []).filter((i) => i.id !== id),
      },
    }));
    try {
      await api.deleteItem(id);
    } catch {
      const items = await api.getItems().catch(() => null);
      if (items) setState((s) => ({ ...s, items }));
    }
  }, []);

  const checkItem = useCallback(async (id: number, category: string): Promise<string | null> => {
    setState((s) => ({
      ...s,
      items: {
        ...s.items,
        [category]: (s.items[category] ?? []).filter((i) => i.id !== id),
      },
    }));
    try {
      const result = await api.checkItem(id);
      return result.alexaWarning ?? null;
    } catch {
      const items = await api.getItems().catch(() => null);
      if (items) setState((s) => ({ ...s, items }));
      return null;
    }
  }, []);

  return {
    ...state,
    load,
    addItem,
    confirmCategory,
    dismissCategory,
    updateQty,
    removeItem,
    checkItem,
  };
}
