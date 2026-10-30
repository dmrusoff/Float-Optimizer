import React, { useState, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  CreditCard,
  Calendar,
  Settings as SettingsIcon,
  LayoutDashboard,
  AlertTriangle,
  X,
  Edit2,
  Trash2,
  Download,
  Upload,
  RefreshCw,
  Info,
  Sparkles,
  Bell,
  BellOff,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Card, WarningType } from '../lib/float/types';
import {
  useFloatState,
  DEFAULT_SETTINGS,
} from '../lib/float/state';
import {
  scoreCards,
  calcFloatWindow,
  calcUtilization,
  projectOutflows,
  suggestDueDateChanges,
  checkWarnings,
  getCardColor,
  CARD_COLORS,
} from '../lib/float/engine';
import {
  formatDateShort,
  formatDateFull,
  formatCurrency,
  formatCurrencyPrecise,
  ordinal,
  daysBetween,
  startOfDay,
  addDays,
} from '../lib/float/utils';

const ALERT_DEFINITIONS: { id: WarningType; label: string; icon: string; desc: string }[] = [
  {
    id: 'payment-before-income',
    label: 'Payment Due Before Income',
    icon: '⚠️',
    desc: 'Alerts when a card payment is due before your next paycheck or Social Security deposit arrives.',
  },
  {
    id: 'high-utilization',
    label: 'High Card Utilization',
    icon: '📊',
    desc: 'Alerts when any card balance exceeds your target utilization threshold (e.g. 30%).',
  },
  {
    id: 'concentration-risk',
    label: 'Balance Concentration',
    icon: '⚖️',
    desc: 'Alerts when more than 60% of your total balance is concentrated on a single card.',
  },
  {
    id: 'due-date-cluster',
    label: 'Due Date Clustering',
    icon: '📅',
    desc: 'Alerts and suggests adjustments when multiple card due dates fall within a few days of each other.',
  },
  {
    id: 'high-outflow',
    label: 'High 30-Day Outflows',
    icon: '💸',
    desc: 'Alerts when upcoming 30-day card bills approach your estimated monthly spending.',
  },
];

