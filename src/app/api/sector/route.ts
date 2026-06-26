import { NextResponse } from 'next/server';

export const runtime = 'edge';

// ========== 热门板块配置 ==========
// 每个板块包含代表性基金代码
// 板块涨跌幅 = 该板块内所有基金当日估算涨跌幅的简单平均值

interface SectorConfig {
  name: string;
  icon: string;
  fundCodes: string[];
}

const HOT_SECTORS: SectorConfig[] = [
  {
    name: '半导体',
    icon: '🔌',
    fundCodes: ['012414', '007300', '013427', '020457', '018734', '015596'],
  },
  {
    name: '消费电子',
    icon: '📱',
    fundCodes: ['015778', '011041', '018720', '007484', '020366'],
  },
  {
    name: '通信技术',
    icon: '📡',
    fundCodes: ['007817', '015603', '008086', '015809', '013928'],
  },
  {
    name: '人工智能',
    icon: '🤖',
    fundCodes: ['018028', '019543', '015569', '020017', '018741'],
  },
  {
    name: '新能源汽车',
    icon: '🚗',
    fundCodes: ['013309', '012983', '016470', '015591', '009068'],
  },
  {
    name: '光伏',
    icon: '☀️',
    fundCodes: ['012822', '015388', '011103', '010965', '013576'],
  },
  {
    name: '军工',
    icon: '✈️',
    fundCodes: ['013023', '010364', '012852', '011560', '014823'],
  },
  {
    name: '医疗生物',
    icon: '🏥',
    fundCodes: ['006003', '012421', '012897', '015597', '012901'],
  },
  {
    name: '创新药',
    icon: '💊',
    fundCodes: ['016173', '012738', '014118', '011173', '013423'],
  },
  {
    name: 'MLCC',
    icon: '⚡',
    fundCodes: ['015596', '007300', '011560', '018734', '013023'],
  },
  {
    name: '食品饮料',
    icon: '🍺',
    fundCodes: ['001632', '005827', '012417', '013024', '010444'],
  },
  {
    name: '算力',
    icon: '🖥️',
    fundCodes: ['018028', '013821', '019543', '015569', '014638'],
  },
];

// ========== 基金实时估值获取 ==========
interface FundEstimate {
  code: string;
  name: string;
  estimatedNav: number;     // 估算净值 (gsz) 或收盘净值 (dwjz)
  estimatedRate: number;    // 估算涨跌幅 (gszzl) 或收盘涨跌幅
  isEstimated: boolean;     // 是否为盘中估算值
  estimateTime: string | null; // 估值时间戳
}

/** 判断当前是否在盘中交易时间 */
function isInTradingHours(): boolean {
  const now = new Date();
  const day = now.getDay();
  if (day === 0 || day === 6) return false;
  const h = now.getHours();
  const m = now.getMinutes();
  const minutes = h * 60 + m;
  return minutes >= 570 && minutes <= 900;
}

/** 判断估算时间是否为今日数据 */
function isEstimateFromToday(estimateTime: string | null): boolean {
  if (!estimateTime) return false;
  const today = new Date();
  const y = today.getFullYear();
  const mo = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  return estimateTime.startsWith(`${y}-${mo}-${d}`);
}

