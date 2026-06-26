'use client';

import { useState, useRef, useCallback } from 'react';
import type { Holding, Transaction } from '@/lib/types';
import { saveHoldings, saveTransactions, getSellFeeRate, calcHoldDays } from '@/lib/store';

// ========== 类型定义 ==========
type RecognizeMode = 'transaction' | 'holding';
type RecognizeStatus = 'idle' | 'uploading' | 'recognizing' | 'confirming' | 'success' | 'error';

interface TransactionResult {
  fundName: string;
  fundCode: string;
  amount: number;
  direction: 'buy' | 'sell';
  date: string;
  platform: string;
}

interface HoldingResultItem {
  fundName: string;
  fundCode: string;
  shares: number;
  holdingAmount: number;
  costPrice: number;
}

interface HoldingResult {
  holdings: HoldingResultItem[];
  platform: string;
  snapshotDate: string;
}

interface FundSearchResult {
  code: string;
  name: string;
}

interface AIImageRecognizerProps {
  holdings: Holding[];
  onTransactionComplete: (holdings: Holding[], transactions: Transaction[]) => void;
  onHoldingsSync: (holdings: Holding[]) => void;
  transactions: Transaction[];
}

// 基金代码搜索
async function searchFundCode(keyword: string): Promise<FundSearchResult[]> {
  if (!keyword || keyword.length < 2) return [];
  try {
    const res = await fetch(`/api/fund/search?keyword=${encodeURIComponent(keyword)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.funds || []) as FundSearchResult[];
  } catch {
    return [];
  }
}

export default function AIImageRecognizer({
  holdings,
  onTransactionComplete,
  onHoldingsSync,
  transactions,
}: AIImageRecognizerProps) {
  const [mode, setMode] = useState<RecognizeMode>('transaction');
  const [status, setStatus] = useState<RecognizeStatus>('idle');
  const [imagePreview, setImagePreview] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- 交易识图状态 ---
  const [txResult, setTxResult] = useState<TransactionResult | null>(null);
  const [txEdit, setTxEdit] = useState<TransactionResult | null>(null);

  // --- 持仓同步识图状态 ---
  const [holdingResult, setHoldingResult] = useState<HoldingResult | null>(null);
  const [holdingEdit, setHoldingEdit] = useState<HoldingResult | null>(null);
  const [searchingIdx, setSearchingIdx] = useState<number | null>(null);
  const [searchResults, setSearchResults] = useState<Map<number, FundSearchResult[]>>(new Map());

  // ========== 文件选择 ==========
  const handleFileSelect = useCallback(async (file: File) => {
    if (!file.type.match(/image\/(jpeg|png|webp)/)) {
      setErrorMsg('仅支持 JPG/PNG/WebP 格式');
      setStatus('error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('图片不能超过 10MB');
      setStatus('error');
      return;
    }

    setStatus('uploading');
    setErrorMsg('');

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      setImagePreview(base64);
      setStatus('recognizing');

      try {
        const res = await fetch('/api/recognize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64, mode }),
        });

        const data = await res.json();
        if (!res.ok || data.error) {
          setErrorMsg(data.error || '识别失败');
          setStatus('error');
          return;
        }

        if (data.mode === 'holding') {
          const result: HoldingResult = data.result;
          setHoldingResult(result);
          setHoldingEdit(result);
        } else {
          const result: TransactionResult = data.result;
          setTxResult(result);
          setTxEdit(result);
        }
        setStatus('confirming');
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : '网络错误，请重试');
        setStatus('error');
      }
    };
    reader.readAsDataURL(file);
  }, [mode]);

  // ========== 拖拽处理 ==========
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  // ========== 交易识图：确认添加 ==========
  const handleTransactionConfirm = async () => {
    if (!txEdit) return;
    const { fundCode, fundName, amount, direction, date, platform } = txEdit;

    if (!fundCode || fundCode.trim() === '') {
      setErrorMsg('请补充基金代码');
      return;
    }
    if (!amount || amount <= 0) {
      setErrorMsg('交易金额必须大于0');
      return;
    }

    try {
      const navRes = await fetch(`/api/fund/${fundCode.trim()}`);
      if (!navRes.ok) {
        setErrorMsg('无法获取该基金净值，请确认基金代码是否正确');
        return;
      }
      const navData = await navRes.json();
      if (navData.error) {
        setErrorMsg('无法获取该基金净值，请确认基金代码是否正确');
        return;
      }
      const currentNav = parseFloat(navData.gsz) || parseFloat(navData.dwjz) || 0;
      if (currentNav === 0) {
        setErrorMsg('获取净值失败，请稍后重试');
        return;
      }

      const actualName = navData.name || fundName;
      const newHoldings = [...holdings];
      const newTransactions = [...transactions];

      if (direction === 'buy') {
        const feeRate = 0.001;
        const fee = amount * feeRate;
        const actualAmount = amount - fee;
        const shares = actualAmount / currentNav;

        const existingIdx = newHoldings.findIndex(h => h.code === fundCode.trim());
        if (existingIdx >= 0) {
          const existing = newHoldings[existingIdx];
          const totalShares = existing.shares + shares;
          const totalCost = existing.shares * existing.costPrice + actualAmount;
          newHoldings[existingIdx] = {
            ...existing,
            shares: totalShares,
            costPrice: totalCost / totalShares,
            latestNav: currentNav,
            name: actualName,
          };
        } else {
          newHoldings.push({
            code: fundCode.trim(),
            name: actualName,
            shares,
            costPrice: currentNav,
            latestNav: currentNav,
            yesterdayNav: parseFloat(navData.dwjz) || currentNav,
            dailyChangeRate: parseFloat(navData.gszzl) || 0,
            updateTime: navData.gztime || '',
            isEstimated: false,
          });
        }

        newTransactions.push({
          id: Date.now().toString(),
          date,
          fundCode: fundCode.trim(),
          fundName: actualName,
          direction: 'buy',
          amount,
          nav: currentNav,
          shares,
          fee,
          feeRate: feeRate * 100,
          before15: true,
          platform: platform || '其他',
        });
      } else {
        const existingIdx = newHoldings.findIndex(h => h.code === fundCode.trim());
        if (existingIdx < 0) {
          setErrorMsg('未找到该基金持仓，无法卖出');
          return;
        }
        const existing = newHoldings[existingIdx];
        const sellShares = amount / currentNav;

        if (sellShares > existing.shares + 0.01) {
          setErrorMsg(`卖出份额(${sellShares.toFixed(2)})超过持有份额(${existing.shares.toFixed(2)})`);
          return;
        }

        const holdDays = calcHoldDays(date);
        const feeRate = getSellFeeRate(holdDays);
        const fee = amount * feeRate;
        const actualSellAmount = amount - fee;

        if (sellShares >= existing.shares - 0.01) {
          newHoldings.splice(existingIdx, 1);
        } else {
          newHoldings[existingIdx] = { ...existing, shares: existing.shares - sellShares };
        }

        newTransactions.push({
          id: Date.now().toString(),
          date,
          fundCode: fundCode.trim(),
          fundName: actualName,
          direction: 'sell',
          amount: actualSellAmount,
          nav: currentNav,
          shares: sellShares,
          fee,
          feeRate: feeRate * 100,
          before15: true,
          platform: platform || '其他',
        });
      }

      saveHoldings(newHoldings);
      saveTransactions(newTransactions);
      onTransactionComplete(newHoldings, newTransactions);
      setStatus('success');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : '添加失败，请重试');
      setStatus('error');
    }
  };

  // ========== 持仓同步：搜索基金代码 ==========
  const handleSearchCode = async (idx: number) => {
    const item = holdingEdit?.holdings[idx];
    if (!item || !item.fundName) return;

    setSearchingIdx(idx);
    const results = await searchFundCode(item.fundName.trim());
    const newMap = new Map(searchResults);
    newMap.set(idx, results);
    setSearchResults(newMap);
    setSearchingIdx(null);

    // 如果只有一个结果，自动填入
    if (results.length === 1) {
      const newHoldings = [...(holdingEdit?.holdings || [])];
      newHoldings[idx] = { ...newHoldings[idx], fundCode: results[0].code, fundName: results[0].name };
      setHoldingEdit({ ...(holdingEdit || holdingResult!), holdings: newHoldings });
    }
  };

  // ========== 持仓同步：选择搜索结果 ==========
  const handleSelectSearchResult = (idx: number, result: FundSearchResult) => {
    const newHoldings = [...(holdingEdit?.holdings || [])];
    newHoldings[idx] = { ...newHoldings[idx], fundCode: result.code, fundName: result.name };
    setHoldingEdit({ ...(holdingEdit || holdingResult!), holdings: newHoldings });
    // 清除搜索结果
    const newMap = new Map(searchResults);
    newMap.delete(idx);
    setSearchResults(newMap);
  };

  // ========== 持仓同步：确认写入 ==========
  const handleHoldingSyncConfirm = async () => {
    if (!holdingEdit || holdingEdit.holdings.length === 0) return;

    // 检查是否有必填字段缺失
    const missingCode = holdingEdit.holdings.some(
      item => (!item.fundCode || item.fundCode.trim() === '') && item.fundName.trim() !== ''
    );
    if (missingCode) {
      setErrorMsg('部分基金缺少代码，请点击"搜索"补全代码后再同步');
      setStatus('error');
      return;
    }

    try {
      // 为每只基金获取实时净值
      const newHoldings: Holding[] = [];

      for (const item of holdingEdit.holdings) {
        if (!item.fundCode || item.fundCode.trim() === '') {
          // 无代码且无名称，跳过
          continue;
        }

        const code = item.fundCode.trim();
        let name = item.fundName;
        let nav = 0;
        let yesterdayNav = 0;
        let dailyRate = 0;
        let updateTime = '';
        let isEstimated = false;

        // 尝试获取实时净值
        try {
          const navRes = await fetch(`/api/fund/${code}`);
          if (navRes.ok) {
            const navData = await navRes.json();
            if (!navData.error) {
              name = navData.name || name;
              const gsz = parseFloat(navData.gsz);
              const dwjz = parseFloat(navData.dwjz);
              const gszzl = parseFloat(navData.gszzl);
              const hasEstimate = !isNaN(gsz) && gsz > 0 && navData.gztime;
              const isToday = hasEstimate && navData.gztime.includes(new Date().toISOString().slice(0, 10));

              if (isToday) {
                nav = gsz;
                dailyRate = gszzl;
                isEstimated = true;
              } else {
                nav = dwjz || 0;
                dailyRate = gszzl || 0;
              }
              yesterdayNav = dwjz || 0;
              updateTime = navData.gztime || '';
            }
          }
        } catch {
          // 净值获取失败，继续使用默认值
        }

        // 计算份额和成本价
        let shares = item.shares;
        let costPrice = item.costPrice;

        if (shares === 0 && item.holdingAmount > 0 && nav > 0) {
          shares = item.holdingAmount / nav;
        }
        if (costPrice === 0 && item.holdingAmount > 0 && shares > 0) {
          costPrice = item.holdingAmount / shares;
        }
        if (costPrice === 0 && nav > 0) {
          costPrice = nav; // 降级：用当前净值作成本
        }
        if (shares === 0) {
          continue; // 无法确定份额，跳过
        }

        newHoldings.push({
          code,
          name,
          shares,
          costPrice,
          latestNav: nav,
          yesterdayNav,
          dailyChangeRate: dailyRate,
          updateTime,
          isEstimated,
        });
      }

      if (newHoldings.length === 0) {
        setErrorMsg('没有有效的持仓数据可以同步，请确认基金代码和份额信息');
        setStatus('error');
        return;
      }

      saveHoldings(newHoldings);
      // 持仓同步时不生成交易记录（因为是批量同步快照，非逐笔交易）
      onHoldingsSync(newHoldings);
      setStatus('success');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : '同步失败，请重试');
      setStatus('error');
    }
  };

  // ========== 重置 ==========
  const handleReset = () => {
    setStatus('idle');
    setImagePreview('');
    setErrorMsg('');
    setTxResult(null);
    setTxEdit(null);
    setHoldingResult(null);
    setHoldingEdit(null);
    setSearchingIdx(null);
    setSearchResults(new Map());
  };

  // 切换模式时重置
  const handleModeSwitch = (newMode: RecognizeMode) => {
    setMode(newMode);
    handleReset();
  };

  // ========== 渲染 ==========
  const uploadHint = mode === 'transaction'
    ? '上传交易记录截图，识别买入/卖出交易'
    : '上传持仓列表截图，批量同步当前持仓';

  return (
    <div className="rounded-xl bg-[#161b2e] border border-white/[0.06] overflow-hidden">
      {/* 标题栏 */}
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-[#8b5cf6]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <h3 className="text-[#e8ecf1] font-medium text-sm">AI识图</h3>
          </div>
          {status !== 'idle' && (
            <button onClick={handleReset} className="text-[#6b7a8d] hover:text-[#e8ecf1] transition-colors text-xs">
              关闭
            </button>
          )}
        </div>
        {/* 模式切换 Tab */}
        <div className="flex bg-[#0c0f1a] rounded-lg p-0.5">
          <button
            onClick={() => handleModeSwitch('transaction')}
            className={`flex-1 py-1.5 text-xs rounded-md transition-colors font-medium ${
              mode === 'transaction'
                ? 'bg-[#8b5cf6] text-white'
                : 'text-[#6b7a8d] hover:text-[#e8ecf1]'
            }`}
          >
            交易记录
          </button>
          <button
            onClick={() => handleModeSwitch('holding')}
            className={`flex-1 py-1.5 text-xs rounded-md transition-colors font-medium ${
              mode === 'holding'
                ? 'bg-[#8b5cf6] text-white'
                : 'text-[#6b7a8d] hover:text-[#e8ecf1]'
            }`}
          >
            持仓同步
          </button>
        </div>
      </div>

      <div className="p-4">
        {/* ====== idle: 上传区域 ====== */}
        {status === 'idle' && (
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className="border-2 border-dashed border-white/10 rounded-xl p-6 text-center cursor-pointer hover:border-[#8b5cf6]/50 hover:bg-[#8b5cf6]/5 transition-all"
          >
            <svg className="w-10 h-10 mx-auto mb-3 text-[#6b7a8d]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-[#e8ecf1] text-sm font-medium mb-1">
              {mode === 'transaction' ? '上传交易截图' : '上传持仓截图'}
            </p>
            <p className="text-[#6b7a8d] text-xs">{uploadHint}</p>
            <p className="text-[#6b7a8d] text-xs mt-1">JPG / PNG / WebP，最大10MB</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
                e.target.value = '';
              }}
              className="hidden"
            />
          </div>
        )}

        {/* ====== uploading / recognizing ====== */}
        {(status === 'uploading' || status === 'recognizing') && (
          <div className="text-center py-8">
            <div className="w-8 h-8 border-2 border-[#8b5cf6] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            {status === 'uploading' ? (
              <p className="text-[#6b7a8d] text-sm">正在上传图片...</p>
            ) : (
              <>
                <p className="text-[#e8ecf1] text-sm font-medium mb-1">AI正在识别截图...</p>
                <p className="text-[#6b7a8d] text-xs">
                  {mode === 'transaction'
                    ? '正在提取基金名称、交易金额等信息'
                    : '正在提取所有基金持仓信息...'}
                </p>
              </>
            )}
          </div>
        )}

        {/* ====== confirming: 交易记录确认 ====== */}
        {status === 'confirming' && mode === 'transaction' && txEdit && (
          <div className="space-y-4">
            {imagePreview && (
              <div className="rounded-lg overflow-hidden border border-white/[0.06] max-h-40">
                <img src={imagePreview} alt="交易截图" className="w-full h-full object-contain bg-[#0c0f1a]" />
              </div>
            )}

            <div className="bg-[#0c0f1a] rounded-lg p-3 space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-[#8b5cf6]" />
                <span className="text-[#e8ecf1] text-sm font-medium">识别结果</span>
                <span className="text-[#6b7a8d] text-xs">（可编辑修改）</span>
              </div>

              <div>
                <label className="text-[#6b7a8d] text-xs mb-1 block">基金名称</label>
                <input
                  type="text"
                  value={txEdit.fundName}
                  onChange={(e) => setTxEdit({ ...txEdit, fundName: e.target.value })}
                  className="w-full bg-[#161b2e] border border-white/10 rounded-lg px-3 py-2 text-[#e8ecf1] text-sm focus:border-[#8b5cf6] focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[#6b7a8d] text-xs mb-1 block">
                  基金代码 {!txEdit.fundCode && <span className="text-[#e54d42] ml-1">*必填</span>}
                </label>
                <input
                  type="text"
                  value={txEdit.fundCode}
                  onChange={(e) => setTxEdit({ ...txEdit, fundCode: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                  placeholder="6位基金代码"
                  className="w-full bg-[#161b2e] border border-white/10 rounded-lg px-3 py-2 text-[#e8ecf1] text-sm focus:border-[#8b5cf6] focus:outline-none placeholder:text-[#4a5568]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[#6b7a8d] text-xs mb-1 block">交易方向</label>
                  <select
                    value={txEdit.direction}
                    onChange={(e) => setTxEdit({ ...txEdit, direction: e.target.value as 'buy' | 'sell' })}
                    className="w-full bg-[#161b2e] border border-white/10 rounded-lg px-3 py-2 text-[#e8ecf1] text-sm focus:border-[#8b5cf6] focus:outline-none"
                  >
                    <option value="buy">买入</option>
                    <option value="sell">卖出</option>
                  </select>
                </div>
                <div>
                  <label className="text-[#6b7a8d] text-xs mb-1 block">交易金额(元)</label>
                  <input
                    type="number"
                    value={txEdit.amount || ''}
                    onChange={(e) => setTxEdit({ ...txEdit, amount: parseFloat(e.target.value) || 0 })}
                    step="0.01"
                    min="0"
                    className="w-full bg-[#161b2e] border border-white/10 rounded-lg px-3 py-2 text-[#e8ecf1] text-sm focus:border-[#8b5cf6] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[#6b7a8d] text-xs mb-1 block">交易日期</label>
                  <input
                    type="date"
                    value={txEdit.date}
                    onChange={(e) => setTxEdit({ ...txEdit, date: e.target.value })}
                    className="w-full bg-[#161b2e] border border-white/10 rounded-lg px-3 py-2 text-[#e8ecf1] text-sm focus:border-[#8b5cf6] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[#6b7a8d] text-xs mb-1 block">交易平台</label>
                  <select
                    value={txEdit.platform}
                    onChange={(e) => setTxEdit({ ...txEdit, platform: e.target.value })}
                    className="w-full bg-[#161b2e] border border-white/10 rounded-lg px-3 py-2 text-[#e8ecf1] text-sm focus:border-[#8b5cf6] focus:outline-none"
                  >
                    <option value="支付宝">支付宝</option>
                    <option value="天天基金">天天基金</option>
                    <option value="微信理财通">微信理财通</option>
                    <option value="其他">其他</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={handleReset} className="flex-1 py-2.5 rounded-lg border border-white/10 text-[#6b7a8d] text-sm hover:bg-white/5 transition-colors">
                取消
              </button>
              <button
                onClick={handleTransactionConfirm}
                disabled={!txEdit.fundCode || !txEdit.amount}
                className="flex-1 py-2.5 rounded-lg bg-[#8b5cf6] text-white text-sm font-medium hover:bg-[#7c3aed] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                确认添加
              </button>
            </div>
          </div>
        )}

        {/* ====== confirming: 持仓同步确认 ====== */}
        {status === 'confirming' && mode === 'holding' && holdingEdit && (
          <div className="space-y-4">
            {imagePreview && (
              <div className="rounded-lg overflow-hidden border border-white/[0.06] max-h-40">
                <img src={imagePreview} alt="持仓截图" className="w-full h-full object-contain bg-[#0c0f1a]" />
              </div>
            )}

            <div className="bg-[#0c0f1a] rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#8b5cf6]" />
                  <span className="text-[#e8ecf1] text-sm font-medium">识别结果</span>
                  <span className="text-[#6b7a8d] text-xs">（可编辑修改）</span>
                </div>
                <span className="text-[#6b7a8d] text-xs">
                  {holdingEdit.holdings.length} 只基金
                </span>
              </div>

              {/* 每只基金的可编辑卡片 */}
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {holdingEdit.holdings.map((item, idx) => {
                  const hasCode = item.fundCode && item.fundCode.trim() !== '';
                  const itemSearchResults = searchResults.get(idx) || [];
                  const isSearching = searchingIdx === idx;
                  const showSearchDropdown = itemSearchResults.length > 0 && !hasCode;

                  return (
                    <div key={idx} className={`bg-[#161b2e] rounded-lg p-3 border ${!hasCode ? 'border-amber-500/40' : 'border-white/[0.04]'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[#e8ecf1] text-xs font-medium">
                          基金 #{idx + 1}
                          {!hasCode && <span className="text-amber-400 ml-2 text-[10px]">需补全代码</span>}
                        </span>
                        <button
                          onClick={() => {
                            const newHoldings = holdingEdit.holdings.filter((_, i) => i !== idx);
                            setHoldingEdit({ ...holdingEdit, holdings: newHoldings });
                            // 清除搜索结果
                            const newMap = new Map(searchResults);
                            newMap.delete(idx);
                            setSearchResults(newMap);
                          }}
                          className="text-[#6b7a8d] hover:text-[#e54d42] text-xs transition-colors"
                        >
                          删除
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="col-span-2">
                          <label className="text-[#6b7a8d] text-[10px] mb-0.5 block">基金名称</label>
                          <input
                            type="text"
                            value={item.fundName}
                            onChange={(e) => {
                              const newHoldings = [...holdingEdit.holdings];
                              newHoldings[idx] = { ...newHoldings[idx], fundName: e.target.value };
                              setHoldingEdit({ ...holdingEdit, holdings: newHoldings });
                            }}
                            className="w-full bg-[#0c0f1a] border border-white/10 rounded px-2 py-1.5 text-[#e8ecf1] text-xs focus:border-[#8b5cf6] focus:outline-none"
                          />
                        </div>
                        <div className="relative">
                          <label className="text-[#6b7a8d] text-[10px] mb-0.5 block">
                            基金代码 {!hasCode && <span className="text-amber-400">*必填</span>}
                          </label>
                          <div className="flex gap-1">
                            <input
                              type="text"
                              value={item.fundCode}
                              onChange={(e) => {
                                const newHoldings = [...holdingEdit.holdings];
                                newHoldings[idx] = { ...newHoldings[idx], fundCode: e.target.value.replace(/\D/g, '').slice(0, 6) };
                                setHoldingEdit({ ...holdingEdit, holdings: newHoldings });
                              }}
                              placeholder="6位"
                              className="flex-1 min-w-0 bg-[#0c0f1a] border border-white/10 rounded px-2 py-1.5 text-[#e8ecf1] text-xs focus:border-[#8b5cf6] focus:outline-none placeholder:text-[#4a5568]"
                            />
                            {!hasCode && (
                              <button
                                onClick={() => handleSearchCode(idx)}
                                disabled={isSearching || !item.fundName}
                                className="shrink-0 px-2 py-1.5 rounded bg-[#8b5cf6]/20 text-[#8b5cf6] text-[10px] hover:bg-[#8b5cf6]/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                              >
                                {isSearching ? '...' : '搜索'}
                              </button>
                            )}
                          </div>
                          {/* 搜索结果下拉 */}
                          {showSearchDropdown && (
                            <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-[#0c0f1a] border border-white/10 rounded-lg overflow-hidden shadow-lg">
                              {itemSearchResults.map((r, rIdx) => (
                                <button
                                  key={rIdx}
                                  onClick={() => handleSelectSearchResult(idx, r)}
                                  className="w-full px-3 py-2 text-left hover:bg-white/5 transition-colors border-b border-white/[0.04] last:border-0"
                                >
                                  <span className="text-[#e8ecf1] text-xs">{r.code}</span>
                                  <span className="text-[#6b7a8d] text-xs ml-2">{r.name}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="text-[#6b7a8d] text-[10px] mb-0.5 block">持有份额</label>
                          <input
                            type="number"
                            value={item.shares || ''}
                            onChange={(e) => {
                              const newHoldings = [...holdingEdit.holdings];
                              newHoldings[idx] = { ...newHoldings[idx], shares: parseFloat(e.target.value) || 0 };
                              setHoldingEdit({ ...holdingEdit, holdings: newHoldings });
                            }}
                            step="0.01"
                            placeholder="0=自动算"
                            className="w-full bg-[#0c0f1a] border border-white/10 rounded px-2 py-1.5 text-[#e8ecf1] text-xs focus:border-[#8b5cf6] focus:outline-none placeholder:text-[#4a5568]"
                          />
                        </div>
                        <div>
                          <label className="text-[#6b7a8d] text-[10px] mb-0.5 block">持仓金额(元)</label>
                          <input
                            type="number"
                            value={item.holdingAmount || ''}
                            onChange={(e) => {
                              const newHoldings = [...holdingEdit.holdings];
                              newHoldings[idx] = { ...newHoldings[idx], holdingAmount: parseFloat(e.target.value) || 0 };
                              setHoldingEdit({ ...holdingEdit, holdings: newHoldings });
                            }}
                            step="0.01"
                            placeholder="0=自动算"
                            className="w-full bg-[#0c0f1a] border border-white/10 rounded px-2 py-1.5 text-[#e8ecf1] text-xs focus:border-[#8b5cf6] focus:outline-none placeholder:text-[#4a5568]"
                          />
                        </div>
                        <div>
                          <label className="text-[#6b7a8d] text-[10px] mb-0.5 block">成本价</label>
                          <input
                            type="number"
                            value={item.costPrice || ''}
                            onChange={(e) => {
                              const newHoldings = [...holdingEdit.holdings];
                              newHoldings[idx] = { ...newHoldings[idx], costPrice: parseFloat(e.target.value) || 0 };
                              setHoldingEdit({ ...holdingEdit, holdings: newHoldings });
                            }}
                            step="0.0001"
                            placeholder="0=自动算"
                            className="w-full bg-[#0c0f1a] border border-white/10 rounded px-2 py-1.5 text-[#e8ecf1] text-xs focus:border-[#8b5cf6] focus:outline-none placeholder:text-[#4a5568]"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 平台和日期 */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/[0.04]">
                <div>
                  <label className="text-[#6b7a8d] text-xs mb-1 block">交易平台</label>
                  <select
                    value={holdingEdit.platform}
                    onChange={(e) => setHoldingEdit({ ...holdingEdit, platform: e.target.value })}
                    className="w-full bg-[#161b2e] border border-white/10 rounded-lg px-3 py-2 text-[#e8ecf1] text-sm focus:border-[#8b5cf6] focus:outline-none"
                  >
                    <option value="支付宝">支付宝</option>
                    <option value="天天基金">天天基金</option>
                    <option value="微信理财通">微信理财通</option>
                    <option value="其他">其他</option>
                  </select>
                </div>
                <div>
                  <label className="text-[#6b7a8d] text-xs mb-1 block">截图日期</label>
                  <input
                    type="date"
                    value={holdingEdit.snapshotDate}
                    onChange={(e) => setHoldingEdit({ ...holdingEdit, snapshotDate: e.target.value })}
                    className="w-full bg-[#161b2e] border border-white/10 rounded-lg px-3 py-2 text-[#e8ecf1] text-sm focus:border-[#8b5cf6] focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* 同步提示 */}
            <div className="bg-amber-500/10 rounded-lg px-3 py-2 border border-amber-500/20">
              <p className="text-amber-400 text-xs">
                持仓同步将<strong>替换</strong>当前所有持仓数据（不生成交易记录）。请确认识别结果无误后再同步。
              </p>
            </div>

            <div className="flex gap-3">
              <button onClick={handleReset} className="flex-1 py-2.5 rounded-lg border border-white/10 text-[#6b7a8d] text-sm hover:bg-white/5 transition-colors">
                取消
              </button>
              <button
                onClick={handleHoldingSyncConfirm}
                disabled={holdingEdit.holdings.length === 0}
                className="flex-1 py-2.5 rounded-lg bg-[#8b5cf6] text-white text-sm font-medium hover:bg-[#7c3aed] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {holdingEdit.holdings.some(h => !h.fundCode || h.fundCode.trim() === '')
                  ? `补全代码后同步`
                  : `确认同步 (${holdingEdit.holdings.length}只)`
                }
              </button>
            </div>
          </div>
        )}

        {/* ====== success ====== */}
        {status === 'success' && (
          <div className="text-center py-6">
            <div className="w-12 h-12 rounded-full bg-[#07c160]/20 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-[#07c160]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            {mode === 'transaction' && txResult && (
              <>
                <p className="text-[#e8ecf1] text-sm font-medium mb-1">交易添加成功</p>
                <p className="text-[#6b7a8d] text-xs">
                  {txResult.direction === 'buy' ? '买入' : '卖出'} {txResult.fundName || txResult.fundCode}
                  {' '}{txResult.amount.toFixed(2)}元
                </p>
              </>
            )}
            {mode === 'holding' && holdingResult && (
              <>
                <p className="text-[#e8ecf1] text-sm font-medium mb-1">持仓同步成功</p>
                <p className="text-[#6b7a8d] text-xs">
                  已同步 {holdingResult.holdings.length} 只基金持仓
                </p>
              </>
            )}
            <button
              onClick={handleReset}
              className="mt-4 px-6 py-2 rounded-lg bg-[#8b5cf6]/20 text-[#8b5cf6] text-sm hover:bg-[#8b5cf6]/30 transition-colors"
            >
              继续识图
            </button>
          </div>
        )}

        {/* ====== error ====== */}
        {status === 'error' && (
          <div className="text-center py-6">
            <div className="w-12 h-12 rounded-full bg-[#e54d42]/20 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-[#e54d42]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-[#e54d42] text-sm font-medium mb-1">识别失败</p>
            <p className="text-[#6b7a8d] text-xs">{errorMsg}</p>
            <button
              onClick={handleReset}
              className="mt-4 px-6 py-2 rounded-lg bg-[#8b5cf6]/20 text-[#8b5cf6] text-sm hover:bg-[#8b5cf6]/30 transition-colors"
            >
              重新上传
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