export default function Float() {
  const {
    cards,
    settings,
    isLoading,
    syncFromDashboard,
    addCard,
    updateCard,
    deleteCard,
    updateSettings,
    resetToDefaults,
    importState,
  } = useFloatState();

  const [activeTab, setActiveTab] = useState<'dashboard' | 'cards' | 'timeline' | 'settings'>('dashboard');
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [dismissedWarnings, setDismissedWarnings] = useState<Set<string>>(new Set());
  const [purchaseAmount, setPurchaseAmount] = useState<number>(0);
  const [newPayday, setNewPayday] = useState<string>('');
  const [showHowItWorks, setShowHowItWorks] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('float_show_how_it_works');
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  const toggleHowItWorks = () => {
    setShowHowItWorks(prev => {
      const next = !prev;
      try {
        localStorage.setItem('float_show_how_it_works', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    closingDay: '15' as string | number,
    dueDay: '',
    balance: '0' as string | number,
    limit: '5000' as string | number,
    apr: '',
    graceDays: '25' as string | number,
    color: CARD_COLORS[0],
  });
  const [formError, setFormError] = useState('');

  const [rankSortBy, setRankSortBy] = useState<'float' | 'score' | 'headroom' | 'utilization'>('float');

  // Computations
  const today = useMemo(() => startOfDay(new Date()), []);
  
  const scored = useMemo(() => {
    const amount = purchaseAmount > 0 
      ? purchaseAmount 
      : (settings.monthlySpend ? Math.round(settings.monthlySpend / 20) : 100);
    return scoreCards(cards, amount, settings, today);
  }, [cards, purchaseAmount, settings, today]);

  const displayedRankings = useMemo(() => {
    const list = [...scored];
    if (rankSortBy === 'float') {
      return list.sort((a, b) => {
        if (b.floatWindow.totalFloatDays !== a.floatWindow.totalFloatDays) {
          return b.floatWindow.totalFloatDays - a.floatWindow.totalFloatDays;
        }
        return b.score - a.score;
      });
    }
    if (rankSortBy === 'score') {
      return list.sort((a, b) => b.score - a.score);
    }
    if (rankSortBy === 'headroom') {
      return list.sort((a, b) => b.utilization.headroom - a.utilization.headroom);
    }
    if (rankSortBy === 'utilization') {
      return list.sort((a, b) => a.utilization.utilizationPct - b.utilization.utilizationPct);
    }
    return list;
  }, [scored, rankSortBy]);

  const topCard = displayedRankings[0];

  const outflows = useMemo(() => {
    return projectOutflows(cards, 60, settings, today);
  }, [cards, settings, today]);

  const staggerInfo = useMemo(() => {
    return suggestDueDateChanges(cards);
  }, [cards]);

  const allWarnings = useMemo(() => {
    return checkWarnings(cards, settings, outflows, today);
  }, [cards, settings, outflows, today]);

  const activeWarnings = useMemo(() => {
    return allWarnings.filter(w => !dismissedWarnings.has(w.message));
  }, [allWarnings, dismissedWarnings]);

  const parseCleanNumber = (val: string | number | undefined, defaultVal: number = 0): number => {
    if (val === undefined || val === null || val === '') return defaultVal;
    if (typeof val === 'number') return isNaN(val) ? defaultVal : val;
    const cleaned = String(val).replace(/[^0-9.-]+/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? defaultVal : num;
  };

  const handleOpenAdd = () => {
    setEditingCard(null);
    setFormData({
      name: '',
      closingDay: 15,
      dueDay: '',
      balance: '',
      limit: '',
      apr: '',
      graceDays: settings.defaultGraceDays || 25,
      color: CARD_COLORS[cards.length % CARD_COLORS.length],
    });
    setFormError('');
    setIsFormOpen(true);
  };

  const handleOpenEdit = (card: Card) => {
    setEditingCard(card);
    setFormData({
      name: card.name,
      closingDay: card.closingDay,
      dueDay: card.dueDay !== undefined ? String(card.dueDay) : '',
      balance: card.balance,
      limit: card.limit,
      apr: card.apr !== undefined ? String(card.apr) : '',
      graceDays: card.graceDays ?? (settings.defaultGraceDays || 25),
      color: card.color || CARD_COLORS[0],
    });
    setFormError('');
    setIsFormOpen(true);
  };

  const handleSaveCard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setFormError('Card name is required');
      return;
    }
    const closing = parseCleanNumber(formData.closingDay, 0);
    if (!closing || closing < 1 || closing > 31) {
      setFormError('Closing day must be between 1 and 31');
      return;
    }
    const limit = parseCleanNumber(formData.limit, 0);
    if (limit <= 0) {
      setFormError('Limit must be greater than 0');
      return;
    }

    const balance = Math.max(0, parseCleanNumber(formData.balance, 0));
    const dueDay = formData.dueDay ? parseCleanNumber(formData.dueDay, 0) : undefined;
    const apr = formData.apr ? parseCleanNumber(formData.apr, 0) : undefined;
    const graceDays = parseCleanNumber(formData.graceDays, 25);

    const cardPayload: Omit<Card, 'id'> = {
      name: formData.name.trim(),
      closingDay: closing,
      dueDay: dueDay && dueDay >= 1 && dueDay <= 31 ? dueDay : undefined,
      balance: balance,
      limit: limit,
      apr: apr,
      graceDays: graceDays > 0 ? graceDays : 25,
      color: formData.color,
    };

    if (editingCard) {
      updateCard(editingCard.id, cardPayload);
    } else {
      addCard(cardPayload);
    }

    setIsFormOpen(false);
  };

  const dismissWarning = (message: string) => {
    setDismissedWarnings(prev => new Set(prev).add(message));
  };

  const toggleAlert = (type: WarningType) => {
    const currentDisabled = new Set(settings.disabledAlerts || []);
    if (currentDisabled.has(type)) {
      currentDisabled.delete(type);
    } else {
      currentDisabled.add(type);
    }
    updateSettings({ disabledAlerts: Array.from(currentDisabled) });
  };

  const handleAddPayday = () => {
    const val = parseInt(newPayday, 10);
    if (val >= 1 && val <= 31 && !settings.payDays.includes(val)) {
      const updated = [...settings.payDays, val].sort((a, b) => a - b);
      updateSettings({ payDays: updated });
      setNewPayday('');
    }
  };

  const handleRemovePayday = (day: number) => {
    const updated = settings.payDays.filter(d => d !== day);
    updateSettings({ payDays: updated });
  };

  const handleExport = () => {
    const dataStr = JSON.stringify({ cards, settings }, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `float-optimizer-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed && (parsed.cards || parsed.settings)) {
          importState({
            cards: Array.isArray(parsed.cards) ? parsed.cards : [],
            settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
          });
        }
      } catch (err) {
        alert('Invalid JSON file format.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-slate-100 antialiased selection:bg-teal-500/30 selection:text-teal-200">
      {/* Top Header */}
      <header className="sticky top-0 z-30 border-b border-white/5 bg-[#0a0e1a]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-all text-xs font-semibold"
            >
              <ArrowLeft className="w-4 h-4 text-teal-400" />
              <span>Dashboard</span>
            </Link>
            <div className="h-6 w-[1px] bg-white/10 hidden sm:block" />
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center shadow-lg shadow-teal-500/20 text-black font-extrabold text-lg">
                ⟳
              </div>
              <div>
                <h1 className="text-xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-teal-400 via-cyan-300 to-indigo-400">
                  Float
                </h1>
                <p className="text-xs text-slate-400 font-medium">Credit Card Float Optimizer</p>
              </div>
            </div>
          </div>

          {/* Navigation Tabs & Add Button */}
          <div className="flex items-center gap-3">
            <nav className="flex items-center gap-1 bg-white/5 p-1 rounded-full border border-white/10 backdrop-blur-md">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`flex items-center gap-2 px-3.5 sm:px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  activeTab === 'dashboard'
                    ? 'bg-gradient-to-r from-teal-500 to-cyan-500 text-black shadow-md shadow-teal-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Rankings</span>
              </button>
              <button
                onClick={() => setActiveTab('cards')}
                className={`flex items-center gap-2 px-3.5 sm:px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  activeTab === 'cards'
                    ? 'bg-gradient-to-r from-teal-500 to-cyan-500 text-black shadow-md shadow-teal-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Cards ({cards.length})</span>
              </button>
              <button
                onClick={() => setActiveTab('timeline')}
                className={`flex items-center gap-2 px-3.5 sm:px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  activeTab === 'timeline'
                    ? 'bg-gradient-to-r from-teal-500 to-cyan-500 text-black shadow-md shadow-teal-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Timeline</span>
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`flex items-center gap-2 px-3.5 sm:px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  activeTab === 'settings'
                    ? 'bg-gradient-to-r from-teal-500 to-cyan-500 text-black shadow-md shadow-teal-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <SettingsIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Settings</span>
              </button>
            </nav>

            <button
              onClick={() => syncFromDashboard()}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white font-semibold text-xs transition-all disabled:opacity-50"
              title="Sync cards from Dashboard database"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-teal-400 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden lg:inline">{isLoading ? 'Syncing...' : 'Sync Cards'}</span>
            </button>

            <button
              onClick={handleOpenAdd}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-black font-bold text-xs shadow-lg shadow-teal-500/20 hover:scale-105 active:scale-95 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden md:inline">Add Card</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Warnings Banner (except when on settings) */}
        {activeTab !== 'settings' && activeWarnings.length > 0 && (
          <div className="space-y-2.5">
            {activeWarnings.map((w, idx) => {
              const isDanger = w.severity === 'danger';
              const isWarn = w.severity === 'warn';
              return (
                <div
                  key={idx}
                  className={`flex items-center justify-between p-4 rounded-2xl border backdrop-blur-xl transition-all ${
                    isDanger
                      ? 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                      : isWarn
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                      : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <AlertTriangle className={`w-5 h-5 shrink-0 ${isDanger ? 'text-rose-400' : isWarn ? 'text-amber-400' : 'text-cyan-400'}`} />
                    <span className="text-sm font-medium">{w.message}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => toggleAlert(w.type)}
                      className="px-2.5 py-1 rounded-xl bg-black/20 hover:bg-black/40 text-[11px] font-semibold text-slate-300 hover:text-white transition-all flex items-center gap-1.5 border border-white/5"
                      title="Disable this alert category in Settings"
                    >
                      <BellOff className="w-3.5 h-3.5 text-slate-400" />
                      <span className="hidden sm:inline">Mute Type</span>
                    </button>
                    <button
                      onClick={() => dismissWarning(w.message)}
                      className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-all"
                      title="Dismiss"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* How It Works Note */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-teal-950/30 via-slate-900/60 to-indigo-950/30 border border-teal-500/20 backdrop-blur-xl p-6 sm:p-7 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-2xl bg-teal-500/20 border border-teal-500/30 text-teal-300 flex items-center justify-center font-bold text-lg shrink-0 shadow-inner">
                💡
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-extrabold text-white flex items-center gap-2 tracking-tight">
                  How Float Optimizes Your Cash Flow
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Maximize up to 55 days of interest-free float, protect your bank reserves, and align card payments with your paydays.
                </p>
              </div>
            </div>
            <button
              onClick={toggleHowItWorks}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-all text-xs flex items-center gap-1.5 font-semibold shrink-0"
              title={showHowItWorks ? 'Collapse guide' : 'Expand guide'}
            >
              <HelpCircle className="w-3.5 h-3.5 text-teal-400" />
              <span className="hidden sm:inline">{showHowItWorks ? 'Hide Guide' : 'How It Works'}</span>
              {showHowItWorks ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {showHowItWorks && (
            <div className="mt-5 pt-5 border-t border-white/10 grid grid-cols-1 md:grid-cols-3 gap-4 animate-in fade-in duration-200">
              <div className="p-4 rounded-2xl bg-black/30 border border-white/5 space-y-1.5">
                <div className="text-xs font-bold text-teal-300 flex items-center gap-2">
                  <span>🔄</span> 1. The 55-Day Float Window
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Purchasing on a card right after its statement closes gives you a full 30-day billing cycle <strong>plus a 25-day grace period</strong> — that is up to <strong>55 days</strong> before money leaves your account.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-black/30 border border-white/5 space-y-1.5">
                <div className="text-xs font-bold text-cyan-300 flex items-center gap-2">
                  <span>🎯</span> 2. Intelligent Scoring Model
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Every card is scored daily based on <strong>Float Days</strong> (40%), <strong>Credit Headroom</strong> (30%), <strong>Paycheck Alignment</strong> (20%), and <strong>Debt Balance Distribution</strong> (10%).
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-black/30 border border-white/5 space-y-1.5">
                <div className="text-xs font-bold text-indigo-300 flex items-center gap-2">
                  <span>🛡</span> 3. Cash Stays Earning APY
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Keep your money in high-yield savings earning 4–5% interest until payment is due. Always pay the full statement balance on time to pay <strong>0% interest</strong>.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* TAB 1: DASHBOARD / RANKINGS */}
        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            {cards.length === 0 ? (
              <div className="text-center py-16 px-6 rounded-3xl bg-slate-900/40 border border-white/5 space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center mx-auto text-2xl">
                  💳
                </div>
                <h3 className="text-xl font-bold text-white">No cards tracked yet</h3>
                <p className="text-sm text-slate-400 max-w-md mx-auto">
                  Add your credit cards with statement closing dates to calculate optimal float periods and protect your cash flow.
                </p>
                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    onClick={handleOpenAdd}
                    className="px-5 py-2.5 rounded-xl bg-teal-500 text-black font-bold text-sm shadow-lg shadow-teal-500/20 hover:bg-teal-400 transition-all"
                  >
                    + Add Card
                  </button>
                  <button
                    onClick={() => syncFromDashboard()}
                    disabled={isLoading}
                    className="px-5 py-2.5 rounded-xl bg-white/5 text-slate-300 hover:text-white border border-white/10 font-semibold text-sm transition-all flex items-center gap-2"
                  >
                    <RefreshCw className={`w-4 h-4 text-teal-400 ${isLoading ? 'animate-spin' : ''}`} />
                    Sync from Dashboard
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Hero Card */}
                {topCard && (
                  <div
                    className="relative overflow-hidden rounded-[2rem] p-8 sm:p-10 border shadow-2xl transition-all"
                    style={{
                      backgroundColor: 'rgba(15, 23, 42, 0.75)',
                      borderColor: topCard.card.color ? `${topCard.card.color}44` : 'rgba(6, 214, 160, 0.3)',
                    }}
                  >
                    {/* Ambient Glow */}
                    <div
                      className="absolute -top-32 -right-32 w-96 h-96 rounded-full blur-3xl pointer-events-none opacity-20"
                      style={{ backgroundColor: topCard.card.color || '#06d6a0' }}
                    />

                    <div className="relative z-10 space-y-6">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/30 text-teal-300 text-xs font-bold uppercase tracking-wider">
                          <Sparkles className="w-3.5 h-3.5" />
                          Recommended Next Card
                        </div>
                        <div className="flex items-center gap-2 text-xs font-medium text-slate-400 bg-black/40 px-3.5 py-1.5 rounded-xl border border-white/5">
                          <span>Purchase Simulator:</span>
                          <input
                            type="number"
                            placeholder="Amount ($)"
                            value={purchaseAmount || ''}
                            onChange={(e) => setPurchaseAmount(Number(e.target.value))}
                            className="w-24 bg-transparent border-b border-white/20 text-white font-bold px-1 focus:outline-none focus:border-teal-400 text-xs"
                          />
                        </div>
                      </div>

                      <div>
                        <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-white flex items-center gap-3">
                          Use <span style={{ color: topCard.card.color || '#06d6a0' }}>{topCard.card.name}</span>
                        </h2>
                        <p className="text-slate-400 text-sm sm:text-base mt-2">
                          Statement closes <strong className="text-slate-200">{formatDateShort(topCard.floatWindow.nextCloseDate)}</strong> &rarr; Payment due <strong className="text-slate-200">{formatDateShort(topCard.floatWindow.nextDueDate)}</strong>
                        </p>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
                        <div className="p-4 sm:p-5 rounded-2xl bg-black/30 border border-white/5 backdrop-blur-sm space-y-1">
                          <div className="text-2xl sm:text-4xl font-extrabold text-teal-400">
                            {topCard.floatWindow.totalFloatDays}d
                          </div>
                          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                            Total Float
                          </div>
                        </div>

                        <div className="p-4 sm:p-5 rounded-2xl bg-black/30 border border-white/5 backdrop-blur-sm space-y-1">
                          <div className="text-2xl sm:text-4xl font-extrabold text-cyan-400">
                            {topCard.floatWindow.daysUntilClose}d
                          </div>
                          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                            Until Statement Close
                          </div>
                        </div>

                        <div className="p-4 sm:p-5 rounded-2xl bg-black/30 border border-white/5 backdrop-blur-sm space-y-1">
                          <div className="text-2xl sm:text-4xl font-extrabold text-purple-400">
                            {formatCurrency(topCard.utilization.headroom)}
                          </div>
                          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                            Headroom Available
                          </div>
                        </div>

                        <div className="p-4 sm:p-5 rounded-2xl bg-black/30 border border-white/5 backdrop-blur-sm space-y-1">
                          <div className="text-2xl sm:text-4xl font-extrabold text-emerald-400">
                            {topCard.score}
                          </div>
                          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                            Optimization Score
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Ranked List */}
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-bold text-white tracking-tight">Card Rankings</h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {rankSortBy === 'float'
                          ? 'Sorted by longest interest-free float period'
                          : rankSortBy === 'score'
                          ? 'Sorted by composite optimization score (float, headroom, income alignment)'
                          : rankSortBy === 'headroom'
                          ? 'Sorted by highest available credit headroom'
                          : 'Sorted by lowest credit utilization percentage'}
                      </p>
                    </div>

                    {/* Sorting Switcher */}
                    <div className="flex items-center gap-1 p-1 rounded-xl bg-black/40 border border-white/5 self-start sm:self-auto">
                      <button
                        onClick={() => setRankSortBy('float')}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                          rankSortBy === 'float'
                            ? 'bg-teal-500 text-black shadow-md shadow-teal-500/20'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Longest Float
                      </button>
                      <button
                        onClick={() => setRankSortBy('score')}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                          rankSortBy === 'score'
                            ? 'bg-teal-500 text-black shadow-md shadow-teal-500/20'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Score
                      </button>
                      <button
                        onClick={() => setRankSortBy('headroom')}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                          rankSortBy === 'headroom'
                            ? 'bg-teal-500 text-black shadow-md shadow-teal-500/20'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Headroom
                      </button>
                      <button
                        onClick={() => setRankSortBy('utilization')}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                          rankSortBy === 'utilization'
                            ? 'bg-teal-500 text-black shadow-md shadow-teal-500/20'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Utilization
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {displayedRankings.map((item, rank) => {
                      const color = getCardColor(item.cardIndex, item.card.color);
                      return (
                        <div
                          key={item.card.id}
                          className="group p-5 rounded-2xl bg-slate-900/50 hover:bg-slate-900/80 border border-white/5 hover:border-white/10 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                        >
                          <div className="flex items-center gap-4">
                            <div
                              className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm border"
                              style={{
                                backgroundColor: rank === 0 ? `${color}22` : 'rgba(255,255,255,0.03)',
                                borderColor: rank === 0 ? `${color}55` : 'rgba(255,255,255,0.08)',
                                color: rank === 0 ? color : '#94a3b8',
                              }}
                            >
                              #{rank + 1}
                            </div>
                            <div>
                              <div className="text-base font-bold text-white flex items-center gap-2">
                                <span style={{ color }}>{item.card.name}</span>
                                {rank === 0 && (
                                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">
                                    Best Choice
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 mt-1">
                                <span>⏱ {item.floatWindow.totalFloatDays}d float</span>
                                <span>📊 {item.utilization.utilizationPct}% used</span>
                                <span>📅 Closes {formatDateShort(item.floatWindow.nextCloseDate)}</span>
                                <span>💰 Due {formatDateShort(item.floatWindow.nextDueDate)}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-6 self-end md:self-center">
                            {/* Detailed breakdown mini metrics */}
                            <div className="hidden lg:flex items-center gap-3 text-[11px] text-slate-400">
                              <span title="Float Score">Float: <strong className="text-slate-200">{item.breakdown.float}</strong></span>
                              <span>•</span>
                              <span title="Headroom Score">Headroom: <strong className="text-slate-200">{item.breakdown.headroom}</strong></span>
                              <span>•</span>
                              <span title="Cash-flow Alignment">Income: <strong className="text-slate-200">{item.breakdown.cashFlow}</strong></span>
                            </div>

                            <div className="text-right">
                              <div className="inline-flex items-center justify-center px-3.5 py-1.5 rounded-xl bg-white/5 border border-white/10 font-extrabold text-sm text-teal-400 shadow-inner">
                                {item.score} <span className="text-[10px] text-slate-400 font-normal ml-1">/ 100</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB 2: CARDS GRID & MANAGEMENT */}
        {activeTab === 'cards' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-white tracking-tight">Your Tracked Cards</h3>
                <p className="text-xs text-slate-400 mt-0.5">{cards.length} cards configured for optimization</p>
              </div>
              <button
                onClick={handleOpenAdd}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-black font-bold text-xs shadow-lg shadow-teal-500/20 transition-all"
              >
                <Plus className="w-4 h-4" />
                Add Card
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {cards.map((card, idx) => {
                const fw = calcFloatWindow(card, today);
                const util = calcUtilization(card);
                const color = getCardColor(idx, card.color);
                const isHighUtil = util.utilizationPct > (settings.targetUtil || 30);

                return (
                  <div
                    key={card.id}
                    className="group relative rounded-3xl p-6 bg-slate-900/60 hover:bg-slate-900 border border-white/5 hover:border-white/15 transition-all duration-300 flex flex-col justify-between space-y-6 shadow-xl"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-3 h-3 rounded-full shadow-[0_0_8px]"
                            style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}` }}
                          />
                          <h4 className="text-lg font-bold text-white tracking-tight">{card.name}</h4>
                        </div>
                        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleOpenEdit(card)}
                            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-all"
                            title="Edit Card"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Delete ${card.name}?`)) {
                                deleteCard(card.id);
                              }
                            }}
                            className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-all"
                            title="Delete Card"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Balance & Limit */}
                      <div className="mt-4">
                        <div className="text-2xl font-black text-white">{formatCurrency(card.balance || 0, true)}</div>
                        <div className="text-xs text-slate-400">of {formatCurrency(card.limit, false)} limit</div>
                      </div>

                      {/* Utilization Bar */}
                      <div className="mt-4 space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span className="text-slate-400">Utilization</span>
                          <span className={isHighUtil ? 'text-amber-400' : 'text-slate-300'}>
                            {util.utilizationPct}%
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.min(100, util.utilizationPct)}%`,
                              backgroundColor: util.utilizationPct > 70 ? '#ef4444' : util.utilizationPct > 40 ? '#f59e0b' : color,
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Footer Dates */}
                    <div className="pt-4 border-t border-white/5 grid grid-cols-3 gap-2 text-center">
                      <div className="p-2 rounded-xl bg-black/20">
                        <div className="text-[10px] uppercase font-bold text-slate-500">Closes</div>
                        <div className="text-xs font-bold text-slate-200 mt-0.5">{formatDateShort(fw.nextCloseDate)}</div>
                      </div>
                      <div className="p-2 rounded-xl bg-black/20">
                        <div className="text-[10px] uppercase font-bold text-slate-500">Due</div>
                        <div className="text-xs font-bold text-slate-200 mt-0.5">{formatDateShort(fw.nextDueDate)}</div>
                      </div>
                      <div className="p-2 rounded-xl bg-teal-500/10 border border-teal-500/20">
                        <div className="text-[10px] uppercase font-bold text-teal-400">Float</div>
                        <div className="text-xs font-extrabold text-teal-300 mt-0.5">{fw.totalFloatDays} days</div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Add Card Tile */}
              <button
                onClick={handleOpenAdd}
                className="h-full min-h-[240px] rounded-3xl border-2 border-dashed border-white/10 hover:border-teal-500/40 bg-slate-900/20 hover:bg-teal-500/5 transition-all duration-300 flex flex-col items-center justify-center p-8 space-y-3 group"
              >
                <div className="w-12 h-12 rounded-2xl bg-white/5 group-hover:bg-teal-500 text-slate-400 group-hover:text-black flex items-center justify-center transition-all duration-300">
                  <Plus className="w-6 h-6" />
                </div>
                <div className="text-sm font-bold text-slate-300 group-hover:text-teal-300 transition-colors">
                  Add another card
                </div>
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: 60-DAY TIMELINE & STAGGER */}
        {activeTab === 'timeline' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-white tracking-tight">60-Day Payment Timeline</h3>
                <p className="text-xs text-slate-400 mt-0.5">Projected card payment dates & paydays for cash flow alignment</p>
              </div>

              <div className="flex items-center gap-2">
                <div
                  className={`px-3.5 py-1.5 rounded-full border text-xs font-extrabold ${
                    staggerInfo.score >= 70
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : staggerInfo.score >= 40
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}
                >
                  Stagger Quality: {staggerInfo.score}%
                </div>
              </div>
            </div>

            {/* Stagger Suggestions Alert */}
            {staggerInfo.suggestions.length > 0 && (
              <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-200 text-xs flex items-start gap-3">
                <Info className="w-4 h-4 shrink-0 text-indigo-400 mt-0.5" />
                <div>
                  <div className="font-bold text-indigo-300">Due-Date Stagger Optimization:</div>
                  <ul className="list-disc list-inside mt-1 space-y-1 text-slate-300">
                    {staggerInfo.suggestions.map((sug, i) => (
                      <li key={i}>{sug}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Visual Timeline Track */}
            <div className="p-6 rounded-3xl bg-slate-900/60 border border-white/5 backdrop-blur-xl overflow-x-auto">
              <div className="min-w-[800px] py-4 relative">
                {/* Timeline axis line */}
                <div className="h-1 bg-white/10 rounded-full relative my-8" />

                {/* Day ticks & events */}
                <div className="relative h-24">
                  {outflows.map((event, idx) => {
                    const daysAway = daysBetween(today, event.date);
                    const leftPct = Math.max(0, Math.min(100, (daysAway / 60) * 100));
                    const isIncome = event.type === 'income';

                    return (
                      <div
                        key={idx}
                        className="absolute -top-6 transform -translate-x-1/2 flex flex-col items-center group cursor-pointer"
                        style={{ left: `${leftPct}%` }}
                      >
                        {/* Event Pin */}
                        <div
                          className="px-2.5 py-1 rounded-lg text-[10px] font-bold shadow-lg border whitespace-nowrap transition-transform group-hover:scale-110"
                          style={{
                            backgroundColor: isIncome ? '#06d6a022' : `${event.color}22`,
                            borderColor: isIncome ? '#06d6a066' : `${event.color}66`,
                            color: isIncome ? '#06d6a0' : event.color,
                          }}
                        >
                          {isIncome ? '💰 Payday' : event.cardName}
                          <div className="text-[9px] opacity-80">{formatDateShort(event.date)}</div>
                        </div>

                        {/* Line to axis */}
                        <div
                          className="w-0.5 h-6 my-1"
                          style={{ backgroundColor: isIncome ? '#06d6a0' : event.color }}
                        />

                        {/* Dot on axis */}
                        <div
                          className="w-2.5 h-2.5 rounded-full border-2 border-slate-950"
                          style={{ backgroundColor: isIncome ? '#06d6a0' : event.color }}
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-between text-[11px] text-slate-500 font-semibold pt-4 border-t border-white/5">
                  <span>Today ({formatDateShort(today)})</span>
                  <span>+30 Days ({formatDateShort(addDays(today, 30))})</span>
                  <span>+60 Days ({formatDateShort(addDays(today, 60))})</span>
                </div>
              </div>
            </div>

            {/* Outflow Table */}
            <div className="rounded-3xl bg-slate-900/40 border border-white/5 overflow-hidden">
              <div className="p-5 border-b border-white/5 font-bold text-white text-sm">
                Projected Events (Next 60 Days)
              </div>
              <div className="divide-y divide-white/5">
                {outflows.map((event, idx) => {
                  const daysAway = daysBetween(today, event.date);
                  const isIncome = event.type === 'income';

                  return (
                    <div
                      key={idx}
                      className="p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: isIncome ? '#06d6a0' : event.color }}
                        />
                        <div>
                          <div className="font-bold text-white">
                            {event.cardName} {isIncome ? '(Income)' : '(Statement Payment)'}
                          </div>
                          <div className="text-[11px] text-slate-400">{formatDateFull(event.date)}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <div className={`font-bold ${isIncome ? 'text-teal-400' : 'text-slate-200'}`}>
                            {isIncome ? `+${formatCurrencyPrecise(event.amount)}` : formatCurrencyPrecise(event.amount)}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {daysAway === 0 ? 'Today' : `in ${daysAway} days`}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: SETTINGS & DATA */}
        {activeTab === 'settings' && (
          <div className="max-w-4xl space-y-8">
            <div>
              <h3 className="text-xl font-bold text-white tracking-tight">Float Optimization Settings</h3>
              <p className="text-xs text-slate-400 mt-0.5">Customize your cash flow cadence, spending baseline, and alert thresholds</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Income Streams (from Dashboard) */}
              <div className="p-6 rounded-3xl bg-slate-900/60 border border-white/5 space-y-4">
                <div className="flex items-center justify-between font-bold text-white text-sm">
                  <div className="flex items-center gap-2">
                    <span>💰</span> Dashboard Income Schedule
                  </div>
                  <button
                    onClick={() => syncFromDashboard()}
                    disabled={isLoading}
                    className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1 font-semibold"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                    Re-sync
                  </button>
                </div>
                <p className="text-xs text-slate-400">
                  Synchronized with your Dashboard paycheck & Social Security deposit schedule.
                </p>
                <div className="space-y-2">
                  {(settings.incomeStreams || []).map((stream, idx) => (
                    <div key={idx} className="p-3 rounded-2xl bg-black/30 border border-white/5 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold text-white">{stream.name}</div>
                        <div className="text-[10px] text-slate-400">
                          {stream.type === 'biweekly-paycheck'
                            ? 'Bi-weekly on Fridays'
                            : stream.type === 'fourth-wednesday'
                            ? '4th Wednesday of each month'
                            : `Day ${stream.dayOfMonth} monthly`}
                        </div>
                      </div>
                      <div className="text-xs font-extrabold text-teal-400">
                        {formatCurrencyPrecise(stream.amount)}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-white/5">
                  <div className="text-[11px] font-semibold text-slate-400 mb-2">Additional custom payday:</div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="31"
                      placeholder="Day (1–31)"
                      value={newPayday}
                      onChange={(e) => setNewPayday(e.target.value)}
                      className="w-28 px-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-white text-xs focus:outline-none focus:border-teal-400"
                    />
                    <button
                      onClick={handleAddPayday}
                      className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-all"
                    >
                      Add
                    </button>
                  </div>
                  {settings.payDays.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-2">
                      {settings.payDays.map((d) => (
                        <span
                          key={d}
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-teal-500/10 border border-teal-500/30 text-teal-300 text-[10px] font-bold"
                        >
                          {ordinal(d)}
                          <button
                            onClick={() => handleRemovePayday(d)}
                            className="hover:text-rose-400 transition-colors ml-0.5"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Monthly Spend */}
              <div className="p-6 rounded-3xl bg-slate-900/60 border border-white/5 space-y-4">
                <div className="flex items-center gap-2 font-bold text-white text-sm">
                  <span>🛒</span> Monthly Spend
                </div>
                <p className="text-xs text-slate-400">Estimated monthly card spending for outflow simulations.</p>
                <input
                  type="number"
                  step="100"
                  min="0"
                  value={settings.monthlySpend || ''}
                  onChange={(e) => updateSettings({ monthlySpend: Number(e.target.value) || 0 })}
                  className="w-full px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:border-teal-400"
                  placeholder="$3,000"
                />
              </div>

              {/* Cash Buffer */}
              <div className="p-6 rounded-3xl bg-slate-900/60 border border-white/5 space-y-4">
                <div className="flex items-center gap-2 font-bold text-white text-sm">
                  <span>🛡</span> Minimum Cash Buffer
                </div>
                <p className="text-xs text-slate-400">Alert threshold for reserve cash during outflows.</p>
                <input
                  type="number"
                  step="100"
                  min="0"
                  value={settings.cashBuffer || ''}
                  onChange={(e) => updateSettings({ cashBuffer: Number(e.target.value) || 0 })}
                  className="w-full px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:border-teal-400"
                  placeholder="$1,000"
                />
              </div>

              {/* Target Utilization */}
              <div className="p-6 rounded-3xl bg-slate-900/60 border border-white/5 space-y-4">
                <div className="flex items-center justify-between font-bold text-white text-sm">
                  <div className="flex items-center gap-2">
                    <span>📊</span> Target Utilization
                  </div>
                  <span className="text-teal-400">{settings.targetUtil || 30}%</span>
                </div>
                <p className="text-xs text-slate-400">Keep individual card balances under this percentage of their limit.</p>
                <input
                  type="range"
                  min="5"
                  max="100"
                  step="5"
                  value={settings.targetUtil || 30}
                  onChange={(e) => updateSettings({ targetUtil: Number(e.target.value) })}
                  className="w-full accent-teal-400 cursor-pointer"
                />
              </div>

              {/* Alert & Notification Preferences */}
              <div className="p-6 rounded-3xl bg-slate-900/60 border border-white/5 space-y-4 md:col-span-2">
                <div className="flex items-center justify-between font-bold text-white text-sm">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-teal-400" />
                    Alert & Risk Notification Preferences
                  </div>
                  <div className="text-xs text-slate-400 font-semibold bg-black/30 px-3 py-1 rounded-full border border-white/5">
                    {5 - (settings.disabledAlerts?.length || 0)} of 5 active
                  </div>
                </div>
                <p className="text-xs text-slate-400">
                  Select which real-time warnings and risk flags you want to see. Click any alert card to enable or disable.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                  {ALERT_DEFINITIONS.map((alert) => {
                    const isEnabled = !settings.disabledAlerts?.includes(alert.id);
                    return (
                      <div
                        key={alert.id}
                        onClick={() => toggleAlert(alert.id)}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-start justify-between gap-3 select-none ${
                          isEnabled
                            ? 'bg-black/30 border-white/10 hover:border-teal-500/40 shadow-sm'
                            : 'bg-black/10 border-white/5 opacity-50 hover:opacity-75'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{alert.icon}</span>
                            <span className={`text-xs font-bold ${isEnabled ? 'text-white' : 'text-slate-400 line-through'}`}>
                              {alert.label}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 leading-relaxed">{alert.desc}</p>
                        </div>

                        <div
                          className={`w-11 h-6 rounded-full p-1 transition-colors shrink-0 mt-0.5 ${
                            isEnabled ? 'bg-teal-500 shadow-md shadow-teal-500/20' : 'bg-slate-800'
                          }`}
                        >
                          <div
                            className={`w-4 h-4 rounded-full bg-white transition-transform ${
                              isEnabled ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Data Management */}
            <div className="p-6 rounded-3xl bg-slate-900/60 border border-white/5 space-y-4">
              <div className="font-bold text-white text-sm">💾 Data & Backup</div>
              <p className="text-xs text-slate-400">Export your configured cards and settings or restore from a JSON backup.</p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleExport}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-xs font-semibold transition-all"
                >
                  <Download className="w-4 h-4 text-teal-400" />
                  Export Data (JSON)
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-xs font-semibold transition-all"
                >
                  <Upload className="w-4 h-4 text-cyan-400" />
                  Import Data (JSON)
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".json"
                  onChange={handleImport}
                  className="hidden"
                />
                <button
                  onClick={() => syncFromDashboard()}
                  disabled={isLoading}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-xs font-semibold transition-all"
                >
                  <RefreshCw className={`w-4 h-4 text-indigo-400 ${isLoading ? 'animate-spin' : ''}`} />
                  {isLoading ? 'Syncing from Dashboard...' : 'Sync from Dashboard'}
                </button>
                <button
                  onClick={() => {
                    if (confirm('Are you sure you want to reset Float cards to Dashboard default?')) {
                      resetToDefaults();
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-semibold transition-all"
                >
                  <Trash2 className="w-4 h-4 text-rose-400" />
                  Reset to Dashboard
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ADD / EDIT CARD MODAL */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-3xl bg-slate-900 border border-white/10 p-6 sm:p-8 space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white tracking-tight">
                {editingCard ? 'Edit Card' : 'Add New Card'}
              </h3>
              <button
                onClick={() => setIsFormOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveCard} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Card Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Chase Sapphire, Amex Gold"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:border-teal-400"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Statement Closing Day
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    placeholder="1–31"
                    value={formData.closingDay}
                    onChange={(e) => setFormData({ ...formData, closingDay: Number(e.target.value) })}
                    className="w-full px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:border-teal-400"
                  />
                  <span className="text-[10px] text-slate-500">Day of month</span>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Grace Period (Days)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    placeholder="25"
                    value={formData.graceDays}
                    onChange={(e) => setFormData({ ...formData, graceDays: Number(e.target.value) })}
                    className="w-full px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:border-teal-400"
                  />
                  <span className="text-[10px] text-slate-500">Typically 21–25 days</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Current Balance ($)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={formData.balance}
                    onChange={(e) => setFormData({ ...formData, balance: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:border-teal-400"
                  />
                  <span className="text-[10px] text-slate-500">Supports decimals (e.g. 45.50)</span>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Credit Limit ($)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="5,000"
                    value={formData.limit}
                    onChange={(e) => setFormData({ ...formData, limit: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:border-teal-400"
                  />
                  <span className="text-[10px] text-slate-500">Accepts 14,100 or 14100</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    APR % <span className="text-slate-500 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="22.5"
                    value={formData.apr}
                    onChange={(e) => setFormData({ ...formData, apr: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:border-teal-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Accent Color
                  </label>
                  <div className="flex items-center gap-2 pt-1">
                    {CARD_COLORS.slice(0, 6).map((c) => (
                      <button
                        type="button"
                        key={c}
                        onClick={() => setFormData({ ...formData, color: c })}
                        className={`w-6 h-6 rounded-full transition-transform ${
                          formData.color === c ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-slate-900' : 'opacity-70 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-semibold text-xs transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-black font-bold text-xs shadow-lg shadow-teal-500/20 transition-all"
                >
                  {editingCard ? 'Save Changes' : 'Add Card'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
