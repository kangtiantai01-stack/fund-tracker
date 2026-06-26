'use client';

import { useState } from 'react';
import type { Holding, Transaction } from '@/lib/types';

interface Props {
  holdings: Holding[];
  transactions: Transaction[];
  onTransactionComplete: (holdings: Holding[], transactions: Transaction[]) => void;
  onHoldingsSync: (holdings: Holding[]) => void;
}

export default function AIImageRecognizer({ holdings, transactions, onTransactionComplete, onHoldingsSync }: Props) {
  const [inputText, setInputText] = useState('');
  const [recognizedList, setRecognizedList] = useState<any[]>([]);
  const [showResult, setShowResult] = useState(false);

  // 解析文本：支持多条，自动识别买卖方向
  const parseTransactions = (text: string) => {
    const lines = text.split('\n').filter(line => line.trim() !== '');
    const results: any[] = [];

    // 匹配多种格式
    const patterns = [
      /(\d{4}-\d{2}-\d{2})\s*(买入|卖出|申购|赎回)\s*([^\d]+)\s*(\d+\.?\d*)\s*元?\s*净值?\s*(\d+\.?\d*)?/,
      /(\d{4}-\d{2}-\d{2})\s*([^\d]+)\s*(买入|卖出|申购|赎回)\s*(\d+\.?\d*)\s*元?/,
      /(\d{4}-\d{2}-\d{2})\s*(买入|卖出)\s*([^\d]+)\s*(\d+\.?\d*)/,
      /([^\d]+)\s*(买入|卖出)\s*(\d+\.?\d*)\s*元/,
    ];

    for (const line of lines) {
      let matched = false;
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
          let date, direction, name, amount, nav;
          if (pattern === patterns[0]) {
            date = match[1];
            direction = match[2] === '申购' ? '买入' : match[2] === '赎回' ? '卖出' : match[2];
            name = match[3].trim();
            amount = parseFloat(match[4]);
            nav = match[5] ? parseFloat(match[5]) : null;
          } else if (pattern === patterns[1]) {
            date = match[1];
            name = match[2].trim();
            direction = match[3] === '申购' ? '买入' : match[3] === '赎回' ? '卖出' : match[3];
            amount = parseFloat(match[4]);
            nav = null;
          } else if (pattern === patterns[2]) {
            date = match[1];
            direction = match[2];
            name = match[3].trim();
            amount = parseFloat(match[4]);
            nav = null;
          } else {
            name = match[1].trim();
            direction = match[2];
            amount = parseFloat(match[3]);
            date = new Date().toISOString().slice(0, 10);
            nav = null;
          }
          results.push({ date, direction, name, amount, nav, id: Date.now() + Math.random() });
          matched = true;
          break;
        }
      }
      if (!matched && line.trim()) {
        // 实在匹配不上，当成纯文本描述
        results.push({
          date: new Date().toISOString().slice(0, 10),
          direction: '买入',
          name: line.trim(),
          amount: 0,
          nav: null,
          id: Date.now() + Math.random()
        });
      }
    }
    return results;
  };

  // 点击识别
  const handleRecognize = () => {
    if (!inputText.trim()) {
      alert('请先粘贴要识别的交易文本');
      return;
    }
    const parsed = parseTransactions(inputText);
    if (parsed.length === 0) {
      alert('未能识别出有效交易，请检查格式');
      return;
    }
    setRecognizedList(parsed);
    setShowResult(true);
  };

  // 切换方向
  const toggleDirection = (index: number) => {
    const newList = [...recognizedList];
    newList[index].direction = newList[index].direction === '买入' ? '卖出' : '买入';
    setRecognizedList(newList);
  };

  // 删除单条
  const removeItem = (index: number) => {
    const newList = recognizedList.filter((_, i) => i !== index);
    setRecognizedList(newList);
    if (newList.length === 0) setShowResult(false);
  };

  // 批量导入
  const handleBatchImport = () => {
    if (recognizedList.length === 0) {
      alert('没有可导入的记录');
      return;
    }

    const newTransactions: Transaction[] = recognizedList.map((item, index) => ({
      id: `ai-${Date.now()}-${index}`,
      date: item.date,
      fundCode: '',
      fundName: item.name,
      direction: item.direction === '买入' ? 'buy' : 'sell',
      amount: item.amount || 0,
      nav: item.nav || 0,
      shares: item.amount && item.nav ? item.amount / item.nav : 0,
      fee: 0,
      platform: 'AI导入',
      note: '',
    }));

    const allTransactions = [...newTransactions, ...transactions];
    onTransactionComplete(holdings, allTransactions);
    alert(`✅ 成功导入 ${recognizedList.length} 条交易记录！`);
    setRecognizedList([]);
    setShowResult(false);
    setInputText('');
  };

  // 清空
  const handleClear = () => {
    setRecognizedList([]);
    setShowResult(false);
    setInputText('');
  };

  return (
    <div className="rounded-xl bg-[#161b2e] border border-white/[0.06] p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[#e8ecf1] text-sm font-semibold">🤖 AI 识图 · 批量识别交易</h3>
        <span className="text-[#6b7a8d] text-xs">支持多条同时识别</span>
      </div>

      {/* 输入区 */}
      <div className="border border-white/[0.06] rounded-xl p-3 bg-[#0c0f1a]/50">
        <textarea
          className="w-full bg-transparent border-none outline-none text-[#e8ecf1] text-sm resize-none"
          rows={4}
          placeholder={`示例格式：
2026-06-25 买入 科技ETF 10000元 净值1.234
2026-06-20 卖出 医疗健康 5000元 净值2.567
2026-06-15 申购 新能源车 3000元
消费精选 买入 8000元`}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
        />
        <div className="flex gap-2 mt-2">
          <button
            onClick={handleRecognize}
            className="px-4 py-1.5 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white text-sm rounded-lg transition-colors"
          >
            🔍 识别交易
          </button>
          <button
            onClick={handleClear}
            className="px-4 py-1.5 bg-[#1f2b33] hover:bg-[#2a3743] text-[#6b7a8d] text-sm rounded-lg transition-colors"
          >
            清空
          </button>
        </div>
      </div>

      {/* 识别结果 */}
      {showResult && recognizedList.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[#e8ecf1] text-sm font-medium">
              识别结果（共 {recognizedList.length} 条，点击方向可切换）
            </span>
            <button
              onClick={handleBatchImport}
              className="px-4 py-1.5 bg-[#3b82f6] hover:bg-[#2563eb] text-white text-sm rounded-lg transition-colors"
            >
              📥 批量导入
            </button>
          </div>

          <div className="space-y-1 max-h-60 overflow-y-auto">
            {recognizedList.map((item, index) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-2 rounded-lg bg-[#0c0f1a]/50 border border-white/[0.04]"
              >
                <div className="flex items-center gap-3 text-sm flex-wrap">
                  <span className="text-[#6b7a8d] text-xs">{item.date}</span>
                  <span className="text-[#e8ecf1] font-medium">{item.name}</span>
                  <span className="text-[#e8ecf1]">¥{item.amount?.toFixed(2) || '?'}</span>
                  {item.nav && <span className="text-[#6b7a8d] text-xs">净值 {item.nav.toFixed(4)}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleDirection(index)}
                    className={`px-3 py-0.5 rounded-full text-xs font-medium transition-colors ${
                      item.direction === '买入'
                        ? 'bg-[#e54d42]/20 text-[#e54d42] hover:bg-[#e54d42]/30'
                        : 'bg-[#07c160]/20 text-[#07c160] hover:bg-[#07c160]/30'
                    }`}
                  >
                    {item.direction}
                  </button>
                  <button
                    onClick={() => removeItem(index)}
                    className="text-[#6b7a8d] hover:text-[#e54d42] transition-colors text-sm"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
