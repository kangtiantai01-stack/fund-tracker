import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

let _db: ReturnType<typeof getSupabaseClient> | null = null;
function getDb(): ReturnType<typeof getSupabaseClient> {
  if (!_db) {
    _db = getSupabaseClient();
  }
  return _db;
}

interface Holding {
  code: string;
  name: string;
  shares: number;
  costPrice: number;
  latestNav?: number;
  yesterdayNav?: number;
  dailyChangeRate?: number;
  updateTime?: string;
  isEstimated?: boolean;
}

// GET /api/portfolio?userId=xxx
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: '缺少userId参数' }, { status: 400 });
  }

  const { data, error } = await getDb()
    .from('portfolio')
    .select('holdings, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('查询持仓失败:', error.message);
    return NextResponse.json({ error: '查询持仓失败' }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ holdings: [], updatedAt: null });
  }

  return NextResponse.json({
    holdings: data.holdings as Holding[],
    updatedAt: data.updated_at,
  });
}

// POST /api/portfolio
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { userId, holdings } = body;

  if (!userId || !Array.isArray(holdings)) {
    return NextResponse.json({ error: '参数错误，需要userId和holdings数组' }, { status: 400 });
  }

  // Upsert: 如果已有则更新，没有则插入
  const { data: existing } = await getDb()
    .from('portfolio')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  let result;
  if (existing) {
    const { data, error } = await getDb()
      .from('portfolio')
      .update({
        holdings: JSON.parse(JSON.stringify(holdings)),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .select();

    if (error) {
      console.error('更新持仓失败:', error.message);
      return NextResponse.json({ error: '保存持仓失败' }, { status: 500 });
    }
    result = data;
  } else {
    const { data, error } = await getDb()
      .from('portfolio')
      .insert({
        user_id: userId,
        holdings: JSON.parse(JSON.stringify(holdings)),
      })
      .select();

    if (error) {
      console.error('创建持仓失败:', error.message);
      return NextResponse.json({ error: '保存持仓失败' }, { status: 500 });
    }
    result = data;
  }

  return NextResponse.json({ success: true, data: result });
}