'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Transaction } from '@/lib/types';
import { getUserId, formatMoney, loadTransactions } from '@/lib/store';
import { Trash2, Search, X } from 'lucide-react';

export default function TransactionHistory() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/transactions?userId=${getUserId()}&pageSize=200`);
      if (res.ok) {
        const data = await res.json();
        if (data.transactions?.length > 0) {
          setTransactions(data.transactions.map((t: Record<string, unknown>) => ({
            id: t.id as string,
            fundCode: t.fund_code as string,
            fundName: t.fund_name as string,
            direction: t.direction as string,
            amount: parseFloat(t.amount as string),
            shares: t.shares ? parseFloat(t.shares as string) : undefined,
            nav: t.nav ? parseFloat(t.nav as string) : undefined,
            fee: t.fee ? parseFloat(t.fee as string) : undefined,
            platform: t.platform as string,
            before15: t.before15 as boolean,
            transactionDate: t.transaction_date as string,
            confirmDate: t.confirm_date as string,
          })));
          setLoading(false);
          return;
        }
      }
    } catch {}
    // fallback to localStorage
    setTransactions(loadTransactions());
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDelete = async (id: string) => {
    const success = await fetch(`/api/transactions/${id}?userId=${getUserId()}`, { method: 'DELETE' }).then(r => r.ok);
    if (success) {
      setTransactions(prev => prev.filter(t => t.id !== id));
    }
    setDeleteConfirm(null);
  };

  const filtered = filter
    ? transactions.filter(t => t.fundName.includes(filter) || t.fundCode.includes(filter))
    : transactions;

  const fundNames = [...new Set(transactions.map(t => t.fundName))];

  if (loading) {
    return <div className="text-center text-[#6b7a8d] py-8 text-sm">加载中...</div>;
  }

  return (
    <div>
      {/* 筛选 */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6b7a8d]" />
        <input
          type="text"
          placeholder="搜索基金名称或代码..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="w-full bg-[#161b2e] border border-white/10 rounded-lg pl-9 pr-8 py-2 text-sm text-[#e8ecf1] placeholder:text-[#6b7a8d] focus:outline-none focus:border-[#3b82f6]/50"
        />
        {filter && (
          <button onClick={() => setFilter('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6b7a8d] hover:text-[#e8ecf1]">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {filter && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {fundNames.filter(n => n.includes(filter)).slice(0, 5).map(name => (
            <button
              key={name}
              onClick={() => setFilter(name)}
              className="px-2 py-0.5 text-xs bg-[#3b82f6]/10 text-[#3b82f6] rounded-full"
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center text-[#6b7a8d] py-8 text-sm">
          {filter ? '无匹配交易记录' : '暂无交易记录'}
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map(t => (
            <div key={t.id} className="flex items-center gap-3 bg-[#161b2e]/50 rounded-lg px-3 py-2.5 text-xs">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${
                    t.direction === 'buy' ? 'bg-[#e54d42]/20 text-[#e54d42]' : 'bg-[#07c160]/20 text-[#07c160]'
                  }`}>
                    {t.direction === 'buy' ? '买入' : '卖出'}
                  </span>
                  <span className="text-[#e8ecf1] font-medium truncate">{t.fundName}</span>
                </div>
                <div className="text-[#6b7a8d] mt-0.5">
                  {t.transactionDate}
                  {t.confirmDate && <span className="ml-2">确认日 {t.confirmDate}</span>}
                  {t.platform && <span className="ml-2">{t.platform}</span>}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-[#e8ecf1] tabular-nums">{formatMoney(t.amount)}</div>
                <div className="text-[#6b7a8d] tabular-nums">
                  {t.shares ? `${t.shares.toFixed(2)}份` : ''}
                  {t.nav ? ` @${t.nav.toFixed(4)}` : ''}
                </div>
              </div>
              <button
                onClick={() => setDeleteConfirm(deleteConfirm === t.id ? null : t.id)}
                className="text-[#6b7a8d] hover:text-[#e54d42] p-1 flex-shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              {deleteConfirm === t.id && (
                <div className="absolute right-0 top-full mt-1 z-10 bg-[#1e2440] border border-white/10 rounded-lg p-2 shadow-xl flex gap-2">
                  <span className="text-[10px] text-[#6b7a8d] self-center">确认删除？</span>
                  <button onClick={() => handleDelete(t.id)} className="px-2 py-0.5 text-[10px] bg-[#e54d42]/20 text-[#e54d42] rounded">删除</button>
                  <button onClick={() => setDeleteConfirm(null)} className="px-2 py-0.5 text-[10px] text-[#6b7a8d] rounded">取消</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="text-[10px] text-[#6b7a8d] text-center mt-3">
        共 {transactions.length} 条交易记录
      </div>
    </div>
  );
}