/** 从fundgz获取单只基金实时估算 (与持仓列表同一数据源) */
async function fetchFundEstimate(code: string): Promise<FundEstimate | null> {
  try {
    const url = `https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://fund.eastmoney.com/',
      },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    const match = text.match(/jsonpgz\((\{[\s\S]*?\})\)/);
    if (!match) return null;
    const data = JSON.parse(match[1]);

    const gsz = parseFloat(data.gsz) || 0;
    const gszzl = parseFloat(data.gszzl) || 0;
    const dwjz = parseFloat(data.dwjz) || 0;
    const gztime = data.gztime || null;
    const fromToday = isEstimateFromToday(gztime);

    return {
      code: data.fundcode || code,
      name: data.name || '',
      estimatedNav: fromToday ? gsz : dwjz,
      estimatedRate: fromToday ? gszzl : 0,
      isEstimated: fromToday,
      estimateTime: gztime,
    };
  } catch {
    return null;
  }
}

/** 批量获取基金估算数据 (并发控制) */
async function batchFetchFundEstimates(codes: string[]): Promise<Map<string, FundEstimate>> {
  const result = new Map<string, FundEstimate>();
  const batchSize = 10;

  for (let i = 0; i < codes.length; i += batchSize) {
    const batch = codes.slice(i, i + batchSize);
    const estimates = await Promise.all(
      batch.map((code) => fetchFundEstimate(code))
    );
    for (let j = 0; j < batch.length; j++) {
      const est = estimates[j];
      if (est) {
        result.set(est.code, est);
      }
    }
  }

  return result;
}

// ========== 板块结果 ==========
interface HotSectorResult {
  key: string;
  name: string;
  icon: string;
  changeRate: number;
  fundCount: number;
  isEstimated: boolean;
  estimateTime: string | null;
  topFunds: { name: string; code: string; rate: number; isEstimated: boolean }[];
}

interface IndustrySectorResult {
  code: string;
  name: string;
  price: number;
  changeRate: number;
  changeAmt: number;
  stockCount: number;
  leadStock: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'hot';

  try {
    if (type === 'industry') {
      return await getIndustrySectors();
    }
    return await getHotSectors();
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function getHotSectors(): Promise<NextResponse> {
  const trading = isInTradingHours();

  // 收集所有需要的基金代码
  const allCodes = [...new Set(HOT_SECTORS.flatMap((s) => s.fundCodes))];

  // 统一使用fundgz获取实时估算 (与持仓列表同一数据源)
  const fundMap = await batchFetchFundEstimates(allCodes);

  // 计算每个板块的涨跌幅
  const sectors: HotSectorResult[] = HOT_SECTORS.map((sector) => {
    const sectorFunds = sector.fundCodes
      .map((code) => fundMap.get(code))
      .filter((f): f is FundEstimate => f !== undefined);

    // 简单平均涨跌幅
    const totalRate = sectorFunds.reduce((sum, f) => sum + f.estimatedRate, 0);
    const avgRate = sectorFunds.length > 0 ? parseFloat((totalRate / sectorFunds.length).toFixed(2)) : 0;

    // 板块是否有估算数据
    const hasEstimated = sectorFunds.some((f) => f.isEstimated);
    // 最早估算时间
    const estimateTime = sectorFunds.find((f) => f.estimateTime)?.estimateTime ?? null;

    // 找出涨跌幅前3的代表性基金
    const sortedFunds = [...sectorFunds].sort((a, b) => Math.abs(b.estimatedRate) - Math.abs(a.estimatedRate));
    const topFunds = sortedFunds.slice(0, 3).map((f) => ({
      name: f.name,
      code: f.code,
      rate: f.estimatedRate,
      isEstimated: f.isEstimated,
    }));

    return {
      key: sector.name,
      name: sector.name,
      icon: sector.icon,
      changeRate: avgRate,
      fundCount: sectorFunds.length,
      isEstimated: hasEstimated,
      estimateTime,
      topFunds,
    };
  }).sort((a, b) => b.changeRate - a.changeRate);

  return NextResponse.json({
    sectors,
    total: sectors.length,
    type: 'hot',
    isTradingHours: trading,
  }, {
    headers: { 'Cache-Control': trading ? 'public, max-age=60' : 'public, max-age=300' },
  });
}

async function getIndustrySectors(): Promise<NextResponse> {
  const res = await fetch('https://vip.stock.finance.sina.com.cn/q/view/newSinaHy.php', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://finance.sina.com.cn/',
    },
  });

  if (!res.ok) {
    return NextResponse.json({ error: '获取行业板块数据失败' }, { status: res.status });
  }

  const buffer = await res.arrayBuffer();
  const text = new TextDecoder('gbk').decode(buffer);

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return NextResponse.json({ sectors: [], total: 0, type: 'industry' });
  }

  const data = JSON.parse(jsonMatch[0]);

  const sectors: IndustrySectorResult[] = Object.entries(data)
    .map(([code, value]) => {
      const fields = (value as string).split(',');
      return {
        code,
        name: fields[1] || '',
        price: parseFloat(fields[3]) || 0,
        changeRate: parseFloat(fields[5]) || 0,
        changeAmt: parseFloat(fields[4]) || 0,
        stockCount: parseInt(fields[2], 10) || 0,
        leadStock: fields[12] || '',
      };
    })
    .sort((a, b) => b.changeRate - a.changeRate);

  return NextResponse.json({
    sectors,
    total: sectors.length,
    type: 'industry',
  }, {
    headers: { 'Cache-Control': 'public, max-age=60' },
  });
}
