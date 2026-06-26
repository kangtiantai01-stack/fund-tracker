import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  if (!code || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: '无效的基金代码' }, { status: 400 });
  }

  try {
    const url = `https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://fund.eastmoney.com/',
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: '获取基金数据失败' }, { status: res.status });
    }

    const text = await res.text();

    // 解析 JSONP: jsonpgz({...});
    const match = text.match(/jsonpgz\((.+)\)/);
    if (!match || !match[1]) {
      return NextResponse.json({ error: '解析基金数据失败' }, { status: 502 });
    }

    const data = JSON.parse(match[1]);

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, max-age=30',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
