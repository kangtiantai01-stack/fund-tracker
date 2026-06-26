import { NextResponse } from 'next/server';

export const runtime = 'edge';

/**
 * 基金搜索API — 按名称关键词搜索基金代码
 * 使用东方财富 searchAPI 接口，仅返回基金类别结果
 * 支持渐进式搜索：先用完整名称，再缩短关键词
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get('keyword')?.trim();

  if (!keyword || keyword.length < 2) {
    return NextResponse.json({ funds: [], total: 0 });
  }

  try {
    // 渐进式搜索：先用完整名称，若无结果则缩短
    const searchAttempts = buildSearchAttempts(keyword);

    for (const searchKey of searchAttempts) {
      if (searchKey.length < 2) continue;
      const result = await searchOnce(searchKey);
      if (result.length > 0) {
        return NextResponse.json({
          funds: result,
          total: result.length,
        }, {
          headers: { 'Cache-Control': 'public, max-age=300' },
        });
      }
    }

    return NextResponse.json({ funds: [], total: 0 }, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '搜索失败';
    console.error('[fund-search] Error:', message);
    return NextResponse.json({ funds: [], total: 0, error: message }, { status: 500 });
  }
}

function buildSearchAttempts(keyword: string): string[] {
  const attempts: string[] = [keyword];

  // 尝试去掉常见后缀
  const suffixes = ['发起联接C', '发起联接A', '联接C', '联接A', 'ETF联接C', 'ETF联接A', '发起式C', '发起式A', 'C', 'A'];
  let strippedSuffix = keyword;
  for (const suffix of suffixes) {
    if (keyword.endsWith(suffix) && (suffix.length > 1 || keyword.length > 4)) {
      const stripped = keyword.slice(0, -suffix.length);
      attempts.push(stripped);
      strippedSuffix = stripped;
      break;
    }
  }

  // 尝试去掉"恒生"等可能不在简称中的词
  const noiseWords = ['恒生', '发起', '定期开放', '滚动持有'];
  for (const noise of noiseWords) {
    if (keyword.includes(noise)) {
      attempts.push(keyword.replace(noise, ''));
    }
    if (strippedSuffix.includes(noise)) {
      attempts.push(strippedSuffix.replace(noise, ''));
    }
  }

  if (keyword.length > 10) {
    attempts.push(keyword.slice(0, 10));
  }
  if (keyword.length > 8) {
    attempts.push(keyword.slice(0, 8));
  }
  if (keyword.length > 6) {
    attempts.push(keyword.slice(0, 6));
  }
  return attempts;
}

async function searchOnce(keyword: string): Promise<{ code: string; name: string; type: string }[]> {
  try {
    const url = `https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?callback=cb&m=1&key=${encodeURIComponent(keyword)}`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://fund.eastmoney.com/',
      },
    });

    if (!res.ok) return [];

    const text = await res.text();
    const jsonMatch = text.match(/cb\((\{[\s\S]*\})\)/);
    if (!jsonMatch) return [];

    const data = JSON.parse(jsonMatch[1]);
    const datas: Record<string, unknown>[] = data?.Datas || [];

    // 过滤：只保留基金类别(CATEGORY=700)的结果
    const fundItems = datas.filter(item => item.CATEGORY === 700);

    return fundItems.slice(0, 10).map((item: Record<string, unknown>) => {
      const fundInfo = (item.FundBaseInfo || {}) as Record<string, unknown>;
      return {
        code: String(item.CODE || ''),
        name: String(item.NAME || fundInfo.SHORTNAME || ''),
        type: String(fundInfo.FTYPE || fundInfo.FUNDTYPE || ''),
      };
    });
  } catch {
    return [];
  }
}
