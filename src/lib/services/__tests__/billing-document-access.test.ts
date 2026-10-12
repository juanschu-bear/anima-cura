import test from 'node:test';
import assert from 'node:assert/strict';
import { billingDocumentHandler, billingDocumentPath, billingDocumentUrl } from '../../billing-document-access';

const patientId = '00000000-0000-4000-8000-000000000001';
const otherId = '00000000-0000-4000-8000-000000000002';
const documentId = '00000000-0000-4000-8000-000000000003';
const request = new Request('https://example.invalid' + billingDocumentUrl(documentId));

function fixture(options: { loggedIn?: boolean; role?: string; owner?: string; publicBucket?: boolean; missingBucket?: boolean; profileMissing?: boolean; profileError?: boolean; documentError?: boolean; downloadError?: boolean; brokenPdf?: boolean; fileUrl?: string; permissions?: unknown; absent?: boolean } = {}) {
  const calls: string[] = [], filters: unknown[][] = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: options.loggedIn === false ? null : { id:'user', user_metadata:{ role:'admin', patient_id:otherId } } }, error:null }) },
    from(table: string) {
      calls.push(table);
      const query = {
        select() { return query; },
        eq(...values: unknown[]) { filters.push([table, ...values]); return query; },
        async maybeSingle() {
          if (table === 'user_profiles') return { data: options.profileMissing ? null : { role:options.role ?? 'patient', patient_id:patientId, permissions:options.permissions ?? null }, error:options.profileError ? { message:'private' } : null };
          return { data:options.absent ? null : { id:documentId, patient_id:options.owner ?? patientId, file_url:options.fileUrl ?? billingDocumentUrl(documentId) }, error:options.documentError ? { message:'private' } : null };
        },
      };
      return query;
    },
    storage: {
      async getBucket() { calls.push('bucket'); return { data:options.missingBucket ? null : { public:options.publicBucket ?? false }, error:null }; },
      from() { return { async download(path: string) { calls.push('download:' + path); return { data: options.downloadError ? null : new Blob([options.brokenPdf ? '<html>bad</html>' : '%PDF-1.7\nfixture']), error:options.downloadError ? { message:'private' } : null }; } }; },
    },
  };
  return { handle:billingDocumentHandler(() => client as never, () => client as never), calls, filters };
}

test('authentication required before any document or storage access', async () => {
  const f = fixture({loggedIn:false});
  assert.equal((await f.handle(request,documentId)).status,401);
  assert.deepEqual(f.calls,[]);
});

test('patient access is scoped to server profile and rejects another patient even if returned', async () => {
  const f = fixture({owner:otherId});
  assert.equal((await f.handle(request,documentId)).status,404);
  assert.ok(f.filters.some(v => v[0] === 'patient_documents' && v[1] === 'patient_id' && v[2] === patientId));
  assert.ok(!f.calls.includes('bucket'));
});

test('own PDF has no-store headers and no public or signed redirect', async () => {
  const f = fixture();
  const response = await f.handle(request,documentId);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('content-type'),'application/pdf');
  assert.match(response.headers.get('cache-control')!,/private, no-store/);
  assert.equal(response.headers.get('location'),null);
  assert.match(await response.text(),/^%PDF-/);
  assert.ok(f.calls.includes('download:' + billingDocumentPath(patientId,documentId)));
});

test('staff needs both patient and billing module rights; user metadata never grants a role', async () => {
  for (const options of [{role:'unknown'}, {profileMissing:true}, {role:'admin',permissions:{module:{rechnungen:'keine'}}}, {role:'verwaltung',permissions:{module:{patienten:'keine'}}}]) {
    const f = fixture(options);
    assert.equal((await f.handle(request,documentId)).status,403);
    assert.ok(!f.calls.includes('patient_documents'));
  }
  assert.equal((await fixture({role:'admin',owner:otherId}).handle(request,documentId)).status,200);
});

test('unrecognized document paths and malformed identifiers are never fetched', async () => {
  for (const fileUrl of ['https://example.invalid/private.pdf','../../other.pdf']) {
    const f = fixture({fileUrl});
    assert.equal((await f.handle(request,documentId)).status,404);
    assert.ok(!f.calls.includes('bucket'));
  }
  assert.equal((await fixture().handle(request,'../private')).status,404);
  assert.equal((await fixture({absent:true}).handle(request,documentId)).status,404);
});

test('public buckets, storage failures and malformed content fail closed without details', async () => {
  for (const options of [{publicBucket:true},{missingBucket:true},{downloadError:true},{brokenPdf:true},{profileError:true},{documentError:true}]) {
    const response = await fixture(options).handle(request,documentId);
    assert.equal(response.status,503);
    assert.doesNotMatch(await response.text(),/private|storage|bucket/);
  }
});
