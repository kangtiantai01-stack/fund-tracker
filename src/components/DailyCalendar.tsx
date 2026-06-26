'use client';

import { useState, useEffect } from 'react';
import { getUserId, formatMoney, loadSnapshots, loadPortfolioFromBackend } from '@/lib/store';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface DayData {
  date: string;
  totalAssets: number;
  totalReturn: number;
  dailyReturn: number;
  hasData: boolean;
  isTradingDay: boolean;
}

export default function DailyCalendar() {
  const [currentMonth, setCurrentMonth] = useState(() => new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(() => new Date().getFullYear());
  const [dayDataMap, setDayDataMap] = useState<Map<string, { total_assets: number; total_return: number }>>(new Map());
  const [selectedDay, setSelectedDay] = useState<DayData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    loadSnapshots(365).then(snapshots => {
      const map = new Map<string, { total_assets: number; total_return: number }>();
      for (const s of snapshots) {
        map.set(s.snapshot_date, { total_assets: s.total_assets, total_return: s.total_return });
      }
      setDayDataMap(map);
      setLoading(false);
    });
  }, []);

  // 生成日历网格
  const firstDay = new Date(currentYear, currentMonth, 1);
  const lastDay = new Date(currentYear, currentMonth + 1, 0);
  const startOffset = firstDay.getDay(); // 0=Sun
  const daysInMonth = lastDay.getDate();

  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) calendarDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d);

  const getDayData = (day: number): DayData | null => {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const d = new Date(dateStr);
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const snapshot = dayDataMap.get(dateStr);

    if (!snapshot) {
      return {
        date: dateStr,
        totalAssets: 0,
        totalReturn: 0,
        dailyReturn: 0,
        hasData: false,
        isTradingDay: !isWeekend,
      };
    }

    // 计算当日收益（与前一条有数据的记录对比）
    const prevDate = new Date(dateStr);
    prevDate.setDate(prevDate.getDate() - 1);
    let prevSnapshot: { total_assets: number; total_return: number } | undefined;
    for (let i = 1; i <= 7; i++) {
      const pd = new Date(dateStr);
      pd.setDate(pd.getDate() - i);
      const pds = `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, '0')}-${String(pd.getDate()).padStart(2, '0')}`;
      const p = dayDataMap.get(pds);
      if (p) { prevSnapshot = p; break; }
    }

    const dailyReturn = prevSnapshot
      ? (snapshot.total_return || 0) - (prevSnapshot.total_return || 0)
      : 0;

    return {
      date: dateStr,
      totalAssets: snapshot.total_assets,
      totalReturn: snapshot.total_return,
      dailyReturn,
      hasData: true,
      isTradingDay: !isWeekend,
    };
  };

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); }
    else setCurrentMonth(m => m - 1);
    setSelectedDay(null);
  };

  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); }
    else setCurrentMonth(m => m + 1);
    setSelectedDay(null);
  };

  const getDayColor = (dayData: DayData | null): string => {
    if (!dayData || !dayData.hasData) return 'bg-transparent';
    const { dailyReturn } = dayData;
    if (dailyReturn > 0) {
      const intensity = Math.min(Math.abs(dailyReturn) / 500, 1);
      const r = Math.round(229 + (1 - intensity) * 26);
      return `rgba(${r}, 77, 66, ${0.15 + intensity * 0.5})`;
    }
    if (dailyReturn < 0) {
      const intensity = Math.min(Math.abs(dailyReturn) / 500, 1);
      const g = Math.round(193 + (1 - intensity) * 63);
      return `rgba(7, ${g}, 96, ${0.15 + intensity * 0.5})`;
    }
    return 'bg-[#161b2e]/30';
  };

  const isToday = (day: number) => {
    const today = new Date();
    return today.getFullYear() === currentYear && today.getMonth() === currentMonth && today.getDate() === day;
  };

  if (loading) {
    return <div className="text-center text-[#6b7a8d] py-8 text-sm">加载中...</div>;
  }

  return (
    <div>
      {/* 月度切换 */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="text-[#6b7a8d] hover:text-[#e8ecf1] p-1">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-base font-medium text-[#e8ecf1]">
          {currentYear}年{currentMonth + 1}月
        </span>
        <button onClick={nextMonth} className="text-[#6b7a8d] hover:text-[#e8ecf1] p-1">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* 星期头 */}
      <div className="grid grid-cols-7 mb-1">
        {['日', '一', '二', '三', '四', '五', '六'].map(d => (
          <div key={d} className="text-center text-[10px] text-[#6b7a8d] py-1">{d}</div>
        ))}
      </div>

      {/* 日历网格 */}
      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((day, i) => {
          const dayData = day ? getDayData(day) : null;
          const bgColor = getDayColor(dayData);

          return (
            <button
              key={i}
              disabled={!day}
              onClick={() => dayData && setSelectedDay(dayData)}
              className={`aspect-square rounded-lg flex flex-col items-center justify-center text-xs transition-colors relative ${
                !day ? 'invisible' : 'cursor-pointer hover:bg-white/5'
              } ${isToday(day || 0) ? 'ring-1 ring-[#3b82f6]/50' : ''}`}
              style={{ backgroundColor: typeof bgColor === 'string' && bgColor.startsWith('rgba') ? bgColor : undefined }}
            >
              {day && (
                <>
                  <span className={`font-medium ${
                    isToday(day) ? 'text-[#3b82f6]' : 'text-[#e8ecf1]'
                  }`}>
                    {day}
                  </span>
                  {dayData?.hasData && (
                    <span className={`text-[9px] tabular-nums mt-0.5 ${
                      (dayData.dailyReturn || 0) > 0 ? 'text-[#e54d42]' :
                      (dayData.dailyReturn || 0) < 0 ? 'text-[#07c160]' : 'text-[#6b7a8d]'
                    }`}>
                      {(dayData.dailyReturn || 0) > 0 ? '+' : ''}
                      {(dayData.dailyReturn || 0) !== 0 ? (dayData.dailyReturn || 0).toFixed(0) : '-'}
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </div>

      {/* 选中日详情 */}
      {selectedDay && (
        <div className="mt-4 bg-[#161b2e]/50 rounded-xl p-4">
          <div className="text-sm font-medium text-[#e8ecf1] mb-3">{selectedDay.date}</div>
          {selectedDay.hasData ? (
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="text-[#6b7a8d]">总资产</div>
                <div className="text-[#e8ecf1] tabular-nums mt-0.5">{formatMoney(selectedDay.totalAssets)}</div>
              </div>
              <div>
                <div className="text-[#6b7a8d]">累计收益</div>
                <div className={`tabular-nums mt-0.5 ${selectedDay.totalReturn >= 0 ? 'text-[#e54d42]' : 'text-[#07c160]'}`}>
                  {formatMoney(selectedDay.totalReturn)}
                </div>
              </div>
              <div>
                <div className="text-[#6b7a8d]">当日收益</div>
                <div className={`tabular-nums mt-0.5 ${selectedDay.dailyReturn >= 0 ? 'text-[#e54d42]' : 'text-[#07c160]'}`}>
                  {formatMoney(selectedDay.dailyReturn)}
                </div>
              </div>
              <div>
                <div className="text-[#6b7a8d]">交易日</div>
                <div className="text-[#e8ecf1] mt-0.5">{selectedDay.isTradingDay ? '是' : '否（休市）'}</div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-[#6b7a8d] text-center py-2">该日无持仓数据</div>
          )}
        </div>
      )}

      {/* 图例 */}
      <div className="flex items-center gap-4 mt-3 text-[10px] text-[#6b7a8d] justify-center">
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(229,77,66,0.4)' }} />
          涨
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(7,193,96,0.4)' }} />
          跌
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-[#161b2e]/50" />
          无数据
        </div>
      </div>
    </div>
  );
}