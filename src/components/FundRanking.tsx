'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Zap } from 'lucide-react';
import type { FundRankItem } from '@/lib/types';
import { formatPercent } from '@/lib/store';

type SortOrder = 'top' | 'bottom';
type FundFilter = 'all' | 'gp' | 'hh' | 'zq' | 'zs' | 'qdii' | 'fof';

const FUND_FILTERS: { key: FundFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'gp', label: '股票型' },
  { key: 'hh', label: '混合型' },
  { key: 'zq', label: '债券型' },
  { key: 'zs', label: '指数型' },
  { key: 'qdii', label: 'QDII' },
  { key: 'fof', label: 'FOF' },
];

/** 判断当前是否在盘中交易时间 (9:30-15:00) */
function isInTradingHours(): boolean {
  const now = new Date();
  const day = now.getDay();
  if (day === 0 || day === 6) return false;
  const h = now.getHours();
  const m = now.getMinutes();
  const minutes = h * 60 + m;
  return minutes >= 570 && minutes <= 900;
}

/** 估算标识组件 */
function EstimateTag({ isEstimated, estimateTime }: { isEstimated: boolean; estimateTime: string | null }) {
  if (isEstimated) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[9px] text-amber-400/80">
        <Zap className="w-2.5 h-2.5" />
        估算
      </span>
    );
  }
  return (
    <span className="text-[9px] text-[#6b7a8d]">收盘</span>
  );
}

