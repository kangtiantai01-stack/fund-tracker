'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Holding, HoldingDisplay, Transaction, ViewMode, FundRealtimeData } from '@/lib/types';
import { INITIAL_HOLDINGS } from '@/lib/types';
import {
  loadHoldings, saveHoldings, loadTransactions, saveTransactions,
  loadPortfolioFromBackend, loadTransactionsFromBackend,
  addTransaction, deleteTransaction, saveDailySnapshot,
} from '@/lib/store';
import AssetSummary from '@/components/AssetSummary';
import HoldingList from '@/components/HoldingList';
import TransactionForm from '@/components/TransactionForm';
import TransactionHistory from '@/components/TransactionHistory';
import FundRanking from '@/components/FundRanking';
import SectorBoard from '@/components/SectorBoard';
import AIImageRecognizer from '@/components/AIImageRecognizer';
import PortfolioPieChart from '@/components/PortfolioPieChart';
import FundDetailDrawer from '@/components/FundDetailDrawer';
import DailyCalendar from '@/components/DailyCalendar';

// 1️⃣ 从类型定义中移除 'trend'
type MainTab = 'holdings' | 'ranking' | 'sector' | 'transactions' | 'calendar';

/** 判断当前是否为盘中交易时间（工作日 9:30-15:00） */
function isInTradingHours(): boolean {
  const now = new Date();
  const day = now.getDay();
  if (day === 0 || day === 6) return false;
  const h = now.getHours();
  const m = now.getMinutes();
  const minutes = h * 60 + m;
  return minutes >= 570 && minutes <= 900;
}

function computeHoldingDisplay(h: Holding): HoldingDisplay {
  const holdingAmount = h.shares * h.latestNav;
  const costAmount = h.shares * h.costPrice;
  const holdingProfit = holdingAmount - costAmount;
  const holdingProfitRate = costAmount > 0 ? (holdingProfit / costAmount) * 100 : 0;
  const dailyChangeAmount = h.shares * (h.latestNav - h.yesterdayNav);

  return { ...h, holdingAmount, costAmount, holdingProfit, holdingProfitRate, dailyChangeAmount };
}

