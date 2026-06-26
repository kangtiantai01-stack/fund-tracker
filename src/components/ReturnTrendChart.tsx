'use client';

import { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { loadSnapshots } from '@/lib/store';
import { formatMoney } from '@/lib/store';

interface Snapshot {
  snapshot_date: string;
  total_assets: number;
  total_return: number;
}

const PERIODS = [
  { label: '近7天', days: 7 },
  { label: '近1月', days: 30 },
  { label: '近3月', days: 90 },
  { label: '全部', days: 365 },
] as const;

function TrendTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload || !payload[0]) return null;
  return (
    <div className="bg-[#1e2440] border border-white/10 rounded-lg px-3 py-2 text-sm shadow-xl">
      <div className="text-[#6b7a8d] text-xs">{label}</div>
      <div className="text-[#e8ecf1] mt-1">
        总资产: <span className="tabular-nums">{formatMoney(payload[0].value)}</span>
      </div>
    </div>
  );
}

export default function ReturnTrendChart() {
  const [period, setPeriod] = useState(30);
  const [data, setData] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    loadSnapshots(period).then(d => {
      setData(d);
      setLoading(false);
    });
  }, [period]);

  if (loading) {
    return (
      <div className="text-center text-[#6b7a8d] py-8 text-sm">加载中...</div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-center text-[#6b7a8d] py-8 text-sm">
        暂无收益数据。持仓数据将在每日访问时自动记录。
      </div>
    );
  }

  const allDates = data.map(d => d.snapshot_date.slice(5));

  return (
    <div>
      <div className="flex gap-2 mb-3">
        {PERIODS.map(p => (
          <button
            key={p.days}
            onClick={() => setPeriod(p.days)}
            className={`px-3 py-1 rounded-md text-xs transition-colors ${
              period === p.days
                ? 'bg-[#3b82f6]/20 text-[#3b82f6] border border-[#3b82f6]/30'
                : 'text-[#6b7a8d] hover:text-[#e8ecf1] border border-transparent'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="snapshot_date"
              tick={{ fill: '#6b7a8d', fontSize: 11 }}
              tickFormatter={(v: string) => v.slice(5)}
              ticks={data.length > 10 ? [data[0]?.snapshot_date, data[data.length - 1]?.snapshot_date].filter(Boolean) : undefined}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#6b7a8d', fontSize: 11 }}
              tickFormatter={(v: number) => `${(v / 10000).toFixed(1)}万`}
              axisLine={false}
              tickLine={false}
              width={55}
            />
            <Tooltip content={<TrendTooltip />} />
            <Line
              type="monotone"
              dataKey="total_assets"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#3b82f6' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {data.length > 1 && (
        <div className="flex justify-between text-xs text-[#6b7a8d] mt-2 px-1">
          <span>最早: {formatMoney(data[0].total_assets)}</span>
          <span>最新: {formatMoney(data[data.length - 1].total_assets)}</span>
          <span className={data[data.length - 1].total_return >= 0 ? 'text-[#e54d42]' : 'text-[#07c160]'}>
            收益: {formatMoney(data[data.length - 1].total_return)}
          </span>
        </div>
      )}
    </div>
  );
}