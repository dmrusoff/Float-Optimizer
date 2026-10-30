// ═══════════════════════════════════════════
// FLOAT OPTIMIZER — Core Calculation Engine
// ═══════════════════════════════════════════

import {
  Card,
  FloatSettings,
  FloatWindow,
  UtilizationInfo,
  ScoredCard,
  OutflowEvent,
  DueDateStagger,
  WarningItem,
} from './types';
import {
  nextOccurrence,
  daysBetween,
  normalize,
  startOfDay,
  occurrencesInRange,
  addDays,
  formatDateShort,
  getIncomeEventsInRange,
} from './utils';

// ── Card accent colors ────────────────────
export const CARD_COLORS = [
  '#06d6a0', '#00b4d8', '#8b5cf6', '#f472b6',
  '#fbbf24', '#fb923c', '#a78bfa', '#34d399',
  '#38bdf8', '#ec4899', '#10b981', '#6366f1',
];

export function getCardColor(index: number, cardColor?: string): string {
  if (cardColor) return cardColor;
  return CARD_COLORS[index % CARD_COLORS.length];
}

// ── Float window ──────────────────────────

/**
 * Calculate the float window for a card.
 */
export function calcFloatWindow(card: Card, today: Date = new Date()): FloatWindow {
  const t = startOfDay(today);
  const graceDays = Number(card.graceDays) || 25;

  const nextCloseDate = nextOccurrence(Number(card.closingDay) || 1, t);
  const daysUntilClose = daysBetween(t, nextCloseDate);

  // Due date is graceDays after the statement close (or specific dueDay if set and calculated)
  const nextDueDate = addDays(nextCloseDate, graceDays);
  const daysUntilDue = daysBetween(t, nextDueDate);

  // Total float = days from today until payment is actually due
  const totalFloatDays = daysUntilDue;

  return {
    nextCloseDate,
    nextDueDate,
    daysUntilClose,
    daysUntilDue,
    totalFloatDays,
    graceDays,
  };
}

// ── Utilization ───────────────────────────

/**
 * Calculate card utilization metrics.
 */
export function calcUtilization(card: Card, additionalSpend: number = 0): UtilizationInfo {
  const used = (Number(card.balance) || 0) + additionalSpend;
  const limit = Math.max(1, Number(card.limit) || 1);
  const utilization = used / limit;
  const headroom = Math.max(0, limit - used);
  return {
    utilization: Math.min(1, utilization),
    utilizationPct: Math.min(100, Math.round(utilization * 100)),
    headroom,
  };
}

// ── Scoring ───────────────────────────────

/**
 * Score and rank cards for the next purchase.
 *
 * Weights:
 *   - Longest float: 40%
 *   - Utilization headroom: 30%
 *   - Cash-flow alignment: 20%
 *   - Anti-concentration: 10%
 */
export function scoreCards(
  cards: Card[],
  purchaseAmount: number = 0,
  settings: Partial<FloatSettings> = {},
  today: Date = new Date()
): ScoredCard[] {
  if (!cards.length) return [];

  const targetUtil = (settings.targetUtil || 30) / 100;
  const t = startOfDay(today);

  // Pre-generate income events for 90 days to evaluate cash-flow alignment
  const incomeEvents = getIncomeEventsInRange(
    settings.incomeStreams,
    settings.payDays,
    t,
    addDays(t, 90),
    settings.monthlySpend || 0
  );

  // Pre-compute per-card metrics
  const metrics = cards.map((card, idx) => {
    const fw = calcFloatWindow(card, today);
    const util = calcUtilization(card, purchaseAmount);
    return { card, fw, util, index: idx };
  });

  // Ranges for normalization
  const floats = metrics.map(m => m.fw.totalFloatDays);
  const headrooms = metrics.map(m => m.util.headroom);
  const minFloat = Math.min(...floats);
  const maxFloat = Math.max(...floats);
  const minHead = Math.min(...headrooms);
  const maxHead = Math.max(...headrooms);

  // Total current spend across all cards (for concentration calc)
  const totalBalance = cards.reduce((sum, c) => sum + (Number(c.balance) || 0), 0) || 1;

  const scored: ScoredCard[] = metrics.map(m => {
    // 1. Float score (higher = better)
    const floatScore = normalize(m.fw.totalFloatDays, minFloat, maxFloat);

    // 2. Headroom score (more room = better, penalize if over target util)
    let headroomScore = normalize(m.util.headroom, minHead, maxHead);
    if (m.util.utilization + (purchaseAmount / Math.max(1, Number(m.card.limit) || 1)) > targetUtil) {
      headroomScore *= 0.5; // penalty for exceeding target
    }

    // 3. Cash-flow alignment (does the due date land near an income deposit?)
    const cashFlowScore = calcCashFlowAlignment(m.fw.nextDueDate, incomeEvents, settings.payDays || []);

    // 4. Anti-concentration (prefer cards with lower share of total balance)
    const share = (Number(m.card.balance) || 0) / totalBalance;
    const concentrationScore = 1 - share;

    const score =
      0.40 * floatScore +
      0.30 * headroomScore +
      0.20 * cashFlowScore +
      0.10 * concentrationScore;

    return {
      card: m.card,
      cardIndex: m.index,
      floatWindow: m.fw,
      utilization: m.util,
      score: Math.round(score * 100),
      breakdown: {
        float: Math.round(floatScore * 100),
        headroom: Math.round(headroomScore * 100),
        cashFlow: Math.round(cashFlowScore * 100),
        concentration: Math.round(concentrationScore * 100),
      },
    };
  });

  // Sort descending by longest float days first (primary), then overall score (secondary)
  scored.sort((a, b) => {
    if (b.floatWindow.totalFloatDays !== a.floatWindow.totalFloatDays) {
      return b.floatWindow.totalFloatDays - a.floatWindow.totalFloatDays;
    }
    return b.score - a.score;
  });
  return scored;
}

