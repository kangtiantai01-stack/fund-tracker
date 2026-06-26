import { NextResponse } from 'next/server';

export const runtime = 'edge';

// 东方财富API字段顺序:
// 0=code, 1=name(中文), 2=pinyin, 3=date(净值日期), 4=nav(单位净值),
// 5=accNav(累计净值), 6=dailyAmt(日涨跌额), 7=dailyRate(日涨跌幅%),
// 8=weekRate(周涨跌幅%), 9=monthRate(月涨跌幅%)

interface RankFund {
  code: string;
  name: string;
  date: string;
  nav: number;
  accNav: number;
  dailyAmt: number;
  dailyRate: number;
  weekRate: number;
  monthRate: number;
  // 盘中实时估算字段
  estimatedNav: number | null;
  estimatedRate: number | null;
  isEstimated: boolean;
  estimateTime: string | null;
}

/** 从天天基金估值接口获取单只基金盘中估算 */
async function fetchFundEstimate(code: string): Promise<{
  estimatedNav: number | null;
  estimatedRate: number | null;
  estimateTime: string | null;
} | null> {
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
    return {
      estimatedNav: parseFloat(data.gsz) || null,
      estimatedRate: parseFloat(data.gszzl) || null,
      estimateTime: data.gztime || null,
    };
  } catch {
    return null;
  }
}

/** 判断当前是否在盘中交易时间 (9:30-15:00 工作日) */
function isInTradingHours(): boolean {
  const now = new Date();
  const day = now.getDay();
  if (day === 0 || day === 6) return false;
  const h = now.getHours();
  const m = now.getMinutes();
  const minutes = h * 60 + m;
  return minutes >= 570 && minutes <= 900; // 9:30 - 15:00
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = parseInt(searchParams.get('size') || '50', 10);
  const sortOrder = searchParams.get('order') || 'desc';
  const fundType = searchParams.get('type') || 'gp';

  try {
    // Step 1: 获取排行榜基础数据 (T-1收盘)
    const url = `https://fund.eastmoney.com/data/rankhandler.aspx?op=ph&dt=kf&ft=${fundType}&rs=&gs=0&qd=0&pi=${page}&pn=${pageSize}&dx=1&sc=6yzf&st=${sortOrder}&v=${Date.now()}`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://fund.eastmoney.com/',
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: '获取排行数据失败' }, { status: res.status });
    }

    const text = await res.text();

    const datasMatch = text.match(/var\s+rankData\s*=\s*(\{[\s\S]*\});?\s*$/);
    if (!datasMatch) {
      return NextResponse.json({ error: '解析排行数据失败' }, { status: 502 });
    }

    const allRecordsMatch = datasMatch[1].match(/allRecords:(\d+)/);
    const total = allRecordsMatch ? parseInt(allRecordsMatch[1], 10) : 0;

    const datasStrMatch = datasMatch[1].match(/datas:\s*\[([\s\S]*?)\]\s*,\s*allRecords/);
    if (!datasStrMatch) {
      return NextResponse.json({ funds: [], total: 0, page, pageSize });
    }

    const itemRegex = /"([^"]*)"/g;
    const items: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = itemRegex.exec(datasStrMatch[1])) !== null) {
      items.push(m[1]);
    }

    const baseFunds: RankFund[] = items.map((item) => {
      const f = item.split(',');
      return {
        code: f[0] || '',
        name: f[1] || '',
        date: f[3] || '',
        nav: parseFloat(f[4]) || 0,
        accNav: parseFloat(f[5]) || 0,
        dailyAmt: parseFloat(f[6]) || 0,
        dailyRate: parseFloat(f[7]) || 0,
        weekRate: parseFloat(f[8]) || 0,
        monthRate: parseFloat(f[9]) || 0,
        estimatedNav: null,
        estimatedRate: null,
        isEstimated: false,
        estimateTime: null,
      };
    });

    // Step 2: 盘中时并行获取每只基金的实时估算数据
    const trading = isInTradingHours();

    if (trading && baseFunds.length > 0) {
      // 并行请求所有基金的估值 (最多并发20个)
      const batchSize = 20;
      for (let i = 0; i < baseFunds.length; i += batchSize) {
        const batch = baseFunds.slice(i, i + batchSize);
        const estimates = await Promise.all(
          batch.map((fund) => fetchFundEstimate(fund.code))
        );
        for (let j = 0; j < batch.length; j++) {
          const est = estimates[j];
          if (est && isEstimateFromToday(est.estimateTime)) {
            baseFunds[i + j].estimatedNav = est.estimatedNav;
            baseFunds[i + j].estimatedRate = est.estimatedRate;
            baseFunds[i + j].estimateTime = est.estimateTime;
            baseFunds[i + j].isEstimated = true;
          }
        }
      }

      // Step 3: 用估算数据覆盖T-1数据 (估算净值/涨跌幅替换收盘值)
      for (const fund of baseFunds) {
        if (fund.isEstimated && fund.estimatedNav !== null && fund.estimatedRate !== null) {
          fund.nav = fund.estimatedNav;
          fund.dailyRate = fund.estimatedRate;
        }
      }
    }

    return NextResponse.json({
      funds: baseFunds,
      total,
      page,
      pageSize,
      isTradingHours: trading,
    }, {
      headers: {
        'Cache-Control': trading ? 'public, max-age=60' : 'public, max-age=300',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
