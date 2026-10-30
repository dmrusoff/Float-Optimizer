// ═══════════════════════════════════════════
// FLOAT OPTIMIZER — Date & Math Utilities
// ═══════════════════════════════════════════

import { IncomeStream, OutflowEvent } from './types';

/**
 * Strip time component, returning midnight of the same day.
 */
export function startOfDay(date: Date | string | number = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Build a date clamped to the actual last day of the given month.
 */
export function buildDate(year: number, month: number, day: number): Date {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, lastDay));
}

/**
 * Get the 4th Wednesday of a given year and month (used for Social Security deposits).
 */
export function getFourthWednesday(year: number, month: number): Date {
  const date = new Date(year, month, 1);
  date.setHours(0, 0, 0, 0);

  // Find first Wednesday (day 3)
  while (date.getDay() !== 3) {
    date.setDate(date.getDate() + 1);
  }

  // Add 3 weeks (21 days) to get the 4th Wednesday
  date.setDate(date.getDate() + 21);
  return date;
}

/**
 * Generate bi-weekly paycheck dates between startDate and endDate based on a reference Friday.
 * Reference default: Dec 12, 2025 (matching Dashboard schedule)
 */
export function getBiweeklyPaycheckDates(
  startDate: Date,
  endDate: Date,
  referenceDateStr: string = '2025-12-12T00:00:00'
): Date[] {
  const start = startOfDay(startDate);
  const end = startOfDay(endDate);
  const ref = startOfDay(new Date(referenceDateStr));

  const results: Date[] = [];
  const current = new Date(ref);

  // If reference date is after start, move back by 14-day intervals
  if (current > start) {
    while (current > start) {
      current.setDate(current.getDate() - 14);
    }
  } else {
    // If reference is before start, advance until at or just before start
    while (current < start) {
      current.setDate(current.getDate() + 14);
    }
    // Step back one interval to catch any boundary
    current.setDate(current.getDate() - 14);
  }

  while (current <= end) {
    if (current >= start && current <= end) {
      results.push(new Date(current));
    }
    current.setDate(current.getDate() + 14);
  }

  return results;
}

/**
 * Get the next occurrence of a given day-of-month from a reference date.
 * If today IS that day, returns next month's occurrence.
 * Clamps to month-end for months with fewer days (e.g., day 31 in Feb → Feb 28).
 */
export function nextOccurrence(dayOfMonth: number, fromDate: Date = new Date()): Date {
  const from = startOfDay(fromDate);
  let year = from.getFullYear();
  let month = from.getMonth();

  // Try current month first
  let candidate = buildDate(year, month, dayOfMonth);

  // If candidate is today or in the past, move to next month
  if (candidate <= from) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
    candidate = buildDate(year, month, dayOfMonth);
  }

  return candidate;
}

/**
 * Get the number of whole days between two dates.
 */
export function daysBetween(a: Date, b: Date): number {
  const msPerDay = 86400000;
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / msPerDay);
}

/**
 * Format a date as "Mon DD" (e.g., "Aug 15").
 */
export function formatDateShort(date: Date): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
}

/**
 * Format a date as "Mon DD, YYYY".
 */
export function formatDateFull(date: Date): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

/**
 * Ordinal suffix for a day number (1st, 2nd, 3rd, 4th…).
 */
export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Normalize a value into [0, 1] given a min and max.
 */
export function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

/**
 * Format a currency amount with 2 decimal places (or optional integer format).
 */
export function formatCurrency(amount: number, showDecimals: boolean = true): string {
  const hasCents = amount % 1 !== 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: showDecimals || hasCents ? 2 : 0,
    maximumFractionDigits: showDecimals || hasCents ? 2 : 0,
  }).format(amount);
}

/**
 * Format a currency amount with cents.
 */
export function formatCurrencyPrecise(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Generate a unique ID.
 */
export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Add days to a date.
 */
export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Get all occurrences of a day-of-month within a date range.
 */
export function occurrencesInRange(dayOfMonth: number, startDate: Date, endDate: Date): Date[] {
  const results: Date[] = [];
  let current = nextOccurrence(dayOfMonth, addDays(startDate, -1));
  while (current <= endDate) {
    results.push(new Date(current));
    const nextMonth = current.getMonth() + 1;
    const nextYear = nextMonth > 11 ? current.getFullYear() + 1 : current.getFullYear();
    current = buildDate(nextYear, nextMonth % 12, dayOfMonth);
  }
  return results;
}

/**
 * Get all projected income events within a date range from Dashboard income streams.
 */
export function getIncomeEventsInRange(
  incomeStreams: IncomeStream[] | undefined,
  payDays: number[] | undefined,
  startDate: Date,
  endDate: Date,
  defaultAmount: number = 0
): OutflowEvent[] {
  const t = startOfDay(startDate);
  const end = startOfDay(endDate);
  const events: OutflowEvent[] = [];

  if (incomeStreams && incomeStreams.length > 0) {
    for (const stream of incomeStreams) {
      if (stream.type === 'biweekly-paycheck') {
        const payDates = getBiweeklyPaycheckDates(t, end, stream.referenceDate || '2025-12-12T00:00:00');
        for (const d of payDates) {
          events.push({
            date: d,
            cardName: stream.name || 'Paycheck',
            cardId: 'income-paycheck',
            amount: stream.amount || 0,
            type: 'income',
            color: '#06d6a0',
          });
        }
      } else if (stream.type === 'fourth-wednesday') {
        // Iterate months in range
        let curYear = t.getFullYear();
        let curMonth = t.getMonth();
        const endYear = end.getFullYear();
        const endMonth = end.getMonth();

        while (curYear < endYear || (curYear === endYear && curMonth <= endMonth)) {
          const wed = getFourthWednesday(curYear, curMonth);
          if (wed >= t && wed <= end) {
            events.push({
              date: wed,
              cardName: stream.name || 'Social Security',
              cardId: 'income-ss',
              amount: stream.amount || 0,
              type: 'income',
              color: '#10b981',
            });
          }
          curMonth++;
          if (curMonth > 11) {
            curMonth = 0;
            curYear++;
          }
        }
      } else if (stream.dayOfMonth) {
        const occs = occurrencesInRange(stream.dayOfMonth, t, end);
        for (const d of occs) {
          events.push({
            date: d,
            cardName: stream.name || 'Income',
            cardId: `income-${stream.dayOfMonth}`,
            amount: stream.amount || 0,
            type: 'income',
            color: '#00b4d8',
          });
        }
      }
    }
  } else if (payDays && payDays.length > 0) {
    for (const pd of payDays) {
      const incomeDates = occurrencesInRange(pd, t, end);
      for (const incDate of incomeDates) {
        events.push({
          date: incDate,
          cardName: 'Income',
          cardId: `income-${pd}`,
          amount: defaultAmount ? Math.round(defaultAmount / Math.max(1, payDays.length)) : 0,
          type: 'income',
          color: '#06d6a0',
        });
      }
    }
  }

  // Sort chronologically
  events.sort((a, b) => a.date.getTime() - b.date.getTime());
  return events;
}
