import { timingSafeEqual } from 'node:crypto';

const base = 'https://api.github.com/repos/juanschu-bear/anima-cura/actions';
export const dispatchWorkflow = 'animasign-sync-worker.yml';
type Dependencies = {
  secret?: string; token?: string; environment?: string;
  fetch: typeof fetch;
  claim: () => Promise<boolean>;
};
const response = (status: number, state: string) => Response.json({ state }, { status, headers: { 'Cache-Control': 'no-store' } });
export async function dispatchAnimaSign(request: Request, deps: Dependencies): Promise<Response> {
  const auth = request.headers.get('authorization') ?? '';
  const expected = deps.secret ? `Bearer ${deps.secret}` : '';
  const suppliedBytes = Buffer.from(auth), expectedBytes = Buffer.from(expected);
  if (!expected || suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) return response(401, 'unauthorized');
  if (request.method !== 'GET' || new URL(request.url).search || request.body !== null || request.headers.get('user-agent') !== 'vercel-cron/1.0') return response(400, 'invalid_cron_request');
  if (deps.environment !== 'production' || !deps.token) return response(503, 'not_configured');
  const headers = { Authorization: `Bearer ${deps.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const busy = async () => {
    // Fail closed on pagination, malformed data, errors and every unfinished state.
    for (const status of ['queued', 'in_progress', 'waiting', 'pending', 'requested']) {
      const result = await deps.fetch(`${base}/workflows/${dispatchWorkflow}/runs?status=${status}&per_page=1`, { headers, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(5000) });
      if (!result.ok) throw Error('github_read_failed');
      const data = await result.json();
      if (!Number.isSafeInteger(data.total_count) || data.total_count < 0 || !Array.isArray(data.workflow_runs)) throw Error('github_read_invalid');
      if (data.total_count > 0) return true;
    }
    return false;
  };
  try {
    if (await busy()) return response(200, 'already_active');
    if (!await deps.claim()) return response(200, 'rate_limited');
    if (await busy()) return response(200, 'already_active');
    const result = await deps.fetch(`${base}/workflows/${dispatchWorkflow}/dispatches`, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: 'main' }), redirect: 'error', signal: AbortSignal.timeout(5000),
    });
    // Never retry an uncertain outcome; the durable five-minute gate stays consumed.
    return result.status === 204 ? response(202, 'requested') : response(503, 'dispatch_failed');
  } catch {
    // Do not emit fetch errors, headers, GitHub bodies or tokens into logs/responses.
    return response(503, 'dispatch_unavailable');
  }
}
