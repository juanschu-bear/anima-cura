import { createServerClient } from '@/lib/db/supabase';
import { dispatchAnimaSign } from '@/lib/services/animasign-workflow-dispatch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  return dispatchAnimaSign(request, {
    secret: process.env.CRON_SECRET,
    token: process.env.ANIMASIGN_GITHUB_ACTIONS_TOKEN,
    environment: process.env.VERCEL_ENV,
    fetch,
    claim: async () => {
      const db = createServerClient();
      const current = await db.from('animasign_dispatch_gate').select('generation').eq('singleton', true).single();
      if (current.error || !Number.isSafeInteger(current.data?.generation)) throw Error('gate_unavailable');
      const updated = await db.from('animasign_dispatch_gate').update({ generation: current.data.generation + 1 })
        .eq('singleton', true).eq('generation', current.data.generation).select('generation');
      if (updated.error || !Array.isArray(updated.data)) throw Error('gate_unavailable');
      return updated.data.length === 1;
    },
  });
}