export default function FundRanking() {
  const [funds, setFunds] = useState<FundRankItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortOrder, setSortOrder] = useState<SortOrder>('top');
  const [fundFilter, setFundFilter] = useState<FundFilter>('gp');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isTrading, setIsTrading] = useState(false);
  const pageSize = 50;
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRanking = useCallback(async (p: number, order: SortOrder, filter: FundFilter) => {
    setLoading(true);
    try {
      const orderParam = order === 'top' ? 'desc' : 'asc';
      const res = await fetch(`/api/fund-ranking?page=${p}&size=${pageSize}&sort=rzdf&order=${orderParam}&type=${filter}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.funds) {
        setFunds(data.funds);
        setTotal(data.total || 0);
        setIsTrading(data.isTradingHours ?? false);
      }
    } catch {
      // 静默失败
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRanking(page, sortOrder, fundFilter);
  }, [page, sortOrder, fundFilter, fetchRanking]);

  // 智能刷新：盘中3分钟，非交易时间10分钟
  useEffect(() => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
    }
    const interval = setInterval(() => {
      const trading = isInTradingHours();
      setIsTrading(trading);
      fetchRanking(page, sortOrder, fundFilter);
    }, isInTradingHours() ? 180000 : 600000);
    refreshTimerRef.current = interval;
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [page, sortOrder, fundFilter, fetchRanking]);

  const totalPages = Math.ceil(total / pageSize);

  // 有任何基金是估算数据时显示免责
  const hasEstimated = funds.some((f) => f.isEstimated);

  return (
    <div className="rounded-xl bg-[#161b2e] border border-white/[0.06] overflow-hidden">
      {/* 标题栏 */}
      <div className="p-4 border-b border-white/[0.06]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-[#e8ecf1] text-base font-semibold">基金排行榜</h2>
            {isTrading && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-500/15 text-[9px] text-amber-400">
                <Zap className="w-2.5 h-2.5" />
                实时
              </span>
            )}
          </div>
          <span className="text-[#6b7a8d] text-[10px]">共 {total.toLocaleString()} 只基金</span>
        </div>
        {/* 涨幅榜/跌幅榜 切换 */}
        <div className="flex bg-[#0c0f1a] rounded-lg p-0.5 mb-3">
          <button
            onClick={() => { setSortOrder('top'); setPage(1); }}
            className={`flex-1 py-1.5 text-xs rounded-md transition-colors font-medium ${
              sortOrder === 'top'
                ? 'bg-[#e54d42] text-white'
                : 'text-[#6b7a8d] hover:text-[#e8ecf1]'
            }`}
          >
            涨幅榜
          </button>
          <button
            onClick={() => { setSortOrder('bottom'); setPage(1); }}
            className={`flex-1 py-1.5 text-xs rounded-md transition-colors font-medium ${
              sortOrder === 'bottom'
                ? 'bg-[#07c160] text-white'
                : 'text-[#6b7a8d] hover:text-[#e8ecf1]'
            }`}
          >
            跌幅榜
          </button>
        </div>
        {/* 基金类型筛选 */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {FUND_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => { setFundFilter(f.key); setPage(1); }}
              className={`shrink-0 px-2.5 py-1 text-[10px] rounded-full transition-colors ${
                fundFilter === f.key
                  ? 'bg-[#3b82f6] text-white'
                  : 'bg-[#0c0f1a] text-[#6b7a8d] hover:text-[#e8ecf1]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* 列表 */}
      <div className="max-h-[500px] overflow-y-auto">
        {loading && funds.length === 0 ? (
          <div className="p-8 text-center">
            <div className="flex items-center justify-center gap-2 text-[#6b7a8d] text-sm">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              加载中...
            </div>
          </div>
        ) : (
          <>
            {/* 表头 */}
            <div className="grid grid-cols-12 gap-1 px-4 py-2 text-[10px] text-[#6b7a8d] border-b border-white/[0.04] sticky top-0 bg-[#161b2e] z-[1]">
              <div className="col-span-1 text-center">#</div>
              <div className="col-span-3">基金名称</div>
              <div className="col-span-2 text-right">净值</div>
              <div className="col-span-2 text-right">日涨幅</div>
              <div className="col-span-2 text-right">周/月</div>
              <div className="col-span-2 text-right">数据</div>
            </div>
            {funds.map((fund, idx) => {
              const rank = (page - 1) * pageSize + idx + 1;
              const isPositive = fund.dailyRate > 0;
              const isZero = fund.dailyRate === 0;
              const rateColor = isZero
                ? 'text-[#8b95a5]'
                : isPositive
                  ? 'text-[#e54d42]'
                  : 'text-[#07c160]';

              return (
                <div
                  key={fund.code}
                  className="grid grid-cols-12 gap-1 px-4 py-2.5 border-b border-white/[0.04] last:border-0 hover:bg-[#1a2038] transition-colors items-center"
                >
                  <div className="col-span-1 text-center">
                    <span className={`text-[10px] font-bold ${
                      rank <= 3 ? 'text-[#f59e0b]' : 'text-[#6b7a8d]'
                    }`}>
                      {rank}
                    </span>
                  </div>
                  <div className="col-span-3 min-w-0">
                    <p className="text-[#e8ecf1] text-xs font-medium truncate">{fund.name}</p>
                    <p className="text-[#6b7a8d] text-[10px] tabular-nums">{fund.code}</p>
                  </div>
                  <div className="col-span-2 text-right">
                    <span className="text-[#e8ecf1] text-xs tabular-nums">{fund.nav.toFixed(4)}</span>
                  </div>
                  <div className={`col-span-2 text-right text-xs tabular-nums font-semibold ${rateColor}`}>
                    {formatPercent(fund.dailyRate)}
                  </div>
                  <div className="col-span-2 text-right space-y-0.5">
                    <p className={`text-[10px] tabular-nums ${
                      fund.weekRate > 0 ? 'text-[#e54d42]' : fund.weekRate < 0 ? 'text-[#07c160]' : 'text-[#8b95a5]'
                    }`}>
                      周{formatPercent(fund.weekRate)}
                    </p>
                    <p className={`text-[10px] tabular-nums ${
                      fund.monthRate > 0 ? 'text-[#e54d42]' : fund.monthRate < 0 ? 'text-[#07c160]' : 'text-[#8b95a5]'
                    }`}>
                      月{formatPercent(fund.monthRate)}
                    </p>
                  </div>
                  <div className="col-span-2 text-right">
                    <EstimateTag isEstimated={fund.isEstimated} estimateTime={fund.estimateTime ?? null} />
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 p-3 border-t border-white/[0.06]">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1 text-xs rounded-md bg-[#0c0f1a] text-[#6b7a8d] hover:text-[#e8ecf1] disabled:opacity-30 transition-colors"
          >
            上一页
          </button>
          <span className="text-[#6b7a8d] text-xs tabular-nums">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1 text-xs rounded-md bg-[#0c0f1a] text-[#6b7a8d] hover:text-[#e8ecf1] disabled:opacity-30 transition-colors"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
