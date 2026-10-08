import { createServerComponentClient } from '@/lib/db/supabase-server';
import { createServerClient } from '@/lib/db/supabase';
import { billingWorkspaceHandler } from '@/lib/billing-workspace-api';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const handler=billingWorkspaceHandler(createServerComponentClient,createServerClient);
export const GET=handler;
export const POST=handler;
