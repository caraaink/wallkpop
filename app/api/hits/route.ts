import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('t') || 'all';
  let query;

  if (type === 'week') {
    query = sql`SELECT * FROM songs WHERE upl >= NOW() - INTERVAL '7 days' ORDER BY view DESC LIMIT 10`;
  } else if (type === 'month') {
    query = sql`SELECT * FROM songs WHERE upl >= NOW() - INTERVAL '30 days' ORDER BY view DESC LIMIT 10`;
  } else {
    query = sql`SELECT * FROM songs ORDER BY view DESC LIMIT 10`;
  }

  const { rows } = await query;
  return NextResponse.json(rows);
}