/**
 * How well does the due date align with income?
 * Returns 0–1 where 1 = due date is right after a paycheck or SS deposit.
 */
function calcCashFlowAlignment(
  dueDate: Date,
  incomeEvents: OutflowEvent[],
  fallbackPayDays: number[]
): number {
  const due = startOfDay(dueDate);

  if (incomeEvents.length > 0) {
    let bestDaysBefore = Infinity;

    for (const inc of incomeEvents) {
      const diff = daysBetween(inc.date, due);
      if (diff >= 0 && diff < bestDaysBefore) {
        bestDaysBefore = diff;
      }
    }

    if (bestDaysBefore <= 5) return 1.0;
    if (bestDaysBefore <= 10) return 0.7;
    if (bestDaysBefore <= 15) return 0.4;
    return 0.2;
  }

  if (!fallbackPayDays.length) return 0.5;

  let bestDaysBefore = Infinity;
  for (const pd of fallbackPayDays) {
    for (let offset = 0; offset <= 1; offset++) {
      const payDate = new Date(due.getFullYear(), due.getMonth() - offset, pd);
      const diff = daysBetween(payDate, due);
      if (diff >= 0 && diff < bestDaysBefore) {
        bestDaysBefore = diff;
      }
    }
  }

  if (bestDaysBefore <= 5) return 1.0;
  if (bestDaysBefore <= 10) return 0.7;
  if (bestDaysBefore <= 15) return 0.4;
  return 0.2;
}

// ── Cash-outflow projection ───────────────

/**
 * Project payment and income events for the next N days.
 */
export function projectOutflows(
  cards: Card[],
  days: number = 60,
  settings: Partial<FloatSettings> = {},
  today: Date = new Date()
): OutflowEvent[] {
  const t = startOfDay(today);
  const endDate = addDays(t, days);
  const events: OutflowEvent[] = [];

  // Card payment events
  cards.forEach((card, idx) => {
    const graceDays = Number(card.graceDays) || 25;
    const closingDay = Number(card.closingDay) || 1;
    const closeDates = occurrencesInRange(closingDay, t, endDate);

    // Also check if there's a close date that already happened but whose due date is in range
    const priorClose = new Date(t);
    priorClose.setMonth(priorClose.getMonth() - 1);
    const priorCloseDates = occurrencesInRange(closingDay, priorClose, t);

    const allCloseDates = [...priorCloseDates, ...closeDates];

    for (const closeDate of allCloseDates) {
      const dueDate = addDays(closeDate, graceDays);
      if (dueDate >= t && dueDate <= endDate) {
        events.push({
          date: dueDate,
          cardName: card.name,
          cardId: card.id,
          amount: Number(card.balance) || 0,
          type: 'payment',
          color: getCardColor(idx, card.color),
        });
      }
    }
  });

  // Income events from Dashboard streams
  const incomeEvents = getIncomeEventsInRange(
    settings.incomeStreams,
    settings.payDays,
    t,
    endDate,
    settings.monthlySpend || 0
  );

  events.push(...incomeEvents);

  // Sort chronologically
  events.sort((a, b) => a.date.getTime() - b.date.getTime());
  return events;
}

// ── Due-date stagger suggestions ──────────

/**
 * Analyze how well due dates are staggered and suggest improvements.
 */
