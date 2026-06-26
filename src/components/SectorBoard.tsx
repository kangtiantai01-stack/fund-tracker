'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Zap } from 'lucide-react';
import type { SectorItem, HotSectorItem } from '@/lib/types';

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

export default function SectorBoard() {
  const [sectorType, setSectorType] = useState<'hot' | 'industry'>('hot');
  const [hotSectors, setHotSectors] = useState<HotSectorItem[]>([]);
  const [industrySectors, setIndustrySectors] = useState<SectorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTrading, setIsTrading] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchHotSectors = useCallback(async () => {
    try {
      const res = await fetch('/api/sector?type=hot');
      if (!res.ok) throw new Error('获取热门板块失败');
      const data = await res.json();
      setHotSectors(data.sectors || []);
      setIsTrading(data.isTradingHours ?? false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    }
  }, []);

  const fetchIndustrySectors = useCallback(async () => {
    try {
      const res = await fetch('/api/sector?type=industry');
      if (!res.ok) throw new Error('获取行业板块失败');
      const data = await res.json();
      setIndustrySectors(data.sectors || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    if (sectorType === 'hot') {
      fetchHotSectors().finally(() => setLoading(false));
    } else {
      fetchIndustrySectors().finally(() => setLoading(false));
    }
  }, [sectorType, fetchHotSectors, fetchIndustrySectors]);

  // 智能刷新：盘中3分钟，非交易时间10分钟
  useEffect(() => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
    }
    const interval = setInterval(() => {
      setIsTrading(isInTradingHours());
      if (sectorType === 'hot') {
        fetchHotSectors();
      } else {
        fetchIndustrySectors();
      }
    }, isInTradingHours() ? 180000 : 600000);
    refreshTimerRef.current = interval;
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [sectorType, fetchHotSectors, fetchIndustrySectors]);

  const formatRate = (rate: number) => {
    const sign = rate > 0 ? '+' : '';
    return `${sign}${rate.toFixed(2)}%`;
  };

  const rateColor = (rate: number) => {
    if (rate > 0) return 'text-[#e54d42]';
    if (rate < 0) return 'text-[#07c160]';
    return 'text-[#8b95a5]';
  };

  const rateBg = (rate: number) => {
    if (rate > 0) return 'bg-[#e54d42]/10';
    if (rate < 0) return 'bg-[#07c160]/10';
    return 'bg-[#8b95a5]/10';
  };

  // 有任何板块是估算数据时显示免责
  const hasEstimated = hotSectors.some((s) => s.isEstimated);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-[#6b7a8d] text-sm">加载中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="text-[#e54d42] text-sm">{error}</div>
        <button
          onClick={() => sectorType === 'hot' ? fetchHotSectors() : fetchIndustrySectors()}
          className="text-xs text-[#3b82f6] hover:underline"
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tab 切换 */}
      <div className="flex gap-1 bg-[#0c0f1a] rounded-lg p-1">
        <button
          onClick={() => setSectorType('hot')}
          className={`flex-1 py-2 text-sm rounded-md transition-all ${
            sectorType === 'hot'
              ? 'bg-[#161b2e] text-[#e8ecf1] font-medium shadow-sm'
              : 'text-[#6b7a8d] hover:text-[#8b95a5]'
          }`}
        >
          🔥 热门板块
        </button>
        <button
          onClick={() => setSectorType('industry')}
          className={`flex-1 py-2 text-sm rounded-md transition-all ${
            sectorType === 'industry'
              ? 'bg-[#161b2e] text-[#e8ecf1] font-medium shadow-sm'
              : 'text-[#6b7a8d] hover:text-[#8b95a5]'
          }`}
        >
          🏭 行业板块
        </button>
      </div>

      {/* 热门板块视图 */}
      {sectorType === 'hot' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {hotSectors.map((sector) => (
            <div
              key={sector.key}
              className="bg-[#161b2e] rounded-xl p-4 border border-white/[0.06] hover:border-white/[0.12] transition-all hover:-translate-y-0.5"
            >
              {/* 板块头部 */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{sector.icon}</span>
                  <span className="text-[#e8ecf1] font-medium text-sm">{sector.name}</span>
                  {/* 估算/收盘标识 */}
                  {sector.isEstimated ? (
                    <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-amber-500/15 text-[9px] text-amber-400">
                      <Zap className="w-2.5 h-2.5" />
                      估算
                    </span>
                  ) : (
                    <span className="px-1 py-0.5 rounded bg-white/[0.06] text-[9px] text-[#6b7a8d]">收盘</span>
                  )}
                </div>
                <div className={`px-2 py-0.5 rounded-md text-sm font-bold tabular-nums ${rateColor(sector.changeRate)} ${rateBg(sector.changeRate)}`}>
                  {formatRate(sector.changeRate)}
                </div>
              </div>

              {/* 基金数量 + 估算时间 */}
              <div className="flex items-center justify-between text-[#6b7a8d] text-xs mb-2">
                <span>{sector.fundCount} 只基金</span>
                {sector.isEstimated && sector.estimateTime && (
                  <span className="text-[10px] tabular-nums">{sector.estimateTime.split(' ')[1]}</span>
                )}
              </div>

              {/* 代表性基金 */}
              {sector.topFunds.length > 0 && (
                <div className="space-y-1.5 mt-2 pt-2 border-t border-white/[0.04]">
                  <div className="text-[#6b7a8d] text-[10px] mb-1">代表性基金</div>
                  {sector.topFunds.map((fund) => (
                    <div key={fund.code} className="flex items-center justify-between">
                      <div className="flex items-center gap-1 min-w-0 max-w-[60%]">
                        <span className="text-[#8b95a5] text-xs truncate">
                          {fund.name.length > 12 ? fund.name.slice(0, 12) + '...' : fund.name}
                        </span>
                        {fund.isEstimated && (
                          <Zap className="w-2 h-2 text-amber-400/60 shrink-0" />
                        )}
                      </div>
                      <span className={`text-xs tabular-nums ${rateColor(fund.rate)}`}>
                        {formatRate(fund.rate)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 行业板块视图 */}
      {sectorType === 'industry' && (
        <div className="space-y-2">
          {/* 表头 */}
          <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[10px] text-[#6b7a8d] border-b border-white/[0.06]">
            <div className="col-span-3">板块名称</div>
            <div className="col-span-2 text-right">最新价</div>
            <div className="col-span-2 text-right">涨跌幅</div>
            <div className="col-span-2 text-right">涨跌额</div>
            <div className="col-span-3 text-right">领涨股</div>
          </div>
          {/* 行业列表 */}
          {industrySectors.map((sector) => (
            <div
              key={sector.code}
              className="grid grid-cols-12 gap-2 px-3 py-2.5 rounded-lg hover:bg-white/[0.02] transition-colors items-center"
            >
              <div className="col-span-3 text-[#e8ecf1] text-xs truncate font-medium">
                {sector.name}
              </div>
              <div className="col-span-2 text-right text-xs text-[#8b95a5] tabular-nums">
                {sector.price.toFixed(2)}
              </div>
              <div className={`col-span-2 text-right text-xs tabular-nums font-medium ${rateColor(sector.changeRate)}`}>
                {formatRate(sector.changeRate)}
              </div>
              <div className={`col-span-2 text-right text-xs tabular-nums ${rateColor(sector.changeAmt)}`}>
                {sector.changeAmt > 0 ? '+' : ''}{sector.changeAmt.toFixed(2)}
              </div>
              <div className="col-span-3 text-right text-[10px] text-[#6b7a8d] truncate">
                {sector.leadStock}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
