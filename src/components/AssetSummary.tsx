'use client';

import type { HoldingDisplay } from '@/lib/types';
import { formatMoney, formatPercent } from '@/lib/store';

interface AssetSummaryProps {
  holdings: HoldingDisplay[];
}

/** 闪电图标 */
function ZapIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor" width="1em" height="1em">
      <path d="M9.5 1L3 9h4.5L5.5 15 13 7H8.5L9.5 1z" />
    </svg>
  );
}

export default function AssetSummary({ holdings }: AssetSummaryProps) {
  const totalAmount = holdings.reduce((s, h) => s + h.holdingAmount, 0);
  const totalCost = holdings.reduce((s, h) => s + h.costAmount, 0);
  const totalProfit = totalAmount - totalCost;
  const totalProfitRate = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;
  const dailyProfit = holdings.reduce((s, h) => s + h.dailyChangeAmount, 0);
  const dailyChangeRate = totalCost > 0 ? (dailyProfit / totalCost) * 100 : 0;

  const profitColor = totalProfit >= 0 ? 'text-[#e54d42]' : 'text-[#07c160]';
  const dailyColor = dailyProfit >= 0 ? 'text-[#e54d42]' : 'text-[#07c160]';

  // 判断是否有估算数据
  const hasEstimated = holdings.some((h) => h.isEstimated);

  return (
    <div className="rounded-xl bg-[#161b2e] border border-white/[0.06] p-5 space-y-4">
      {/* 总资产 */}
      <div>
        <p className="text-[#6b7a8d] text-xs mb-1">总资产(元)</p>
        <p className="text-[#e8ecf1] text-3xl font-bold tabular-nums tracking-tight">
          {formatMoney(totalAmount)}
        </p>
      </div>

      {/* 收益行 */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-[#6b7a8d] text-xs mb-1">持有收益</p>
          <p className={`text-lg font-semibold tabular-nums ${profitColor}`}>
            {totalProfit >= 0 ? '+' : ''}{formatMoney(totalProfit)}
          </p>
        </div>
        <div>
          <p className="text-[#6b7a8d] text-xs mb-1">持有收益率</p>
          <p className={`text-lg font-semibold tabular-nums ${profitColor}`}>
            {formatPercent(totalProfitRate)}
          </p>
        </div>
      </div>

      {/* 今日收益行 */}
      <div className="grid grid-cols-2 gap-4 pt-3 border-t border-white/[0.06]">
        <div>
          <p className="text-[#6b7a8d] text-xs mb-1">
            当日收益
            {hasEstimated && (
              <span className="inline-flex items-center gap-0.5 ml-1 text-[#f59e0b]">
                <ZapIcon className="w-3 h-3" />
                <span className="text-[10px]">估</span>
              </span>
            )}
          </p>
          <p className={`text-base font-semibold tabular-nums ${dailyColor}`}>
            {dailyProfit >= 0 ? '+' : ''}{formatMoney(dailyProfit)}
          </p>
        </div>
        <div>
          <p className="text-[#6b7a8d] text-xs mb-1">
            当日涨跌幅
            {hasEstimated && (
              <span className="inline-flex items-center gap-0.5 ml-1 text-[#f59e0b]">
                <ZapIcon className="w-3 h-3" />
                <span className="text-[10px]">估</span>
              </span>
            )}
          </p>
          <p className={`text-base font-semibold tabular-nums ${dailyColor}`}>
            {formatPercent(dailyChangeRate)}
          </p>
        </div>
      </div>
    </div>
  );
}