async function fetchFundData(code: string): Promise<FundRealtimeData | null> {
  try {
    const res = await fetch(`/api/fund/${code}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.error) return null;
    return data as FundRealtimeData;
  } catch {
    return null;
  }
}

// 2️⃣ 定义 TABS，移除 'trend' 对应的项
const TABS: { key: MainTab; label: string }[] = [
  { key: 'holdings', label: '我的持仓' },
  { key: 'ranking', label: '基金排行' },
  { key: 'sector', label: '板块涨跌' },
  { key: 'transactions', label: '交易记录' },
  // { key: 'trend', label: '收益走势' },  // 已删除
  { key: 'calendar', label: '每日盈亏' },
];

export default function HomePage() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [lastRefresh, setLastRefresh] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mainTab, setMainTab] = useState<MainTab>('holdings');
  const [showAIRecognizer, setShowAIRecognizer] = useState(false);
  const [selectedFundCode, setSelectedFundCode] = useState<string | null>(null);
  const initializedRef = useRef(false);

  // 初始化数据（后端优先，localStorage 兼容迁移）
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const init = async () => {
      // 尝试从后端加载持仓
      const backendHoldings = await loadPortfolioFromBackend();
      const backendTransactions = await loadTransactionsFromBackend();

      if (backendHoldings && backendHoldings.length > 0) {
        setHoldings(backendHoldings);
      } else {
        // 后端无数据，从 localStorage 加载
        const storedHoldings = loadHoldings();
        if (storedHoldings.length > 0) {
          setHoldings(storedHoldings);
          // 迁移到后端
          saveHoldings(storedHoldings);
        } else {
          const initialHoldings: Holding[] = INITIAL_HOLDINGS.map((h) => ({
            ...h, latestNav: 0, yesterdayNav: 0, dailyChangeRate: 0, updateTime: '', isEstimated: false,
          }));
          setHoldings(initialHoldings);
          saveHoldings(initialHoldings);
        }
      }

      if (backendTransactions && backendTransactions.length > 0) {
        setTransactions(backendTransactions);
      } else {
        const storedTransactions = loadTransactions();
        setTransactions(storedTransactions);
        // 迁移到后端
        if (storedTransactions.length > 0) {
          for (const t of storedTransactions) {
            await addTransaction(t);
          }
        }
      }

      setLoading(false);
    };

    init();
  }, []);

  // 刷新基金数据
  const refreshFundData = useCallback(async () => {
    if (holdings.length === 0) return;

    setRefreshing(true);
    const codes = holdings.map((h) => h.code);
    const updatedHoldings = [...holdings];

    const results = await Promise.allSettled(codes.map((code) => fetchFundData(code)));

    results.forEach((result, idx) => {
      if (result.status === 'fulfilled' && result.value) {
        const data = result.value;
        const gsz = parseFloat(data.gsz);
        const dwjz = parseFloat(data.dwjz);
        const gszzl = parseFloat(data.gszzl);
        const h = updatedHoldings[idx];

        const hasEstimate = !isNaN(gsz) && gsz > 0 && !isNaN(gszzl) && data.gztime;
        const isTodayEstimate = hasEstimate && data.gztime && data.gztime.includes(new Date().toISOString().slice(0, 10));

        if (isTodayEstimate) {
          h.latestNav = gsz;
          h.dailyChangeRate = gszzl;
          h.isEstimated = true;
        } else {
          h.latestNav = dwjz || h.latestNav;
          h.dailyChangeRate = gszzl || 0;
          h.isEstimated = false;
        }

        h.yesterdayNav = dwjz || h.yesterdayNav;
        h.updateTime = data.gztime || '';
        h.name = data.name || h.name;
      }
    });

    setHoldings(updatedHoldings);
    saveHoldings(updatedHoldings);
    setLastRefresh(new Date().toLocaleTimeString('zh-CN'));
    setRefreshing(false);

    // 每日首次刷新时记录快照
    saveDailySnapshot(updatedHoldings);
  }, [holdings]);

  // 首次加载和智能自动刷新
  useEffect(() => {
    if (holdings.length === 0 || loading) return;

    refreshFundData();

    const getInterval = () => isInTradingHours() ? 3 * 60 * 1000 : 30 * 60 * 1000;
    let interval = setInterval(refreshFundData, getInterval());

    const checkInterval = setInterval(() => {
      clearInterval(interval);
      interval = setInterval(refreshFundData, getInterval());
    }, 60000);

    return () => {
      clearInterval(interval);
      clearInterval(checkInterval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdings.length, loading]);

  // 处理交易完成
  const handleTransactionComplete = (newHoldings: Holding[], newTransactions: Transaction[]) => {
    setHoldings(newHoldings);
    setTransactions(newTransactions);
    if (newTransactions.length > transactions.length) {
      const lastTx = newTransactions[newTransactions.length - 1];
      addTransaction(lastTx);
    }
    setTimeout(() => refreshFundData(), 500);
  };

  // 持仓同步
  const handleHoldingsSync = (newHoldings: Holding[]) => {
    setHoldings(newHoldings);
    setTimeout(() => refreshFundData(), 500);
  };

  // 删除持仓
  const handleDeleteHolding = (code: string) => {
    const updated = holdings.filter((h) => h.code !== code);
    setHoldings(updated);
    saveHoldings(updated);
  };

  // 删除交易记录
  const handleDeleteTransaction = async (id: string) => {
    const updated = transactions.filter((t) => t.id !== id);
    setTransactions(updated);
    saveTransactions(updated);
    await deleteTransaction(id);
  };

  // 计算展示数据
  const displayHoldings: HoldingDisplay[] = holdings
    .filter((h) => h.latestNav > 0)
    .map(computeHoldingDisplay);

  const pendingHoldings = holdings.filter((h) => h.latestNav === 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0c0f1a]">
        <div className="text-[#6b7a8d] text-sm">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0c0f1a]">
      {/* 顶部导航 */}
      <header className="sticky top-0 z-20 bg-[#0c0f1a]/80 backdrop-blur-md border-b border-white/[0.06]">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-[#3b82f6]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            <h1 className="text-[#e8ecf1] text-lg font-bold">基金持仓跟踪</h1>
          </div>
          <div className="flex items-center gap-3">
            {lastRefresh && (
              <span className="text-[10px] text-[#6b7a8d] tabular-nums">
                {refreshing ? '刷新中...' : `更新于 ${lastRefresh}`}
              </span>
            )}
            <button
              onClick={refreshFundData}
              disabled={refreshing}
              className="text-[#3b82f6] hover:text-[#60a5fa] transition-colors disabled:opacity-50"
              title="手动刷新"
            >
              <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* 主内容 */}
      <main className="max-w-5xl mx-auto px-4 py-4 space-y-4 pb-8">
        {/* 资产总览 - 所有tab可见 */}
        {displayHoldings.length > 0 && (
          <AssetSummary holdings={displayHoldings} />
        )}

        {/* 主Tab导航 - 已移除收益走势 */}
        <div className="flex flex-wrap gap-1 bg-[#161b2e] rounded-xl border border-white/[0.06] p-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setMainTab(tab.key)}
              className={`flex-1 min-w-[60px] py-2 text-sm rounded-lg transition-colors font-medium ${
                mainTab === tab.key
                  ? 'bg-[#3b82f6] text-white'
                  : 'text-[#6b7a8d] hover:text-[#e8ecf1]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab内容 */}
        {mainTab === 'holdings' && (
          <>
            {/* 持仓占比图 */}
            {displayHoldings.length > 0 && <PortfolioPieChart holdings={displayHoldings} />}

            {/* 加载中的持仓 */}
            {pendingHoldings.length > 0 && (
              <div className="rounded-xl bg-[#161b2e] border border-white/[0.06] p-4 text-center">
                <div className="flex items-center justify-center gap-2 text-[#6b7a8d] text-sm">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  正在获取 {pendingHoldings.length} 只基金的实时数据...
                </div>
              </div>
            )}

            {/* 持仓列表 */}
            <HoldingList
              holdings={displayHoldings}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              onDeleteHolding={handleDeleteHolding}
              onSelectFund={setSelectedFundCode}
            />

            {/* 交易 & AI识图入口按钮 */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowAIRecognizer(false)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors border ${
                  !showAIRecognizer
                    ? 'bg-[#3b82f6] text-white border-[#3b82f6]'
                    : 'bg-[#161b2e] text-[#6b7a8d] border-white/[0.06] hover:text-[#e8ecf1]'
                }`}
              >
                新增交易
              </button>
              <button
                onClick={() => setShowAIRecognizer(true)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors border ${
                  showAIRecognizer
                    ? 'bg-[#8b5cf6] text-white border-[#8b5cf6]'
                    : 'bg-[#161b2e] text-[#6b7a8d] border-white/[0.06] hover:text-[#e8ecf1]'
                }`}
              >
                <span className="flex items-center justify-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  AI识图
                </span>
              </button>
            </div>

            {/* 交易表单 or AI识图 */}
            {showAIRecognizer ? (
              <AIImageRecognizer
                holdings={holdings}
                onTransactionComplete={handleTransactionComplete}
                onHoldingsSync={handleHoldingsSync}
                transactions={transactions}
              />
            ) : (
              <TransactionForm
                holdings={holdings}
                onTransactionComplete={handleTransactionComplete}
                transactions={transactions}
              />
            )}

            {/* 交易记录 */}
            <TransactionHistory />
          </>
        )}

        {mainTab === 'ranking' && <FundRanking />}
        {mainTab === 'sector' && <SectorBoard />}

        {mainTab === 'transactions' && (
          <div className="rounded-xl bg-[#161b2e] border border-white/[0.06] p-4">
            <h2 className="text-[#e8ecf1] text-base font-semibold mb-3">全部交易记录</h2>
            {transactions.length === 0 ? (
              <div className="text-center py-8 text-[#6b7a8d] text-sm">暂无交易记录</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className="text-left text-[#6b7a8d] font-medium p-2">日期</th>
                      <th className="text-left text-[#6b7a8d] font-medium p-2">基金名称</th>
                      <th className="text-center text-[#6b7a8d] font-medium p-2">方向</th>
                      <th className="text-right text-[#6b7a8d] font-medium p-2">金额</th>
                      <th className="text-right text-[#6b7a8d] font-medium p-2">净值</th>
                      <th className="text-right text-[#6b7a8d] font-medium p-2">份额</th>
                      <th className="text-right text-[#6b7a8d] font-medium p-2">手续费</th>
                      <th className="text-center text-[#6b7a8d] font-medium p-2">平台</th>
                      <th className="text-center text-[#6b7a8d] font-medium p-2">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions
                      .slice()
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .map((tx) => (
                        <tr key={tx.id} className="border-b border-white/[0.04] hover:bg-[#1a2038] transition-colors">
                          <td className="p-2 text-[#e8ecf1] tabular-nums">{tx.date}</td>
                          <td className="p-2">
                            <p className="text-[#e8ecf1]">{tx.fundName}</p>
                            <p className="text-[#6b7a8d] text-[10px]">{tx.fundCode}</p>
                          </td>
                          <td className="p-2 text-center">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              tx.direction === 'buy'
                                ? 'bg-[#e54d42]/20 text-[#e54d42]'
                                : 'bg-[#07c160]/20 text-[#07c160]'
                            }`}>
                              {tx.direction === 'buy' ? '买入' : '卖出'}
                            </span>
                          </td>
                          <td className="p-2 text-right text-[#e8ecf1] tabular-nums">
                            {tx.amount.toFixed(2)}
                          </td>
                          <td className="p-2 text-right text-[#6b7a8d] tabular-nums">
                            {tx.nav ? tx.nav.toFixed(4) : '-'}
                          </td>
                          <td className="p-2 text-right text-[#6b7a8d] tabular-nums">
                            {tx.shares ? tx.shares.toFixed(2) : '-'}
                          </td>
                          <td className="p-2 text-right text-[#6b7a8d] tabular-nums">
                            {tx.fee ? tx.fee.toFixed(2) : '-'}
                          </td>
                          <td className="p-2 text-center text-[#6b7a8d]">{tx.platform}</td>
                          <td className="p-2 text-center">
                            <button
                              onClick={() => handleDeleteTransaction(tx.id)}
                              className="text-[#e54d42]/70 hover:text-[#e54d42] text-[10px] transition-colors"
                            >
                              删除
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 3️⃣ 移除了 ReturnTrendChart 对应的代码块 */}

        {mainTab === 'calendar' && (
          <DailyCalendar />
        )}
      </main>

      {/* 基金详情抽屉 */}
      {selectedFundCode && (
        <FundDetailDrawer
          fundCode={selectedFundCode}
          holdings={holdings}
          transactions={transactions}
          onClose={() => setSelectedFundCode(null)}
        />
      )}
    </div>
  );
}
