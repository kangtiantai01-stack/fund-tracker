'use client';

import { useState } from 'react';
import type { Holding, Transaction } from '@/lib/types';
import { getSellFeeRate, calcHoldDays, saveHoldings, saveTransactions, loadHoldings } from '@/lib/store';

interface TransactionFormProps {
  holdings: Holding[];
  onTransactionComplete: (holdings: Holding[], transactions: Transaction[]) => void;
  transactions: Transaction[];
}

const PLATFORMS = ['支付宝', '天天基金', '其他'];

export default function TransactionForm({ holdings, onTransactionComplete, transactions }: TransactionFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [direction, setDirection] = useState<'buy' | 'sell'>('buy');
  const [fundCode, setFundCode] = useState('');
  const [fundName, setFundName] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [before15, setBefore15] = useState(true);
  const [platform, setPlatform] = useState('支付宝');
  const [feeRate, setFeeRate] = useState('0.1');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // 买入已有基金时自动填充名称
  const handleFundCodeChange = (code: string) => {
    setFundCode(code);
    const existing = holdings.find((h) => h.code === code);
    if (existing) {
      setFundName(existing.name);
    }
  };

  const resetForm = () => {
    setFundCode('');
    setFundName('');
    setAmount('');
    setDate(new Date().toISOString().split('T')[0]);
    setBefore15(true);
    setPlatform('支付宝');
    setFeeRate('0.1');
    setError('');
  };

  const handleSubmit = () => {
    setError('');

    const code = fundCode.trim();
    const amt = parseFloat(amount);
    const rate = parseFloat(feeRate);

    if (!code) { setError('请输入基金代码'); return; }
    if (!/^\d{6}$/.test(code)) { setError('基金代码应为6位数字'); return; }
    if (!amt || amt <= 0) { setError('请输入有效金额'); return; }
    if (isNaN(rate) || rate < 0) { setError('请输入有效费率'); return; }

    // 卖出时检查是否有对应持仓
    if (direction === 'sell') {
      const existing = holdings.find((h) => h.code === code);
      if (!existing) {
        setError('未找到该基金持仓，无法卖出');
        return;
      }
    }

    setSubmitting(true);

    // 获取当前净值
    fetch(`/api/fund/${code}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(`获取净值失败：${data.error}`);
          setSubmitting(false);
          return;
        }

        const nav = parseFloat(data.gsz) || parseFloat(data.dwjz) || 0;
        if (nav <= 0) {
          setError('获取的净值无效');
          setSubmitting(false);
          return;
        }

        const name = fundName.trim() || data.name || code;
        const currentHoldings = loadHoldings();
        const newTransactions = [...transactions];

        if (direction === 'buy') {
          // 买入：份额 = 金额 / 净值，手续费 = 金额 * 费率 / 100
          const fee = amt * rate / 100;
          const netAmount = amt - fee;
          const shares = netAmount / nav;

          const tx: Transaction = {
            id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            date,
            fundCode: code,
            fundName: name,
            direction: 'buy',
            amount: amt,
            before15,
            platform,
            feeRate: rate,
            nav,
            shares,
            fee,
          };
          newTransactions.push(tx);

          // 更新持仓
          const existingIdx = currentHoldings.findIndex((h) => h.code === code);
          if (existingIdx >= 0) {
            const h = currentHoldings[existingIdx];
            const totalCost = h.costPrice * h.shares + amt;
            const totalShares = h.shares + shares;
            h.shares = totalShares;
            h.costPrice = totalCost / totalShares;
            h.name = name;
          } else {
            const newHolding: Holding = {
              code,
              name,
              shares,
              costPrice: amt / shares, // 含手续费的成本价
              latestNav: nav,
              yesterdayNav: parseFloat(data.dwjz) || nav,
              dailyChangeRate: parseFloat(data.gszzl) || 0,
              updateTime: data.gztime || '',
              isEstimated: false,
            };
            currentHoldings.push(newHolding);
          }
        } else {
          // 卖出
          const existingIdx = currentHoldings.findIndex((h) => h.code === code);
          if (existingIdx < 0) {
            setError('未找到该基金持仓');
            setSubmitting(false);
            return;
          }

          const h = currentHoldings[existingIdx];
          // 卖出份额 = 金额 / 净值
          const sellShares = amt / nav;

          if (sellShares > h.shares + 0.01) {
            setError(`卖出份额(${sellShares.toFixed(2)})超过持有份额(${h.shares.toFixed(2)})`);
            setSubmitting(false);
            return;
          }

          // 计算赎回费
          const holdDays = calcHoldDays(date);
          const sellFeeRate = getSellFeeRate(holdDays);
          const sellAmount = sellShares * nav;
          const fee = sellAmount * sellFeeRate;

          const tx: Transaction = {
            id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            date,
            fundCode: code,
            fundName: h.name,
            direction: 'sell',
            amount: amt,
            before15,
            platform,
            feeRate: sellFeeRate * 100,
            nav,
            shares: sellShares,
            fee,
          };
          newTransactions.push(tx);

          // 更新持仓
          const remainingShares = h.shares - sellShares;
          if (remainingShares < 0.01) {
            // 清仓
            currentHoldings.splice(existingIdx, 1);
          } else {
            h.shares = remainingShares;
          }
        }

        saveHoldings(currentHoldings);
        saveTransactions(newTransactions);
        onTransactionComplete(currentHoldings, newTransactions);
        resetForm();
        setIsOpen(false);
        setSubmitting(false);
      })
      .catch((err) => {
        setError(`请求失败：${err instanceof Error ? err.message : '未知错误'}`);
        setSubmitting(false);
      });
  };

  return (
    <div className="rounded-xl bg-[#161b2e] border border-white/[0.06] overflow-hidden">
      {/* 标题栏 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-[#1a2038] transition-colors"
      >
        <h2 className="text-[#e8ecf1] text-base font-semibold">新增交易</h2>
        <svg
          className={`w-5 h-5 text-[#6b7a8d] transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* 表单内容 */}
      {isOpen && (
        <div className="px-4 pb-4 space-y-3">
          {/* 买入/卖出 切换 */}
          <div className="flex bg-[#0c0f1a] rounded-lg p-0.5">
            <button
              onClick={() => setDirection('buy')}
              className={`flex-1 py-2 text-sm rounded-md transition-colors font-medium ${
                direction === 'buy'
                  ? 'bg-[#e54d42] text-white'
                  : 'text-[#6b7a8d] hover:text-[#e8ecf1]'
              }`}
            >
              买入
            </button>
            <button
              onClick={() => setDirection('sell')}
              className={`flex-1 py-2 text-sm rounded-md transition-colors font-medium ${
                direction === 'sell'
                  ? 'bg-[#07c160] text-white'
                  : 'text-[#6b7a8d] hover:text-[#e8ecf1]'
              }`}
            >
              卖出
            </button>
          </div>

          {/* 基金代码 */}
          <div>
            <label className="block text-[#6b7a8d] text-xs mb-1">基金代码</label>
            <input
              type="text"
              value={fundCode}
              onChange={(e) => handleFundCodeChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6位基金代码"
              className="w-full bg-[#0c0f1a] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-[#e8ecf1] placeholder-[#4a5568] focus:outline-none focus:border-[#3b82f6] tabular-nums"
            />
          </div>

          {/* 基金名称 */}
          <div>
            <label className="block text-[#6b7a8d] text-xs mb-1">基金名称（可选，自动填充）</label>
            <input
              type="text"
              value={fundName}
              onChange={(e) => setFundName(e.target.value)}
              placeholder="基金名称"
              className="w-full bg-[#0c0f1a] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-[#e8ecf1] placeholder-[#4a5568] focus:outline-none focus:border-[#3b82f6]"
            />
          </div>

          {/* 交易金额 */}
          <div>
            <label className="block text-[#6b7a8d] text-xs mb-1">交易金额(元)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              step="0.01"
              min="0"
              className="w-full bg-[#0c0f1a] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-[#e8ecf1] placeholder-[#4a5568] focus:outline-none focus:border-[#3b82f6] tabular-nums"
            />
          </div>

          {/* 日期 + 15点前 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[#6b7a8d] text-xs mb-1">交易日期</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-[#0c0f1a] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-[#e8ecf1] focus:outline-none focus:border-[#3b82f6]"
              />
            </div>
            <div>
              <label className="block text-[#6b7a8d] text-xs mb-1">是否15点前</label>
              <div className="flex bg-[#0c0f1a] rounded-lg border border-white/[0.1] p-0.5">
                <button
                  onClick={() => setBefore15(true)}
                  className={`flex-1 py-2 text-xs rounded-md transition-colors ${
                    before15 ? 'bg-[#3b82f6] text-white' : 'text-[#6b7a8d]'
                  }`}
                >
                  是
                </button>
                <button
                  onClick={() => setBefore15(false)}
                  className={`flex-1 py-2 text-xs rounded-md transition-colors ${
                    !before15 ? 'bg-[#3b82f6] text-white' : 'text-[#6b7a8d]'
                  }`}
                >
                  否
                </button>
              </div>
            </div>
          </div>

          {/* 平台 + 费率 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[#6b7a8d] text-xs mb-1">买入平台</label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="w-full bg-[#0c0f1a] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-[#e8ecf1] focus:outline-none focus:border-[#3b82f6]"
              >
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[#6b7a8d] text-xs mb-1">买入费率(%)</label>
              <input
                type="number"
                value={feeRate}
                onChange={(e) => setFeeRate(e.target.value)}
                step="0.01"
                min="0"
                className="w-full bg-[#0c0f1a] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-[#e8ecf1] focus:outline-none focus:border-[#3b82f6] tabular-nums"
              />
            </div>
          </div>

          {/* 错误信息 */}
          {error && (
            <p className="text-[#e54d42] text-xs">{error}</p>
          )}

          {/* 提交按钮 */}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className={`w-full py-2.5 rounded-lg text-sm font-medium transition-all active:scale-[0.97] ${
              direction === 'buy'
                ? 'bg-[#e54d42] hover:bg-[#d43e34] text-white'
                : 'bg-[#07c160] hover:bg-[#06ad56] text-white'
            } disabled:opacity-50`}
          >
            {submitting ? '处理中...' : direction === 'buy' ? '确认买入' : '确认卖出'}
          </button>

          {/* 手续费说明 */}
          <div className="text-[10px] text-[#6b7a8d] leading-relaxed">
            <p>卖出手续费规则：&lt;7天1.5%，7-30天0.5%，30天-1年0.25%，1-2年0.15%，≥2年0%</p>
          </div>
        </div>
      )}
    </div>
  );
}
