// 基金持仓类型
export interface Holding {
  code: string;
  name: string;
  shares: number;       // 持有份额
  costPrice: number;    // 成本价（每份成本）
  // 以下字段从实时数据计算
  latestNav: number;    // 最新估值净值 (gsz)
  yesterdayNav: number; // 昨日净值 (dwjz)
  dailyChangeRate: number; // 今日涨跌幅 (gszzl)，百分比如 -2.46
  updateTime: string;   // 估值时间
  isEstimated: boolean; // 是否为盘中估算值（true=估算，false=收盘）
}

// 计算后的持仓展示数据
export interface HoldingDisplay extends Holding {
  holdingAmount: number;      // 持仓金额 = shares * latestNav
  costAmount: number;         // 成本金额 = shares * costPrice
  holdingProfit: number;      // 持有收益 = holdingAmount - costAmount
  holdingProfitRate: number;  // 持有收益率 = holdingProfit / costAmount * 100
  dailyChangeAmount: number;  // 今日涨跌额 = shares * (latestNav - yesterdayNav)
}

// 交易记录
export interface Transaction {
  id: string;
  date: string;           // 交易日期
  fundCode: string;       // 基金代码
  fundName: string;       // 基金名称
  direction: 'buy' | 'sell'; // 交易方向
  amount: number;         // 交易金额
  before15: boolean;      // 是否15点前
  platform: string;       // 买入平台
  feeRate: number;        // 买入费率（%）
  nav: number;            // 交易净值
  shares: number;         // 交易份额
  fee: number;            // 手续费
  transactionDate?: string; // 交易日期（后端字段兼容）
  confirmDate?: string;     // 确认日
}

// 基金实时估值数据（来自API）
export interface FundRealtimeData {
  fundcode: string;
  name: string;
  jzrq: string;     // 净值日期
  dwjz: string;     // 昨日净值
  gsz: string;      // 估算净值
  gszzl: string;    // 估算涨跌幅
  gztime: string;   // 估值时间
}

// 基金排行项
export interface FundRankItem {
  code: string;       // 基金代码
  name: string;       // 基金名称
  date: string;       // 净值日期
  nav: number;        // 单位净值（盘中=估算净值，非交易时间=收盘净值）
  accNav: number;     // 累计净值
  dailyAmt: number;   // 日涨跌额
  dailyRate: number;  // 日涨跌幅(%)（盘中=估算涨跌幅，非交易时间=收盘涨跌幅）
  weekRate: number;   // 周涨跌幅(%)
  monthRate: number;  // 月涨跌幅(%)
  // 盘中实时估算字段
  isEstimated: boolean;      // 是否为盘中估算值
  estimateTime: string | null; // 估算时间戳
}

// 板块项（行业板块 - 新浪数据源）
export interface SectorItem {
  code: string;      // 板块代码
  name: string;      // 板块名称
  changeRate: number; // 涨跌幅(%)
  changeAmt: number;  // 涨跌额
  price: number;      // 最新价/指数
  stockCount: number; // 个股数量
  leadStock: string;  // 领涨股
}

// 热门板块项（基金池映射 - 东方财富数据源）
export interface HotSectorItem {
  key: string;            // 板块标识
  name: string;           // 板块名称
  changeRate: number;     // 平均涨跌幅(%)
  fundCount: number;      // 板块内基金数量
  isEstimated: boolean;   // 是否为盘中估算值
  estimateTime: string | null; // 估算时间戳
  topFunds: Array<{       // 代表性基金
    code: string;
    name: string;
    rate: number;           // 当日涨跌幅
    isEstimated: boolean;   // 是否为估算值
  }>;
  icon: string;           // 板块图标emoji
}

// 板块类型
export type SectorType = 'industry' | 'hot';

// 持仓列表视图模式
export type ViewMode = 'card' | 'table';

// 初始持仓数据
export const INITIAL_HOLDINGS: Omit<Holding, 'latestNav' | 'yesterdayNav' | 'dailyChangeRate' | 'updateTime' | 'isEstimated'>[] = [
  { code: '023639', name: '国泰恒生A股电网设备ETF联接C', shares: 2508.4, costPrice: 3.9866 },
  { code: '026211', name: '平安科技精选混合C', shares: 2240.85, costPrice: 2.2313 },
  { code: '025793', name: '东方阿尔法科技甄选混合C', shares: 3179.04, costPrice: 1.5728 },
  { code: '011452', name: '华泰柏瑞质量成长C', shares: 557.77, costPrice: 3.5857 },
  { code: '025547', name: '财通周期优选混合C', shares: 1597.44, costPrice: 1.2520 },
  { code: '017745', name: '嘉实绿色主题股票C', shares: 2000, costPrice: 1.0 },
  { code: '008984', name: '财通科技创新混合C', shares: 2000, costPrice: 1.0 },
  { code: '008989', name: '大成科技创新混合C', shares: 2000, costPrice: 1.0 },
];
