// ═══════════════════════════════════════════
// FLOAT OPTIMIZER — Reactive State Store & Hooks
// ═══════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { Card, FloatSettings, FloatState, IncomeStream } from './types';
import { uid } from './utils';
import { supabase } from '../supabase';
import { CARD_COLORS } from './engine';

export const STORAGE_KEY = 'float-optimizer-state';

export const DEFAULT_INCOME_STREAMS: IncomeStream[] = [
  {
    id: 'inc-paycheck',
    name: 'Primary Paycheck (Bi-weekly)',
    amount: 3500,
    type: 'biweekly-paycheck',
    referenceDate: '2026-01-09T00:00:00',
  },
  {
    id: 'inc-secondary',
    name: 'Monthly Distribution (1st)',
    amount: 1500,
    type: 'fixed-day',
    dayOfMonth: 1,
  },
];

export const DEFAULT_SETTINGS: FloatSettings = {
  payDays: [1, 15],
  monthlySpend: 3500,
  cashBuffer: 1000,
  targetUtil: 30,
  defaultGraceDays: 25,
  incomeStreams: DEFAULT_INCOME_STREAMS,
};

// Generic sample cards for standalone mode
export const SAMPLE_CARDS: Card[] = [
  { id: 'cc-1', name: 'Sapphire Reserve Rewards', balance: 650.00, limit: 15000, dueDay: 3, closingDay: 8, graceDays: 25, color: '#06d6a0' },
  { id: 'cc-2', name: 'Freedom Unlimited Cash', balance: 420.00, limit: 12000, dueDay: 10, closingDay: 15, graceDays: 25, color: '#00b4d8' },
  { id: 'cc-3', name: 'Venture X Travel Elite', balance: 1280.00, limit: 20000, dueDay: 17, closingDay: 22, graceDays: 25, color: '#8b5cf6' },
  { id: 'cc-4', name: 'Custom Cash Preferred', balance: 195.00, limit: 8000, dueDay: 24, closingDay: 29, graceDays: 25, color: '#f472b6' },
  { id: 'cc-5', name: 'Gold Everyday Dining', balance: 890.00, limit: 18000, dueDay: 28, closingDay: 3, graceDays: 25, color: '#fbbf24' },
];

export const DEFAULT_STATE: FloatState = {
  cards: SAMPLE_CARDS,
  settings: DEFAULT_SETTINGS,
};

export function loadFloatState(): FloatState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        cards: Array.isArray(parsed.cards) && parsed.cards.length > 0 ? parsed.cards : SAMPLE_CARDS,
        settings: {
          ...DEFAULT_SETTINGS,
          ...(parsed.settings || {}),
          incomeStreams: parsed.settings?.incomeStreams || DEFAULT_INCOME_STREAMS,
        },
      };
    }
  } catch (e) {
    console.error('Failed to load float state from localStorage', e);
  }
  return DEFAULT_STATE;
}

export function saveFloatState(state: FloatState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save float state to localStorage', e);
  }
}

/**
 * Custom React hook for Float state with optional Supabase sync
 */
export function useFloatState() {
  const [state, setStateInternal] = useState<FloatState>(() => loadFloatState());
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    saveFloatState(state);
  }, [state]);

  const syncFromDashboard = useCallback(async () => {
    if (!supabase) return;
    setIsLoading(true);
    try {
      const { data: dbCards, error: cardsErr } = await supabase
        .from('credit_cards')
        .select('*')
        .order('sort_order', { ascending: true });

      if (cardsErr) throw cardsErr;

      let updatedCards = state.cards;
      if (dbCards && dbCards.length > 0) {
        updatedCards = dbCards.map((c: any, idx: number) => {
          let dueDay: number | undefined;
          if (c.due_date) {
            const parts = String(c.due_date).split(/[-/]/);
            if (parts.length === 3) {
              dueDay = parts[0].length === 4 ? parseInt(parts[2], 10) : parseInt(parts[1], 10);
            }
          }

          const targetDue = dueDay || 15;
          const closingDay = ((targetDue - 25 - 1 + 30) % 30) + 1;
          const existing = state.cards.find(x => x.id === c.id || x.name.toLowerCase() === c.name.toLowerCase());

          const fullName = c.issuer && !c.name.toLowerCase().includes(c.issuer.toLowerCase())
            ? `${c.issuer} ${c.name}`
            : c.name;

          return {
            id: c.id || uid(),
            name: fullName,
            balance: Number(c.current_balance) || 0,
            limit: Number(c.credit_limit) || 5000,
            dueDay,
            closingDay: Number(c.closing_day) || existing?.closingDay || closingDay,
            graceDays: Number(c.grace_days) || existing?.graceDays || 25,
            apr: existing?.apr,
            color: existing?.color || CARD_COLORS[idx % CARD_COLORS.length],
          };
        });
      }

      setStateInternal(prev => ({
        ...prev,
        cards: updatedCards,
      }));
    } catch (e) {
      console.warn('Supabase sync unavailable, using local state.', e);
    } finally {
      setIsLoading(false);
    }
  }, [state.cards]);

  const addCard = useCallback((card: Omit<Card, 'id'> & { id?: string }) => {
    setStateInternal(prev => ({
      ...prev,
      cards: [
        ...prev.cards,
        {
          ...card,
          id: card.id || uid(),
        },
      ],
    }));
  }, []);

  const updateCard = useCallback(async (id: string, updates: Partial<Card>) => {
    setStateInternal(prev => ({
      ...prev,
      cards: prev.cards.map(c => (c.id === id ? { ...c, ...updates } : c)),
    }));
  }, []);

  const deleteCard = useCallback((id: string) => {
    setStateInternal(prev => ({
      ...prev,
      cards: prev.cards.filter(c => c.id !== id),
    }));
  }, []);

  const updateSettings = useCallback((updates: Partial<FloatSettings>) => {
    setStateInternal(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        ...updates,
      },
    }));
  }, []);

  const resetToDefaults = useCallback(() => {
    setStateInternal({
      cards: SAMPLE_CARDS,
      settings: DEFAULT_SETTINGS,
    });
  }, []);

  const importState = useCallback((newState: FloatState) => {
    setStateInternal(newState);
  }, []);

  return {
    state,
    cards: state.cards,
    settings: state.settings,
    isLoading,
    syncFromDashboard,
    addCard,
    updateCard,
    deleteCard,
    updateSettings,
    resetToDefaults,
    importState,
  };
}
