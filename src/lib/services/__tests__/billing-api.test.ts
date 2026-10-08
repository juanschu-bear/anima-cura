import test from "node:test";
import assert from "node:assert/strict";
import { billingPreflightHandler } from "../../billing-preflight";

const patientId = "00000000-0000-4000-8000-000000000001";
const url = `https://example.invalid/api/rechnungen/generate?patient_id=${patientId}&from=2026-07-01&to=2026-09-30`;

function clientFixture(options: { role?: string | null; authenticated?: boolean; failTable?: string; missingPatient?: boolean; userMetadataRole?: string } = {}) {
  const readTables: string[] = [];
  const filters: unknown[][] = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: options.authenticated === false ? null : {
      id: "staff", app_metadata: {}, user_metadata: { role: options.userMetadataRole },
    } }, error: null }) },
    from(table: string) {
      readTables.push(table);
      const response = () => ({ error: options.failTable === table ? { message: "private database detail" } : null,
        data: table === "user_profiles" ? { role: options.role === undefined ? "admin" : options.role, permissions: null }
          : table === "patients" ? (options.missingPatient ? null : { id: patientId, vorname: "Test", nachname: "Patient" })
          : [],
      });
      const query = {
        select() { return query; },
        eq(...args: unknown[]) { filters.push(args); return query; },
        gte(...args: unknown[]) { filters.push(args); return query; },
        lte(...args: unknown[]) { filters.push(args); return query; },
        order() { return query; },
        range() { return Promise.resolve(response()); },
        maybeSingle() { return Promise.resolve(response()); },
      };
      return query;
    },
  };
  return { client, readTables, filters };
}

test("unauthenticated and patient accounts never read patient billing data", async () => {
  for (const [options, status] of [[{ authenticated: false }, 401], [{ role: "patient" }, 403], [{ role: null, userMetadataRole: "admin" }, 403]] as const) {
    const fixture = clientFixture(options);
    const result = await billingPreflightHandler(() => fixture.client as never)(new Request(url));
    assert.equal(result.status, status);
    assert.ok(!fixture.readTables.includes("patients"));
    assert.ok(!fixture.readTables.includes("doku_eintraege"));
  }
});

test("authorized preflight preserves the existing URL, scopes reads and returns no-store HTML", async () => {
  const fixture = clientFixture();
  const response = await billingPreflightHandler(() => fixture.client as never)(new Request(url));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type")!, /text\/html/);
  assert.match(response.headers.get("cache-control")!, /no-store/);
  assert.match(response.headers.get("content-security-policy")!, /default-src 'none'/);
  assert.ok(fixture.filters.some((filter) => filter[0] === "patient_id" && filter[1] === patientId));
  assert.ok(fixture.filters.some((filter) => filter[0] === "termin_datum" && filter[1] === "2026-07-01"));
  const html = await response.text();
  assert.match(html, /Keine Rechnung erstellt/);
  assert.doesNotMatch(html, /Bitte überweisen|Rechnungsnummer:/);
});

test("JSON preflight stays explicitly incomplete and cannot authorize issuance", async () => {
  const fixture = clientFixture();
  const response = await billingPreflightHandler(() => fixture.client as never)(new Request(url + "&format=json"));
  const json = await response.json();
  assert.equal(json.issuanceAllowed, false);
  assert.equal(json.status, "needs_review");
  assert.equal(json.patientCents, null);
  assert.equal(json.source, "scribe_only");
});

test("source and profile failures are not silently treated as empty data", async () => {
  for (const table of ["user_profiles", "patients", "doku_eintraege"]) {
    const fixture = clientFixture({ failTable: table });
    const response = await billingPreflightHandler(() => fixture.client as never)(new Request(url));
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /private database detail/);
  }
});

test("malformed inputs fail before fetching patient data; absent patient is 404", async () => {
  const fixture = clientFixture();
  const handle = billingPreflightHandler(() => fixture.client as never);
  assert.equal((await handle(new Request(url.replace(patientId, "invalid")))).status, 400);
  assert.equal((await handle(new Request(url.replace("2026-07-01", "2026-02-30")))).status, 400);
  assert.ok(!fixture.readTables.includes("patients"));
  const absent = clientFixture({ missingPatient: true });
  assert.equal((await billingPreflightHandler(() => absent.client as never)(new Request(url))).status, 404);
});
