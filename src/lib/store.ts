import type { Holding, Transaction } from './types';

const USER_ID_KEY = 'fund_tracker_user_id';
const HOLDINGS_KEY = 'fund_tracker_holdings';
const TRANSACTIONS_KEY = 'fund_tracker_transactions';

// ====== 用户ID管理 ======
export function getUserId(): string {
  if (typeof window === 'undefined') return 'server';
  let userId = localStorage.getItem(USER_ID_KEY);
  if (!userId) {
    userId = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(USER_ID_KEY, userId);
  }
  return userId;
}

// ====== 持仓（双写：localStorage + 后端） ======
export function loadHoldings(): Holding[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem(HOLDINGS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Holding[];
  } catch {
    return [];
  }
}

export function saveHoldings(holdings: Holding[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(HOLDINGS_KEY, JSON.stringify(holdings));
  // 异步同步到后端
  syncPortfolioToBackend(holdings);
}

async function syncPortfolioToBackend(holdings: Holding[]) {
  try {
    const userId = getUserId();
    await fetch('/api/portfolio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, holdings }),
    });
  } catch (e) {
    console.warn('后端同步持仓失败，数据仅存在本地:', e);
  }
}

export async function loadPortfolioFromBackend(): Promise<Holding[] | null> {
  try {
    const userId = getUserId();
    const res = await fetch(`/api/portfolio?userId=${userId}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.holdings && data.holdings.length > 0) {
      return data.holdings as Holding[];
    }
    return null;
  } catch {
    return null;
  }
}

// ====== 交易记录（双写） ======
export function loadTransactions(): Transaction[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem(TRANSACTIONS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Transaction[];
  } catch {
    return [];
  }
}

export function saveTransactions(transactions: Transaction[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(transactions));
}

export async function addTransaction(transaction: Transaction): Promise<boolean> {
  try {
    const userId = getUserId();
    const res = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, transaction }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function loadTransactionsFromBackend(): Promise<Transaction[] | null> {
  try {
    const userId = getUserId();
    const res = await fetch(`/api/transactions?userId=${userId}&pageSize=200`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.transactions && data.transactions.length > 0) {
      return data.transactions.map((t: Record<string, unknown>) => ({
        id: t.id as string,
        fundCode: t.fund_code as string,
        fundName: t.fund_name as string,
        direction: t.direction as string,
        amount: parseFloat(t.amount as string),
        shares: t.shares ? parseFloat(t.shares as string) : undefined,
        nav: t.nav ? parseFloat(t.nav as string) : undefined,
        fee: t.fee ? parseFloat(t.fee as string) : undefined,
        feeRate: t.fee_rate ? parseFloat(t.fee_rate as string) : undefined,
        platform: t.platform as string,
        before15: t.before15 as boolean,
        transactionDate: t.transaction_date as string,
        confirmDate: t.confirm_date as string,
      })) as Transaction[];
    }
    return null;
  } catch {
    return null;
  }
}

export async function deleteTransaction(id: string | number): Promise<boolean> {
  try {
    const userId = getUserId();
    const res = await fetch(`/api/transactions/${id}?userId=${userId}`, {
      method: 'DELETE',
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ====== 每日快照 ======
export async function saveDailySnapshot(holdings: Holding[]) {
  try {
    const userId = getUserId();
    const totalAssets = holdings.reduce((sum, h) => sum + (h.shares || 0) * (h.latestNav || 0), 0);
    const totalCost = holdings.reduce((sum, h) => sum + (h.shares || 0) * (h.costPrice || 0), 0);
    const totalReturn = totalAssets - totalCost;

    await fetch('/api/snapshots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, totalAssets, totalReturn, dailyReturn: 0, holdings }),
    });
  } catch {
    // 快照失败不影响主流程
  }
}

export async function loadSnapshots(days = 90): Promise<{ snapshot_date: string; total_assets: number; total_return: number }[]> {
  try {
    const userId = getUserId();
    const res = await fetch(`/api/snapshots?userId=${userId}&days=${days}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.snapshots || []).map((s: Record<string, unknown>) => ({
      snapshot_date: s.snapshot_date as string,
      total_assets: parseFloat(s.total_assets as string),
      total_return: parseFloat(s.total_return as string),
    }));
  } catch {
    return [];
  }
}

// ====== 增量数据迁移（localStorage → 后端） ======
export async function migrateLocalData() {
  const localHoldings = loadHoldings();
  const localTransactions = loadTransactions();

  if (localHoldings.length > 0) {
    const backendData = await loadPortfolioFromBackend();
    if (!backendData || backendData.length === 0) {
      // 后端无数据，上传本地数据
      await syncPortfolioToBackend(localHoldings);
    }
  }

  if (localTransactions.length > 0) {
    const backendData = await loadTransactionsFromBackend();
    if (!backendData || backendData.length === 0) {
      // 批量上传本地交易记录
      for (const t of localTransactions) {
        await addTransaction(t);
      }
    }
  }
}

// ====== 工具函数 ======
export function calculateSellFee(shares: number, nav: number, buyDate: string, sellDate: string): number {
  const buy = new Date(buyDate);
  const sell = new Date(sellDate);
  const daysHeld = Math.floor((sell.getTime() - buy.getTime()) / (1000 * 60 * 60 * 24));
  let feeRate = 0;
  if (daysHeld < 7) feeRate = 0.015;
  else if (daysHeld < 30) feeRate = 0.005;
  else if (daysHeld < 365) feeRate = 0.0025;
  else if (daysHeld < 730) feeRate = 0.0015;
  else feeRate = 0;
  return Math.round(shares * nav * feeRate * 100) / 100;
}

/** 获取卖出手续费率（可传入天数或两个日期字符串） */
export function getSellFeeRate(daysOrBuy: number | string, sellDate?: string): number {
  let daysHeld: number;
  if (typeof daysOrBuy === 'number') {
    daysHeld = daysOrBuy;
  } else if (sellDate) {
    const buy = new Date(daysOrBuy);
    const sell = new Date(sellDate);
    daysHeld = Math.floor((sell.getTime() - buy.getTime()) / (1000 * 60 * 60 * 24));
  } else {
    return 0;
  }
  if (daysHeld < 7) return 0.015;
  if (daysHeld < 30) return 0.005;
  if (daysHeld < 365) return 0.0025;
  if (daysHeld < 730) return 0.0015;
  return 0;
}

/** 计算持有天数（可传入日期字符串，自动计算到今天的天数；或传入两个日期） */
export function calcHoldDays(dateOrBuy: string, sellDate?: string): number {
  const buy = new Date(dateOrBuy);
  const sell = sellDate ? new Date(sellDate) : new Date();
  return Math.floor((sell.getTime() - buy.getTime()) / (1000 * 60 * 60 * 24));
}

/** 格式化份额（不补零保留两位小数） */
export function formatShares(val: number | string | undefined | null): string {
  if (val === undefined || val === null) return '0';
  const n = typeof val === 'string' ? parseFloat(val) : val;
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatMoney(val: number | string | undefined | null): string {
  if (val === undefined || val === null) return '0.00';
  const n = typeof val === 'string' ? parseFloat(val) : val;
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatPercent(val: number | string | undefined | null): string {
  if (val === undefined || val === null) return '0.00%';
  const n = typeof val === 'string' ? parseFloat(val) : val;
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

export function isInTradingHours(): boolean {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  const total = h * 60 + m;
  return total >= 570 && total < 900; // 9:30 - 15:00
}