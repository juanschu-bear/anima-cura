import { createServerComponentClient } from '@/lib/db/supabase-server';
import { createServerClient } from '@/lib/db/supabase';
import { billingDocumentHandler } from '@/lib/billing-document-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const handle = billingDocumentHandler(createServerComponentClient, createServerClient);

export async function GET(request: Request, { params }: { params: { id: string } }) {
  return handle(request, params.id);
}
