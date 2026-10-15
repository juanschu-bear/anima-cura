import test from "node:test";
import assert from "node:assert/strict";
import { contactMatchesKnownAddresses, normalizePatientNumber, requestPatientSelfActivation } from "../patient-self-activation";
import { selectRecoveryContactEmail } from "../patient-password-recovery";

process.env.PATIENT_PASSWORD_RECOVERY_SECRET = "test-only-access-code-secret";

function activationFixture(options: { existing?: boolean; authRole?: string | null; profileError?: boolean; lookupError?: boolean; sendError?: boolean } = {}) {
  const patient = { id: "00000000-0000-4000-8000-000000000001", ivoris_nummer: "00003728", vorname: "Erika", nachname: "Beispiel", geburtsdatum: "2000-01-01", email: "erika@gmail.com", versicherter_email: null };
  let profile: Record<string, unknown> | null = options.existing ? { id: "auth-id", email: "erika.beispiel@animacura.de", role: "patient", patient_id: patient.id } : null;
  let authUser: any = options.existing ? { id: "auth-id", email: profile!.email, app_metadata: options.authRole === null ? {} : { role: options.authRole || "patient" } } : null;
  let created = 0, deleted = 0, upserted = 0;
  const sent: Array<{ to: string; code: string }> = [];
  const db = {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      const q = {
        select() { return q; }, eq(key: string, value: unknown) { filters.push([key, value]); return q; }, in() { return q; }, or() { return q; }, order() { return q; },
        async limit() {
          if (table === "patients") return { data: [patient], error: options.lookupError ? { message: "offline" } : null };
          if (table === "anamnese_submissions") return { data: [], error: null };
          if (table === "user_profiles") return { data: profile && filters.every(([key, value]) => profile![key] === value) ? [profile] : [], error: null };
          throw new Error(`Unexpected read: ${table}`);
        },
        async upsert(value: Record<string, unknown>, config: { onConflict: string }) {
          assert.equal(table, "user_profiles");
          assert.equal(config.onConflict, "id");
          assert.equal(Object.hasOwn(value, "full_name"), false, "full_name is not a live profile column");
          if (options.profileError) return { error: { message: "write failed" } };
          upserted++; profile = value; return { error: null };
        },
        async insert() { throw new Error("Plain INSERT collides with the Auth profile trigger"); },
      };
      return q;
    },
    auth: { admin: {
      async createUser(input: any) {
        created++; authUser = { id: "auth-id", email: input.email, app_metadata: input.app_metadata };
        // Simulate the existing Auth trigger, before application-side linkage.
        profile = { id: "auth-id", email: input.email, role: "patient", patient_id: null };
        return { data: { user: authUser }, error: null };
      },
      async getUserById() { return { data: { user: authUser }, error: null }; },
      async updateUserById(_id: string, patch: any) { assert.equal("password" in patch, false, "Request must not reset an existing password"); authUser = { ...authUser, ...patch }; return { error: null }; },
      async deleteUser() { deleted++; authUser = null; profile = null; return { error: null }; },
    } },
  };
  const input = { patientNumber: "3728", birthDate: patient.geburtsdatum, contactEmail: patient.email, ip: crypto.randomUUID() };
  const dependencies = { db: db as any, sendCode: async (to: string, code: string) => { if (options.sendError) throw new Error("mail rejected"); sent.push({ to, code }); } };
  return { input, dependencies, sent, state: () => ({ created, deleted, upserted, profile, authUser }) };
}

test("normalizes IVORIS patient numbers without changing existing leading zeros", () => {
  assert.equal(normalizePatientNumber("3728"), "00003728");
  assert.equal(normalizePatientNumber("00003728"), "00003728");
  assert.equal(normalizePatientNumber(""), null);
  assert.equal(normalizePatientNumber("1234567890123"), null);
});

test("matches only a valid private contact address case-insensitively", () => {
  assert.equal(contactMatchesKnownAddresses("Patient@Gmail.com", ["patient@gmail.com"]), true);
  assert.equal(contactMatchesKnownAddresses("other@gmail.com", ["patient@gmail.com"]), false);
  assert.equal(contactMatchesKnownAddresses("patient@animacura.de", ["patient@animacura.de"]), false);
});

test("first activation survives an existing trigger row and sends a code using only live profile columns", async () => {
  const fixture = activationFixture();
  assert.equal((await requestPatientSelfActivation(fixture.input, fixture.dependencies)).ok, true);
  assert.equal(fixture.sent.length, 1);
  assert.equal(fixture.sent[0].to, fixture.input.contactEmail);
  assert.match(fixture.sent[0].code, /^\d{6}$/);
  assert.equal(fixture.state().created, 1);
  assert.equal(fixture.state().upserted, 1);
  assert.equal(fixture.state().deleted, 0);
  assert.equal(fixture.state().profile!.patient_id, "00000000-0000-4000-8000-000000000001");
  assert.ok(fixture.state().authUser.app_metadata.patient_self_activation.codeHash);
});

test("existing server-linked patient account works without redundant Auth role metadata", async () => {
  const fixture = activationFixture({ existing: true, authRole: null });
  await requestPatientSelfActivation(fixture.input, fixture.dependencies);
  assert.equal(fixture.sent.length, 1);
  assert.equal(fixture.state().created, 0);
});

test("conflicting privileged Auth role cannot receive a patient recovery code", async () => {
  const fixture = activationFixture({ existing: true, authRole: "admin" });
  await requestPatientSelfActivation(fixture.input, fixture.dependencies);
  assert.equal(fixture.sent.length, 0);
});

test("unknown private address gets no code and no new account", async () => {
  const fixture = activationFixture();
  await requestPatientSelfActivation({ ...fixture.input, contactEmail: "other@gmail.com" }, fixture.dependencies);
  assert.equal(fixture.sent.length, 0);
  assert.equal(fixture.state().created, 0);
});

test("database failures surface instead of masquerading as a successful code request", async () => {
  for (const options of [{ lookupError: true }, { profileError: true }]) {
    const fixture = activationFixture(options);
    await assert.rejects(requestPatientSelfActivation(fixture.input, fixture.dependencies), /lookup_failed|store_failed/);
    assert.equal(fixture.sent.length, 0);
  }
});

test("transport failure restores prior challenge and does not report success", async () => {
  const fixture = activationFixture({ existing: true, sendError: true });
  await assert.rejects(requestPatientSelfActivation(fixture.input, fixture.dependencies), /mail rejected/);
  assert.equal(fixture.state().authUser.app_metadata.patient_self_activation, null);
});

test("recovery uses a known guardian address but never a portal alias", () => {
  assert.equal(selectRecoveryContactEmail("child@animacura.de", [], null, "Parent@Gmail.com"), "parent@gmail.com");
  assert.equal(selectRecoveryContactEmail("child@animacura.de", [], "child@animacura.de", "parent@gmail.com"), "parent@gmail.com");
  assert.equal(selectRecoveryContactEmail("child@animacura.de", [], null, "unknown@animacura.de"), null);
});
