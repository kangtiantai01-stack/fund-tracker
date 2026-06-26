'use client';

import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import type { Holding } from '@/lib/types';

const COLORS = [
  '#3b82f6', '#e54d42', '#07c160', '#f59e0b', '#8b5cf6',
  '#06b6d4', '#f97316', '#ec4899', '#14b8a6', '#6366f1',
  '#84cc16', '#d946ef', '#0ea5e9', '#a855f7', '#22c55e',
];

interface Props {
  holdings: Holding[];
}

function renderCustomLabel(props: {
  cx: number; cy: number; midAngle: number; innerRadius: number;
  outerRadius: number; percent: number; index: number;
  name: string; value: number;
}) {
  const { cx, cy, midAngle, outerRadius, percent, name, value, index } = props;
  const RADIAN = Math.PI / 180;
  const labelRadius = outerRadius + 82;
  const x = cx + labelRadius * Math.cos(-midAngle * RADIAN);
  const y = cy + labelRadius * Math.sin(-midAngle * RADIAN);

  // 扇区边缘终点
  const sx = cx + outerRadius * Math.cos(-midAngle * RADIAN);
  const sy = cy + outerRadius * Math.sin(-midAngle * RADIAN);

  // 折线拐点（与标签文字水平对齐）
  const isLeft = x < cx;
  const textAnchor = isLeft ? 'end' : 'start';
  const lineEndX = isLeft ? x - 10 : x + 10;
  const color = COLORS[index % COLORS.length];

  return (
    <g>
      {/* 连接线：扇区边缘 → 拐点 → 文字 */}
      <polyline
        points={`${sx},${sy} ${x},${y} ${lineEndX},${y}`}
        fill="none"
        stroke="rgba(255,255,255,0.15)"
        strokeWidth={1}
      />
      {/* 颜色圆点 */}
      <circle cx={lineEndX} cy={y - 5} r={3} fill={color} />
      {/* 基金名称 */}
      <text
        x={lineEndX + (isLeft ? -8 : 8)}
        y={y - 5}
        textAnchor={textAnchor}
        fill="#e8ecf1"
        fontSize={11}
        className="font-medium"
        dominantBaseline="central"
      >
        {name.length > 8 ? name.slice(0, 8) + '…' : name}
      </text>
      {/* 占比 */}
      <text
        x={lineEndX + (isLeft ? -8 : 8)}
        y={y + 10}
        textAnchor={textAnchor}
        fill="#6b7a8d"
        fontSize={10}
        className="tabular-nums"
        dominantBaseline="central"
      >
        {(percent * 100).toFixed(1)}%
      </text>
    </g>
  );
}

export default function PortfolioPieChart({ holdings }: Props) {
  if (!holdings || holdings.length === 0) return null;

  const data = holdings
    .map(h => ({
      name: h.name,
      code: h.code,
      value: Math.round(((h.shares || 0) * (h.latestNav || h.costPrice || 0)) * 100) / 100,
    }))
    .filter(d => d.value > 0);

  if (data.length === 0) return null;

  return (
    <div className="w-full">
      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={85}
              dataKey="value"
              stroke="none"
              label={renderCustomLabel}
              labelLine={false}
            >
              {data.map((_, index) => (
                <Cell key={index} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}