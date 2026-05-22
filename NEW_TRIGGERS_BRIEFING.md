# New Workflow Trigger Types — Codex Task

## Repo
github.com/juanschu-bear/anima-cura (branch: main)

## What Exists

The workflow builder currently supports these trigger types (defined in `src/app/api/workflows/assist/route.ts` and rendered in `src/components/workflows/nodes/TriggerNode.tsx`):

- `rate_overdue` — fires X days AFTER an installment is overdue
- `rate_returned` — fires when a direct debit (Lastschrift) is reversed (chargeback)
- `daily_at` — fires daily at a specific time (cron)
- `scoring_below` — fires when a patient's reliability score drops below a threshold

## New Trigger Types to Add

### 1. `before_due` — X Days BEFORE Installment Due Date
**Description:** Fires X days before a patient's next installment is due. This is for proactive reminders.
**Parameters:**
- `days` (number, required): How many days before the due date to fire (e.g., 2 = two days before)
**Use case:** "Remind patients 2 days before their rate is due"
**Label DE:** "Rate fällig in X Tagen"
**Label EN:** "Installment due in X days"

### 2. `holiday` — Saxon/National Holiday Trigger
**Description:** Fires X days before a public holiday in Saxony, Germany. Includes all national German holidays plus Saxony-specific holidays (Buß- und Bettag, Reformationstag).
**Parameters:**
- `days_before` (number, default: 2): How many days before the holiday to fire
- `region` (string, default: "sachsen"): Which holiday calendar to use
**Use case:** "Notify patients 2 days before holidays that the practice is closed"
**Label DE:** "Feiertag in X Tagen"
**Label EN:** "Holiday in X days"

**Saxon holidays to include (hardcoded list):**
- Neujahr (Jan 1)
- Karfreitag (variable)
- Ostermontag (variable)
- Tag der Arbeit (May 1)
- Christi Himmelfahrt (variable)
- Pfingstmontag (variable)
- Tag der Deutschen Einheit (Oct 3)
- Reformationstag (Oct 31) — Saxony specific
- Buß- und Bettag (variable) — Saxony specific
- 1. Weihnachtsfeiertag (Dec 25)
- 2. Weihnachtsfeiertag (Dec 26)

### 3. `patient_birthday` — Patient Birthday Trigger
**Description:** Fires X days before a patient's birthday.
**Parameters:**
- `days_before` (number, default: 0): 0 = on the birthday, 1 = day before, etc.
**Use case:** "Send birthday greetings to all patients"
**Label DE:** "Patientengeburtstag"
**Label EN:** "Patient birthday"

### 4. `new_patient` — New Patient Registered
**Description:** Fires when a new patient is synced from IVORIS or manually created.
**Parameters:** none
**Use case:** "Send welcome email to new patients"
**Label DE:** "Neuer Patient"
**Label EN:** "New patient"

### 5. `treatment_complete` — Treatment / Rate Plan Complete
**Description:** Fires when a patient's last installment is paid and the rate plan is complete.
**Parameters:** none
**Use case:** "Send thank-you message when all rates are paid"
**Label DE:** "Behandlung abgeschlossen"
**Label EN:** "Treatment complete"

## Files to Modify

### Backend: `src/app/api/workflows/assist/route.ts`
- Add new trigger types to the Zod schema (the `event` enum in the trigger node data)
- Add the new trigger descriptions to the system prompt so Claude knows about them
- Add parameter schemas for each trigger

### Frontend: `src/components/workflows/nodes/TriggerNode.tsx`
- Add rendering for new trigger types (icon, label, parameter display)
- Add i18n keys for labels

### Frontend: `src/app/(dashboard)/automatisierungen/page.tsx`
- Update `triggerSummary()` function to handle new trigger types
- Add i18n translation keys

### i18n: `src/lib/i18n.ts`
- Add translation keys for all new trigger labels (DE + EN)

### Execution: `src/app/api/workflows/execute/route.ts`
- Add execution logic for new triggers (when should they fire during the daily cron)
- Holiday calculation logic (Easter-based variable holidays)
- Birthday check against patient data
- New patient detection (compare with last sync timestamp)
- Treatment complete detection (all installments paid)

## Important

- `npm run build` must pass
- Do NOT modify ICuraChat.tsx or the workflow canvas — they work correctly
- Do NOT change the SSE response format
- Keep the existing triggers working exactly as they are
- The `propose_workflow` tool schema must be updated to include new trigger types
