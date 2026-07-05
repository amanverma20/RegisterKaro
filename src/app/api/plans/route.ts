import { PLANS } from '@/lib/domain';
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ plans: PLANS });
}
