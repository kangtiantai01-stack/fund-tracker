'use client';

import { useState } from 'react';
import type { HoldingDisplay, ViewMode } from '@/lib/types';
import { formatMoney, formatPercent, formatShares } from '@/lib/store';

interface HoldingListProps {
  holdings: HoldingDisplay[];
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onDeleteHolding: (code: string) => void;
  onSelectFund?: (code: string) => void;
}

/** 闪电图标 - 表示估算值 */
function ZapIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor" width="1em" height="1em">
      <path d="M9.5 1L3 9h4.5L5.5 15 13 7H8.5L9.5 1z" />
    </svg>
  );
}

/** 估算值标注组件 */
function EstimateBadge({ isEstimated }: { isEstimated: boolean }) {
  if (isEstimated) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[#f59e0b] text-[10px] ml-1">
        <ZapIcon className="w-3 h-3" />
        <span>估算</span>
      </span>
    );
  }
  return (
    <span className="text-[#6b7a8d] text-[10px] ml-1">收盘</span>
  );
}

function ChangeBadge({ value, unit }: { value: number; unit?: string }) {
  const isPositive = value > 0;
  const isZero = value === 0;
  const color = isZero
    ? 'text-[#8b95a5]'
    : isPositive
      ? 'text-[#e54d42]'
      : 'text-[#07c160]';
  const prefix = isPositive ? '+' : '';
  const display = unit === '%' ? formatPercent(value) : `${prefix}${formatMoney(value)}`;

  return <span className={`tabular-nums font-semibold ${color}`}>{display}</span>;
}

