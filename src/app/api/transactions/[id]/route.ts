import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

let _db: ReturnType<typeof getSupabaseClient> | null = null;
function getDb(): ReturnType<typeof getSupabaseClient> {
  if (!_db) {
    _db = getSupabaseClient();
  }
  return _db;
}

// DELETE /api/transactions/[id]?userId=xxx
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  if (!userId || !id) {
    return NextResponse.json({ error: '参数错误' }, { status: 400 });
  }

  const { data, error } = await getDb()
    .from('transactions')
    .delete()
    .eq('id', parseInt(id))
    .eq('user_id', userId)
    .select();

  if (error) {
    console.error('删除交易记录失败:', error.message);
    return NextResponse.json({ error: '删除交易记录失败' }, { status: 500 });
  }

  return NextResponse.json({ success: true, deleted: data?.[0] || null });
}