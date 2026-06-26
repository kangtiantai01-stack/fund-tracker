import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

let _db: ReturnType<typeof getSupabaseClient> | null = null;
function getDb(): ReturnType<typeof getSupabaseClient> {
  if (!_db) {
    _db = getSupabaseClient();
  }
  return _db;
}

// GET /api/snapshots?userId=xxx&days=30
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const days = parseInt(searchParams.get('days') || '30');

  if (!userId) {
    return NextResponse.json({ error: '缺少userId参数' }, { status: 400 });
  }

  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - days);

  const { data, error } = await getDb()
    .from('daily_snapshots')
    .select('*')
    .eq('user_id', userId)
    .gte('snapshot_date', sinceDate.toISOString().split('T')[0])
    .order('snapshot_date', { ascending: true });

  if (error) {
    console.error('查询快照失败:', error.message);
    return NextResponse.json({ error: '查询快照失败' }, { status: 500 });
  }

  return NextResponse.json({ snapshots: data || [] });
}

// POST /api/snapshots
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { userId, totalAssets, totalReturn, dailyReturn, holdings } = body;

  if (!userId) {
    return NextResponse.json({ error: '缺少userId参数' }, { status: 400 });
  }

  const today = new Date().toISOString().split('T')[0];

  // Upsert: 同一天只保留一条快照
  const { data: existing } = await getDb()
    .from('daily_snapshots')
    .select('id')
    .eq('user_id', userId)
    .eq('snapshot_date', today)
    .maybeSingle();

  let result;
  if (existing) {
    const { data, error } = await getDb()
      .from('daily_snapshots')
      .update({
        total_assets: totalAssets,
        total_return: totalReturn,
        daily_return: dailyReturn,
        holdings_json: holdings ? JSON.parse(JSON.stringify(holdings)) : null,
      })
      .eq('id', existing.id)
      .select();

    if (error) {
      console.error('更新快照失败:', error.message);
      return NextResponse.json({ error: '保存快照失败' }, { status: 500 });
    }
    result = data;
  } else {
    const { data, error } = await getDb()
      .from('daily_snapshots')
      .insert({
        user_id: userId,
        snapshot_date: today,
        total_assets: totalAssets,
        total_return: totalReturn,
        daily_return: dailyReturn,
        holdings_json: holdings ? JSON.parse(JSON.stringify(holdings)) : null,
      })
      .select();

    if (error) {
      console.error('创建快照失败:', error.message);
      return NextResponse.json({ error: '保存快照失败' }, { status: 500 });
    }
    result = data;
  }

  return NextResponse.json({ success: true, snapshot: result?.[0] || null });
}