function HoldingCardItem({ holding, onDelete, onSelectFund }: { holding: HoldingDisplay; onDelete: (code: string) => void; onSelectFund?: (code: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const profitColor = holding.holdingProfit >= 0 ? 'text-[#e54d42]' : 'text-[#07c160]';

  return (
    <div
      className="rounded-xl bg-[#161b2e] border border-white/[0.06] p-4 hover:bg-[#1a2038] transition-colors cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      {/* 头部：名称+代码+涨跌幅 */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0 mr-3 cursor-pointer" onClick={(e) => { e.stopPropagation(); onSelectFund?.(holding.code); }}>
          <h3 className="text-[#e8ecf1] text-sm font-medium truncate">{holding.name}</h3>
          <p className="text-[#6b7a8d] text-xs mt-0.5">{holding.code}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="flex items-center justify-end gap-1">
            <ChangeBadge value={holding.dailyChangeRate} unit="%" />
            <EstimateBadge isEstimated={holding.isEstimated} />
          </div>
          <p className="text-[#6b7a8d] text-xs mt-0.5">
            <span className="inline-flex items-center gap-0.5">
              {holding.isEstimated && <ZapIcon className="w-3 h-3 text-[#f59e0b]" />}
              {holding.isEstimated ? '估算' : '收盘'}净值
            </span>
            {' '}
            <span className="text-[#e8ecf1] tabular-nums">{holding.latestNav.toFixed(4)}</span>
          </p>
        </div>
      </div>

      {/* 核心数据行 */}
      <div className="grid grid-cols-3 gap-3 text-xs">
        <div>
          <p className="text-[#6b7a8d] mb-0.5">持仓金额</p>
          <p className="text-[#e8ecf1] tabular-nums font-medium">{formatMoney(holding.holdingAmount)}</p>
        </div>
        <div>
          <p className="text-[#6b7a8d] mb-0.5">持有收益</p>
          <p className={`tabular-nums font-medium ${profitColor}`}>
            {holding.holdingProfit >= 0 ? '+' : ''}{formatMoney(holding.holdingProfit)}
          </p>
        </div>
        <div>
          <p className="text-[#6b7a8d] mb-0.5">收益率</p>
          <p className={`tabular-nums font-medium ${profitColor}`}>
            {formatPercent(holding.holdingProfitRate)}
          </p>
        </div>
      </div>

      {/* 展开详情 */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[#6b7a8d]">持有份额：</span>
              <span className="text-[#e8ecf1] tabular-nums">{formatShares(holding.shares)}</span>
            </div>
            <div>
              <span className="text-[#6b7a8d]">成本价：</span>
              <span className="text-[#e8ecf1] tabular-nums">{holding.costPrice.toFixed(4)}</span>
            </div>
            <div>
              <span className="text-[#6b7a8d]">昨日净值：</span>
              <span className="text-[#e8ecf1] tabular-nums">{holding.yesterdayNav.toFixed(4)}</span>
            </div>
            <div>
              <span className="text-[#6b7a8d]">今日涨跌额：</span>
              <ChangeBadge value={holding.dailyChangeAmount} />
            </div>
          </div>
          {holding.updateTime && (
            <p className="text-[#6b7a8d] text-[10px]">
              {holding.isEstimated ? '估算' : '净值'}时间：{holding.updateTime}
            </p>
          )}
          <div className="pt-2 flex justify-end">
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(holding.code); }}
              className="text-[#e54d42]/70 hover:text-[#e54d42] text-xs transition-colors"
            >
              删除持仓
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function HoldingTableView({ holdings, onDelete, onSelectFund }: { holdings: HoldingDisplay[]; onDelete: (code: string) => void; onSelectFund?: (code: string) => void }) {
  return (
    <div className="overflow-x-auto rounded-xl bg-[#161b2e] border border-white/[0.06]">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/[0.06]">
            <th className="text-left text-[#6b7a8d] font-medium p-3">基金</th>
            <th className="text-right text-[#6b7a8d] font-medium p-3">
              <span className="inline-flex items-center gap-0.5">
                <ZapIcon className="w-3 h-3 text-[#f59e0b]" />
                估算净值
              </span>
            </th>
            <th className="text-right text-[#6b7a8d] font-medium p-3">
              <span className="inline-flex items-center gap-0.5">
                <ZapIcon className="w-3 h-3 text-[#f59e0b]" />
                估算涨跌
              </span>
            </th>
            <th className="text-right text-[#6b7a8d] font-medium p-3">持有份额</th>
            <th className="text-right text-[#6b7a8d] font-medium p-3">持仓金额</th>
            <th className="text-right text-[#6b7a8d] font-medium p-3">持有收益</th>
            <th className="text-right text-[#6b7a8d] font-medium p-3">收益率</th>
            <th className="text-center text-[#6b7a8d] font-medium p-3">操作</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h) => {
            const profitColor = h.holdingProfit >= 0 ? 'text-[#e54d42]' : 'text-[#07c160]';
            return (
              <tr key={h.code} className="border-b border-white/[0.04] hover:bg-[#1a2038] transition-colors">
                <td className="p-3 cursor-pointer" onClick={() => onSelectFund?.(h.code)}>
                  <p className="text-[#e8ecf1] text-xs font-medium">{h.name}</p>
                  <p className="text-[#6b7a8d] text-[10px]">{h.code}</p>
                </td>
                <td className="text-right p-3">
                  <span className="text-[#e8ecf1] tabular-nums">{h.latestNav.toFixed(4)}</span>
                  <EstimateBadge isEstimated={h.isEstimated} />
                </td>
                <td className="text-right p-3">
                  <ChangeBadge value={h.dailyChangeRate} unit="%" />
                  <br />
                  <ChangeBadge value={h.dailyChangeAmount} />
                </td>
                <td className="text-right p-3 text-[#e8ecf1] tabular-nums">{formatShares(h.shares)}</td>
                <td className="text-right p-3 text-[#e8ecf1] tabular-nums">{formatMoney(h.holdingAmount)}</td>
                <td className={`text-right p-3 tabular-nums font-medium ${profitColor}`}>
                  {h.holdingProfit >= 0 ? '+' : ''}{formatMoney(h.holdingProfit)}
                </td>
                <td className={`text-right p-3 tabular-nums font-medium ${profitColor}`}>
                  {formatPercent(h.holdingProfitRate)}
                </td>
                <td className="text-center p-3">
                  <button
                    onClick={() => onDelete(h.code)}
                    className="text-[#e54d42]/70 hover:text-[#e54d42] transition-colors"
                  >
                    删除
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function HoldingList({ holdings, viewMode, onViewModeChange, onDeleteHolding, onSelectFund }: HoldingListProps) {
  return (
    <div className="space-y-3">
      {/* 标题栏 + 视图切换 */}
      <div className="flex items-center justify-between">
        <h2 className="text-[#e8ecf1] text-base font-semibold">
          持仓列表
          <span className="text-[#6b7a8d] text-xs font-normal ml-2">({holdings.length}只)</span>
        </h2>
        <div className="flex bg-[#161b2e] rounded-lg border border-white/[0.06] p-0.5">
          <button
            onClick={() => onViewModeChange('card')}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              viewMode === 'card'
                ? 'bg-[#3b82f6] text-white'
                : 'text-[#6b7a8d] hover:text-[#e8ecf1]'
            }`}
          >
            卡片
          </button>
          <button
            onClick={() => onViewModeChange('table')}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              viewMode === 'table'
                ? 'bg-[#3b82f6] text-white'
                : 'text-[#6b7a8d] hover:text-[#e8ecf1]'
            }`}
          >
            表格
          </button>
        </div>
      </div>

      {/* 持仓内容 */}
      {holdings.length === 0 ? (
        <div className="rounded-xl bg-[#161b2e] border border-white/[0.06] p-8 text-center">
          <p className="text-[#6b7a8d]">暂无持仓数据</p>
        </div>
      ) : viewMode === 'card' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {holdings.map((h) => (
            <HoldingCardItem key={h.code} holding={h} onDelete={onDeleteHolding} onSelectFund={onSelectFund} />
          ))}
        </div>
      ) : (
        <HoldingTableView holdings={holdings} onDelete={onDeleteHolding} onSelectFund={onSelectFund} />
      )}
    </div>
  );
}
