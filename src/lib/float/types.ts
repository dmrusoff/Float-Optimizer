export interface Card {
  id: string;
  name: string;
  closingDay: number; // 1-31
  dueDay?: number | string; // 1-31
  balance: number;
  limit: number;
  apr?: number | string;
  graceDays?: number;
  notes?: string;
  color?: string;
}

export interface IncomeStream {
  id?: string;
  name: string;
  amount: number;
  type: 'biweekly-paycheck' | 'fourth-wednesday' | 'fixed-day';
  referenceDate?: string;
  dayOfMonth?: number;
}

export type WarningType =
  | 'payment-before-income'
  | 'high-utilization'
  | 'concentration-risk'
  | 'due-date-cluster'
  | 'high-outflow';

export interface FloatSettings {
  payDays: number[];
  monthlySpend: number;
  cashBuffer: number;
  targetUtil: number; // percentage, e.g. 30
  defaultGraceDays: number;
  incomeStreams?: IncomeStream[];
  disabledAlerts?: WarningType[];
}

export interface FloatState {
  cards: Card[];
  settings: FloatSettings;
}

export interface FloatWindow {
  nextCloseDate: Date;
  nextDueDate: Date;
  daysUntilClose: number;
  daysUntilDue: number;
  totalFloatDays: number;
  graceDays: number;
}

export interface UtilizationInfo {
  utilization: number;
  utilizationPct: number;
  headroom: number;
}

export interface ScoredCard {
  card: Card;
  cardIndex: number;
  floatWindow: FloatWindow;
  utilization: UtilizationInfo;
  score: number;
  breakdown: {
    float: number;
    headroom: number;
    cashFlow: number;
    concentration: number;
  };
}

export interface OutflowEvent {
  date: Date;
  cardName: string;
  cardId: string;
  amount: number;
  type: 'payment' | 'income';
  color: string;
}

export interface DueDateStagger {
  score: number;
  suggestions: string[];
}

export interface WarningItem {
  type: WarningType;
  severity: 'warn' | 'danger' | 'info';
  message: string;
}
