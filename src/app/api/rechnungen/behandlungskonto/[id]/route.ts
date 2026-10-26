import { createServerComponentClient } from '@/lib/db/supabase-server';
import { createServerClient } from '@/lib/db/supabase';
import { treatmentAccountHandler } from '@/lib/treatment-account-api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const handler = treatmentAccountHandler(createServerComponentClient, createServerClient);
export function GET(request: Request, { params }: { params: { id: string } }) { return handler(request, params.id); }
