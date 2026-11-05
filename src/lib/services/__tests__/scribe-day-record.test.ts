import test from "node:test";
import assert from "node:assert/strict";
import { mergeDayPositions } from "../../scribe-day-record";
import { decideStoredDayPart, previewStoredDayPart } from "../../scribe-day-record-service";

const position = (code: string, extra: Record<string, unknown> = {}) => ({
  code,
  text: `Leistung ${code}`,
  anzahl: 1,
  ...extra,
});

test("Fall A: three identical daily flat-rate lists contribute exactly one position", () => {
  const result = mergeDayPositions([
    { id: "part-a", positions: [position("BEMA 119/120")] },
    { id: "part-b", positions: [position("BEMA 119/120")] },
    { id: "part-c", positions: [position("BEMA 119/120")] },
  ]);
  assert.equal(result.positions.length, 1);
  assert.deepEqual(result.positions[0].sourcePartIds, ["part-a", "part-b", "part-c"]);
  assert.deepEqual(result.conflicts, []);
});

test("a retried source position is technically idempotent", () => {
  const part = { id: "same-part", positions: [position("BEMA 126a", { teeth: ["16"] })] };
  const result = mergeDayPositions([part, part]);
  assert.equal(result.positions.length, 1);
  assert.deepEqual(result.conflicts, []);
});

test("the same arch service in separate jaws remains separate", () => {
  const result = mergeDayPositions([
    { id: "ok", positions: [position("BEMA 128a", { jaw: "OK" })] },
    { id: "uk", positions: [position("BEMA 128a", { jaw: "UK" })] },
  ]);
  assert.equal(result.positions.length, 2);
  assert.deepEqual(result.conflicts, []);
});

test("same arch and overlapping both-jaw scopes become accounting conflicts", () => {
  const sameJaw = mergeDayPositions([
    { id: "a", positions: [position("BEMA 128a", { jaw: "OK" })] },
    { id: "b", positions: [position("BEMA 128a", { jaw: "OK" })] },
  ]);
  assert.equal(sameJaw.positions.length, 0);
  assert.equal(sameJaw.conflicts[0].kind, "same_jaw");

  const overlap = mergeDayPositions([
    { id: "a", positions: [position("BEMA 128a", { jaw: "both" })] },
    { id: "b", positions: [position("BEMA 128a", { jaw: "OK" })] },
  ]);
  assert.equal(overlap.positions.length, 0);
  assert.equal(overlap.conflicts[0].kind, "jaw_overlap");
});

test("128a plus 128c is allowed, while 128a plus 128b is unresolved", () => {
  const allowed = mergeDayPositions([
    { id: "a", positions: [position("BEMA 128a", { jaw: "OK" }), position("BEMA 128c", { jaw: "OK" })] },
  ]);
  assert.equal(allowed.positions.length, 2);
  assert.deepEqual(allowed.conflicts, []);

  const alternatives = mergeDayPositions([
    { id: "a", positions: [position("BEMA 128a", { jaw: "OK" })] },
    { id: "b", positions: [position("BEMA 128b", { jaw: "OK" })] },
  ]);
  assert.equal(alternatives.positions.length, 0);
  assert.equal(alternatives.conflicts[0].kind, "variant_conflict");

  const individualizedChange = mergeDayPositions([
    { id: "a", positions: [position("BEMA 128b", { jaw: "UK" }), position("BEMA 128c", { jaw: "UK" })] },
  ]);
  assert.equal(individualizedChange.positions.length, 2);
  assert.deepEqual(individualizedChange.conflicts, []);

  const notYetApproved = mergeDayPositions([
    { id: "a", positions: [position("BEMA 127a", { jaw: "OK" }), position("BEMA 128a", { jaw: "OK" })] },
  ]);
  assert.equal(notYetApproved.positions.length, 0);
  assert.equal(notYetApproved.conflicts[0].kind, "variant_conflict");
});

test("different teeth remain separate and the same tooth becomes a conflict", () => {
  const separate = mergeDayPositions([
    { id: "a", positions: [position("BEMA 126a", { teeth: ["16"] })] },
    { id: "b", positions: [position("BEMA 126a", { teeth: ["26"] })] },
  ]);
  assert.equal(separate.positions.length, 2);
  assert.deepEqual(separate.conflicts, []);

  const duplicate = mergeDayPositions([
    { id: "a", positions: [position("BEMA 126a", { teeth: ["16"] })] },
    { id: "b", positions: [position("BEMA 126a", { teeth: ["16"] })] },
  ]);
  assert.equal(duplicate.positions.length, 0);
  assert.equal(duplicate.conflicts[0].kind, "same_tooth");
});

test("a conflict removes only unresolved positions and leaves clinical confirmation possible", () => {
  const result = mergeDayPositions([
    { id: "a", positions: [position("BEMA 128a", { jaw: "OK" }), position("BEMA 119/120")] },
    { id: "b", positions: [position("BEMA 128a", { jaw: "OK" }), position("BEMA 119/120")] },
  ]);
  assert.deepEqual(result.positions.map(item => item.code), ["BEMA 119/120"]);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].kind, "same_jaw");
});

