'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import type { Holding, Transaction } from '@/lib/types';
import { formatMoney, getUserId } from '@/lib/store';

interface Props {
  fundCode: string;
  holdings: Holding[];
  transactions: Transaction[];
  onClose: () => void;
}

function NavTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload || !payload[0]) return null;
  return (
    <div className="bg-[#1e2440] border border-white/10 rounded-lg px-3 py-2 text-sm shadow-xl">
      <div className="text-[#6b7a8d] text-xs">{label}</div>
      <div className="text-[#e8ecf1] mt-1 tabular-nums">净值: {payload[0].value.toFixed(4)}</div>
    </div>
  );
}

const NAV_PERIODS = [
  { label: '近1周', days: 7 },
  { label: '近1月', days: 30 },
  { label: '近3月', days: 90 },
  { label: '近1年', days: 365 },
  { label: '全部', days: 9999 },
] as const;

export default function FundDetailDrawer({ fundCode, holdings, transactions, onClose }: Props) {
  const [period, setPeriod] = useState(30);
  const [fundTrans, setFundTrans] = useState<Transaction[]>([]);
  const [navHistory, setNavHistory] = useState<{ date: string; nav: number }[]>([]);

  const holding = holdings.find(h => h.code === fundCode) || null;

  useEffect(() => {
    if (!fundCode) return;
    // 过滤该基金的交易
    setFundTrans(transactions.filter(t => t.fundCode === fundCode));

    // 尝试从后端获取历史净值
    fetch(`/api/transactions?userId=${getUserId()}&fundCode=${fundCode}&pageSize=100`)
      .then(r => r.json())
      .then(d => {
        if (d.transactions && Array.isArray(d.transactions)) {
          setFundTrans(d.transactions.map((t: Record<string, unknown>) => ({
            id: t.id as string,
            fundCode: t.fund_code as string,
            fundName: t.fund_name as string,
            direction: t.direction as 'buy' | 'sell',
            amount: parseFloat(t.amount as string),
            shares: t.shares ? parseFloat(t.shares as string) : 0,
            nav: t.nav ? parseFloat(t.nav as string) : 0,
            fee: t.fee ? parseFloat(t.fee as string) : 0,
            feeRate: t.fee_rate ? parseFloat(t.fee_rate as string) : 0,
            platform: t.platform as string,
            before15: t.before15 as boolean,
            date: t.transaction_date as string || t.date as string,
            transactionDate: t.transaction_date as string,
            confirmDate: t.confirm_date as string,
          })));
        }
      })
      .catch(() => {});

    // 模拟历史净值数据（用于展示走势图）
    const mockData: { date: string; nav: number }[] = [];
    const today = new Date();
    const baseNav = holding?.latestNav || holding?.costPrice || 1;
    for (let i = 365; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      if (d.getDay() === 0 || d.getDay() === 6) continue;
      const dailyChange = (Math.random() - 0.48) * 0.06;
      const nav = baseNav * (1 + dailyChange * (i / 30) * 0.1);
      mockData.push({
        date: d.toISOString().split('T')[0],
        nav: Math.round(nav * 10000) / 10000,
      });
    }
    setNavHistory(mockData);
  }, [fundCode, holdings, transactions]);

  if (!holding) return null;

  const filteredNav = period === 9999
    ? navHistory
    : navHistory.slice(-period);

  const totalCost = holding.shares * holding.costPrice;
  const currentValue = holding.shares * (holding.latestNav || 0);
  const totalReturn = currentValue - totalCost;
  const returnRate = totalCost > 0 ? (totalReturn / totalCost) * 100 : 0;
  const totalInvested = fundTrans
    .filter(t => t.direction === 'buy')
    .reduce((s, t) => s + t.amount, 0);

  const avgCost = fundTrans.length > 0
    ? fundTrans
        .filter(t => t.direction === 'buy' && t.shares && t.shares > 0)
        .reduce((s, t) => s + (t.shares || 0) * (t.nav || 0), 0) / holding.shares
    : holding.costPrice;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-4 sm:pt-10">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-[#0c0f1a] border border-white/10 rounded-2xl shadow-2xl mx-4">
        {/* 头部 */}
        <div className="sticky top-0 bg-[#0c0f1a] z-10 flex items-center justify-between p-4 border-b border-white/10">
          <div>
            <h2 className="text-lg font-bold text-[#e8ecf1]">{holding.name}</h2>
            <span className="text-xs text-[#6b7a8d]">{holding.code}</span>
          </div>
          <button onClick={onClose} className="text-[#6b7a8d] hover:text-[#e8ecf1] text-xl leading-none p-1">&times;</button>
        </div>

        {/* 实时净值 */}
        <div className="px-4 py-3 bg-[#161b2e]/50">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-[#6b7a8d]">估算净值</span>
            {holding.isEstimated && <span className="text-[10px] text-[#f59e0b]">⚡估算</span>}
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-bold tabular-nums text-[#e8ecf1]">
              {holding.latestNav?.toFixed(4)}
            </span>
            <span className={`text-sm font-medium tabular-nums ${
              (holding.dailyChangeRate || 0) >= 0 ? 'text-[#e54d42]' : 'text-[#07c160]'
            }`}>
              {(holding.dailyChangeRate || 0) >= 0 ? '+' : ''}{(holding.dailyChangeRate || 0).toFixed(2)}%
            </span>
          </div>
          {holding.updateTime && (
            <div className="text-[10px] text-[#6b7a8d] mt-1">更新: {holding.updateTime}</div>
          )}
        </div>

        {/* 净值走势图 */}
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-[#e8ecf1]">净值走势</span>
            <div className="flex gap-1">
              {NAV_PERIODS.map(p => (
                <button
                  key={p.days}
                  onClick={() => setPeriod(p.days)}
                  className={`px-2 py-0.5 rounded text-xs transition-colors ${
                    period === p.days
                      ? 'bg-[#3b82f6]/20 text-[#3b82f6]'
                      : 'text-[#6b7a8d] hover:text-[#e8ecf1]'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={filteredNav}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fill: '#6b7a8d', fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} axisLine={false} tickLine={false} />
                <YAxis domain={['auto', 'auto']} tick={{ fill: '#6b7a8d', fontSize: 10 }} axisLine={false} tickLine={false} width={50} />
                <Tooltip content={<NavTooltip />} />
                <Line type="monotone" dataKey="nav" stroke="#3b82f6" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="text-[10px] text-[#6b7a8d] text-center mt-1">*历史净值根据近期估值模拟展示，仅供参考</div>
        </div>

        {/* 基金档案 */}
        <div className="px-4 py-3 border-t border-white/5">
          <h3 className="text-sm font-medium text-[#e8ecf1] mb-2">基金档案</h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-[#6b7a8d]">基金代码</span><br /><span className="text-[#e8ecf1]">{holding.code}</span></div>
            <div><span className="text-[#6b7a8d]">基金名称</span><br /><span className="text-[#e8ecf1] truncate block">{holding.name}</span></div>
            <div><span className="text-[#6b7a8d]">持有份额</span><br /><span className="text-[#e8ecf1] tabular-nums">{holding.shares.toFixed(2)}</span></div>
            <div><span className="text-[#6b7a8d]">成本净值</span><br /><span className="text-[#e8ecf1] tabular-nums">{holding.costPrice.toFixed(4)}</span></div>
          </div>
        </div>

        {/* 成本分析 */}
        <div className="px-4 py-3 border-t border-white/5">
          <h3 className="text-sm font-medium text-[#e8ecf1] mb-2">成本分析</h3>
          <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs">
            <div><span className="text-[#6b7a8d]">加权平均成本</span><br /><span className="text-[#e8ecf1] tabular-nums">{avgCost.toFixed(4)}</span></div>
            <div><span className="text-[#6b7a8d]">总投入</span><br /><span className="text-[#e8ecf1] tabular-nums">{formatMoney(totalInvested)}</span></div>
            <div><span className="text-[#6b7a8d]">当前市值</span><br /><span className="text-[#e8ecf1] tabular-nums">{formatMoney(currentValue)}</span></div>
            <div><span className="text-[#6b7a8d]">总盈亏</span><br /><span className={`tabular-nums ${totalReturn >= 0 ? 'text-[#e54d42]' : 'text-[#07c160]'}`}>{formatMoney(totalReturn)}</span></div>
            <div><span className="text-[#6b7a8d]">盈亏率</span><br /><span className={`tabular-nums ${returnRate >= 0 ? 'text-[#e54d42]' : 'text-[#07c160]'}`}>{returnRate >= 0 ? '+' : ''}{returnRate.toFixed(2)}%</span></div>
          </div>
        </div>

        {/* 交易明细 */}
        <div className="px-4 py-3 border-t border-white/5">
          <h3 className="text-sm font-medium text-[#e8ecf1] mb-2">交易明细</h3>
          {fundTrans.length === 0 ? (
            <div className="text-xs text-[#6b7a8d] py-2 text-center">暂无交易记录</div>
          ) : (
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
              {fundTrans.map(t => (
                <div key={t.id} className="flex items-center gap-2 bg-[#161b2e]/50 rounded-lg px-3 py-2 text-xs">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    t.direction === 'buy' ? 'bg-[#e54d42]/20 text-[#e54d42]' : 'bg-[#07c160]/20 text-[#07c160]'
                  }`}>
                    {t.direction === 'buy' ? '买入' : '卖出'}
                  </span>
                  <span className="text-[#6b7a8d]">{t.date}</span>
                  <span className="text-[#e8ecf1] tabular-nums ml-auto">{formatMoney(t.amount)}</span>
                  <span className="text-[#6b7a8d] tabular-nums">{t.shares?.toFixed(2)}份</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="h-4" />
      </div>
    </div>
  );
}