export function suggestDueDateChanges(cards: Card[]): DueDateStagger {
  if (cards.length < 2) {
    return { score: 100, suggestions: [] };
  }

  const suggestions: string[] = [];
  const dueDays = cards
    .map(c => ({
      name: c.name,
      day: Number(c.dueDay) || (Number(c.closingDay) + (Number(c.graceDays) || 25)) % 30 || 1,
    }))
    .sort((a, b) => a.day - b.day);

  const idealGap = Math.round(30 / cards.length);
  let totalDeviation = 0;

  for (let i = 0; i < dueDays.length; i++) {
    const next = dueDays[(i + 1) % dueDays.length];
    const curr = dueDays[i];
    let gap = next.day - curr.day;
    if (gap <= 0) gap += 30; // wrap around month

    const deviation = Math.abs(gap - idealGap);
    totalDeviation += deviation;

    if (gap < 5 && cards.length > 1) {
      suggestions.push(
        `${curr.name} and ${next.name} have due dates only ${gap} days apart. Consider moving one to spread payments more evenly.`
      );
    }
  }

  // Score: 100 = perfectly staggered, 0 = all on same day
  const maxDeviation = 30 * cards.length;
  const score = Math.max(0, Math.round(100 - (totalDeviation / maxDeviation) * 200));

  if (suggestions.length === 0 && score < 70) {
    const idealDays = dueDays.map((_, i) => (i * idealGap) + 1);
    suggestions.push(
      `For optimal stagger, consider requesting due dates around: ${idealDays.map(d => ordinalDay(d)).join(', ')}.`
    );
  }

  return { score, suggestions };
}

function ordinalDay(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ── Risk warnings ─────────────────────────

/**
 * Check for various risk conditions.
 */
export function checkWarnings(
  cards: Card[],
  settings: FloatSettings,
  outflows: OutflowEvent[],
  today: Date = new Date()
): WarningItem[] {
  const warnings: WarningItem[] = [];
  const t = startOfDay(today);
  const payDays = settings.payDays || [];
  const targetUtil = (settings.targetUtil || 30) / 100;

  // 1. Payment before next income
  if (payDays.length > 0) {
    const paymentEvents = outflows.filter(e => e.type === 'payment');
    const incomeEvents = outflows.filter(e => e.type === 'income');

    for (const payment of paymentEvents) {
      const daysUntilPayment = daysBetween(t, payment.date);
      if (daysUntilPayment > 30) continue; // only warn about near-term

      // Find closest income ON or BEFORE this payment
      const priorIncome = incomeEvents
        .filter(inc => inc.date <= payment.date)
        .sort((a, b) => b.date.getTime() - a.date.getTime())[0];

      if (!priorIncome) {
        warnings.push({
          type: 'payment-before-income',
          severity: 'danger',
          message: `${payment.cardName} payment due ${formatDateShort(payment.date)} — no income expected before then.`,
        });
      }
    }
  }

  // 2. High utilization
  for (const card of cards) {
    const util = (Number(card.balance) || 0) / Math.max(1, Number(card.limit) || 1);
    if (util > targetUtil) {
      const pct = Math.round(util * 100);
      const severity = util > 0.7 ? 'danger' : 'warn';
      warnings.push({
        type: 'high-utilization',
        severity,
        message: `${card.name} utilization is ${pct}% (target: ${Math.round(targetUtil * 100)}%).`,
      });
    }
  }

  // 3. Concentration risk (one card has >60% of total balance)
  const totalBalance = cards.reduce((sum, c) => sum + (Number(c.balance) || 0), 0);
  if (totalBalance > 0) {
    for (const card of cards) {
      const share = (Number(card.balance) || 0) / totalBalance;
      if (share > 0.6 && cards.length > 1) {
        warnings.push({
          type: 'concentration-risk',
          severity: 'warn',
          message: `${card.name} carries ${Math.round(share * 100)}% of your total balance. Consider distributing spend.`,
        });
      }
    }
  }

  // 4. Due-date clustering
  const { score, suggestions } = suggestDueDateChanges(cards);
  if (score < 50) {
    warnings.push({
      type: 'due-date-cluster',
      severity: 'info',
      message: suggestions[0] || 'Your due dates are clustered — consider requesting changes to spread them out.',
    });
  }

  // 5. Monthly outflow exceeds income estimate
  if (settings.monthlySpend) {
    const next30Payments = outflows
      .filter(e => e.type === 'payment' && daysBetween(t, e.date) <= 30)
      .reduce((sum, e) => sum + e.amount, 0);

    if (next30Payments > settings.monthlySpend * 0.8) {
      warnings.push({
        type: 'high-outflow',
        severity: 'warn',
        message: `Upcoming 30-day card payments ($${Math.round(next30Payments).toLocaleString()}) approach your estimated monthly spending.`,
      });
    }
  }

  // Filter out any user-disabled alert types
  const disabled = new Set(settings.disabledAlerts || []);
  return warnings.filter(w => !disabled.has(w.type));
}