test("position conflict confirms the clinical delta and creates a billing clarification payload", async () => {
  const dayId = "11111111-1111-4111-8111-111111111111";
  const originalId = "22222222-2222-4222-8222-222222222222";
  const draftId = "33333333-3333-4333-8333-333333333333";
  const record = { id: dayId, patient_id: "44444444-4444-4444-8444-444444444444", service_date: "2026-11-04", version: 1,
    canonical_entry_id: "55555555-5555-4555-8555-555555555555", created_at: "2026-11-04T10:00:00Z", updated_at: "2026-11-04T10:00:00Z" };
  const base = { tagesdatensatz_id: dayId, corrects_part_id: null, occurred_at: "2026-11-04T10:00:00Z", documented_at: "2026-11-04T10:01:00Z",
    confirmed_at: "2026-11-04T10:02:00Z", source_confirmed_at: null, staff_initials: "MS", room_version_id: null, template_id: null, treatment_type: "multiband",
    appointment_type: "kontrolle", teeth: [], variables: {}, selection: {}, source_entry_id: null, source_entry_version: null,
    source_ivoris_push_status: null, decision_reason: null };
  const parts = [
    { ...base, id: originalId, state: "bestaetigt", kind: "original", text: "Erster Teil.", positions: [position("BEMA 128a", { jaw: "OK" })] },
    { ...base, id: draftId, state: "entwurf", kind: "nachtrag", text: "Weiterer Teil.", confirmed_at: null,
      positions: [position("BEMA 128a", { jaw: "OK" }), position("BEMA 119/120")] },
  ];
  let rpcArgs: Record<string, unknown> | null = null;
  const db = {
    from(table: string) {
      const data = table === "doku_tagesdatensaetze" ? record : parts;
      const query = {
        select() { return query; }, eq() { return query; }, order() { return query; },
        maybeSingle: async () => ({ data: record, error: null }),
        then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data, error: null }).then(resolve); },
      };
      return query;
    },
    rpc: async (_name: string, args: Record<string, unknown>) => {
      rpcArgs = args;
      return { data: { state: "bestaetigt", clarificationId: "clarification" }, error: null };
    },
  };
  const preview = await previewStoredDayPart(db as never, dayId, draftId);
  assert.equal(preview.clinicalConfirmationAllowed, true);
  assert.equal(preview.billingClarificationRequired, true);
  const result = await decideStoredDayPart(db as never, dayId, draftId, {
    expectedVersion: 1,
    decision: "nachtrag",
    reason: "Zweiter Termin am selben Behandlungstag",
    previewToken: preview.previewToken,
  });
  assert.equal((result as { result: { state: string } }).result.state, "bestaetigt");
  const captured = rpcArgs as unknown as Record<string, unknown>;
  assert.equal((captured.p_conflicts as unknown[]).length, 1);
  assert.deepEqual((captured.p_resulting_positions as Array<{ code: string }>).map(item => item.code), ["BEMA 119/120"]);
  assert.equal(captured.p_ivoris_delta_text, "Weiterer Teil.");
});

test("a correction replaces the previous part instead of adding its positions again", async () => {
  const dayId = "11111111-1111-4111-8111-111111111111";
  const originalId = "22222222-2222-4222-8222-222222222222";
  const correctionId = "33333333-3333-4333-8333-333333333333";
  const record = { id: dayId, patient_id: "44444444-4444-4444-8444-444444444444", service_date: "2026-11-04", version: 2,
    canonical_entry_id: "55555555-5555-4555-8555-555555555555", created_at: "2026-11-04T10:00:00Z", updated_at: "2026-11-04T10:00:00Z" };
  const base = { tagesdatensatz_id: dayId, occurred_at: "2026-11-04T10:00:00Z", documented_at: "2026-11-04T10:01:00Z",
    confirmed_at: "2026-11-04T10:02:00Z", source_confirmed_at: null, staff_initials: "MS", room_version_id: null, template_id: null,
    treatment_type: "multiband", appointment_type: "kontrolle", teeth: [], variables: {}, selection: {}, source_entry_id: null,
    source_entry_version: null, source_ivoris_push_status: null, decision_reason: null };
  const parts = [
    { ...base, id: originalId, state: "bestaetigt", kind: "original", corrects_part_id: null, text: "Falscher erster Text.",
      positions: [position("BEMA 128a", { jaw: "OK" })] },
    { ...base, id: correctionId, state: "entwurf", kind: "korrektur", corrects_part_id: originalId, text: "Korrigierter Text.",
      confirmed_at: null, source_entry_id: "66666666-6666-4666-8666-666666666666", source_ivoris_push_status: "gepusht",
      positions: [position("BEMA 128b", { jaw: "OK" })] },
  ];
  const db = {
    from(table: string) {
      const data = table === "doku_tagesdatensaetze" ? record : parts;
      const query = {
        select() { return query; }, eq() { return query; }, order() { return query; },
        maybeSingle: async () => ({ data: record, error: null }),
        then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data, error: null }).then(resolve); },
      };
      return query;
    },
  };
  const preview = await previewStoredDayPart(db as never, dayId, correctionId);
  assert.equal(preview.resultingClinicalText, "Korrigierter Text.");
  assert.deepEqual(preview.resultingPositions.map(item => item.code), ["BEMA 128B"]);
  assert.deepEqual(preview.conflicts, []);
  assert.equal(preview.ivoris.action, "already_pushed");
  assert.equal(preview.ivoris.text, null);
});
