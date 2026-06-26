import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

let _db: ReturnType<typeof getSupabaseClient> | null = null;
function getDb(): ReturnType<typeof getSupabaseClient> {
  if (!_db) {
    _db = getSupabaseClient();
  }
  return _db;
}

// GET /api/transactions?userId=xxx&fundCode=xxx&page=1&pageSize=50
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const fundCode = searchParams.get('fundCode');
  const page = parseInt(searchParams.get('page') || '1');
  const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '50'), 200);

  if (!userId) {
    return NextResponse.json({ error: '缺少userId参数' }, { status: 400 });
  }

  let query = getDb()
    .from('transactions')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (fundCode) {
    query = query.eq('fund_code', fundCode);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('查询交易记录失败:', error.message);
    return NextResponse.json({ error: '查询交易记录失败' }, { status: 500 });
  }

  return NextResponse.json({
    transactions: data || [],
    total: count || 0,
    page,
    pageSize,
  });
}

// POST /api/transactions
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { userId, transaction } = body;

  if (!userId || !transaction) {
    return NextResponse.json({ error: '参数错误，需要userId和transaction' }, { status: 400 });
  }

  const { data, error } = await getDb()
    .from('transactions')
    .insert({
      user_id: userId,
      fund_code: transaction.fundCode,
      fund_name: transaction.fundName,
      direction: transaction.direction,
      amount: transaction.amount,
      shares: transaction.shares || null,
      nav: transaction.nav || null,
      fee: transaction.fee || null,
      fee_rate: transaction.feeRate || null,
      platform: transaction.platform || null,
      before15: transaction.before15 ?? true,
      transaction_date: transaction.transactionDate,
      confirm_date: transaction.confirmDate || null,
    })
    .select();

  if (error) {
    console.error('添加交易记录失败:', error.message);
    return NextResponse.json({ error: '添加交易记录失败' }, { status: 500 });
  }

  return NextResponse.json({ success: true, transaction: data?.[0] || null });
}