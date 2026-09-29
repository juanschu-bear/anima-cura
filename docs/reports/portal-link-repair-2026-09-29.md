# Portal linkage repair — 2026-09-29

## Applied and verified

- 22 existing authentication accounts linked to their verified, current patient records; three missing profile rows restored.
- Eligibility required consistent submission identity, one login alias used only by this patient, a patient-role account, no conflicting live patient target, and no second target profile.
- Before-images saved in a private mode-0600 operational backup outside the repository.
- Post-write cohort reload: zero remaining audit issues in the 22 repaired patients.
- No passwords changed, emails sent, patient records merged, documents moved or financial records edited by the repair.

## Name variants

The outreach audit now accepts omitted trailing given names only when surname and date of birth agree, the contact address agrees with the patient record, and exactly one compatible patient exists across the complete patient population. Comparison uses whole name tokens, not substring matching. Historical submissions are still all checked. This validates existing links; it does not rewrite identities.

## Read-only cohort recheck at 17:43 UTC

- 420 forms linked to 387 patient records; 33 repeat submissions.
- 359 distinct usable contact addresses.
- 342 technically prepared recipients covering 364 patient records (previously 301 recipients).
- 17 distinct addresses remain held: seven identity-review, six missing-account and five multiple-account categories, with overlap.
- Three additional patient contact fields have invalid syntax or suspicious domains and are not usable recipients.
- These results do not prove mailbox ownership, app installation, successful interactive login or invoice availability.

## Dispatch

The invitation campaign remains paused pending the user's approval of the final email. Previously delivered invitations must not be confused with the new version. A newly approved all-recipient resend needs a new campaign manifest/idempotency scope, not resumption of the old frozen manifest.

## Validation

Full `npm test` and `npm run build` passed. Tests cover deleted versus live previous patient targets, conflicting identities, missing profiles, shared aliases, practice accounts, name variants, contact disagreement, duplicate compatible records and swapped siblings.
