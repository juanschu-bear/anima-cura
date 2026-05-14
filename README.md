# Anima Curo

**Automated rate management, bank reconciliation & dunning for medical practices – powered by AI.**

Part of the [Anima](https://anima.ai) product family by Juan Schubert.

---

## What it does

Anima Curo automates the financial back-office of medical practices. It connects directly to your bank, matches incoming payments to patient rate plans, sends reminders when payments are overdue, and uses AI to detect anomalies and forecast cash flow.

**Before Curo:** 2 days per month spent manually matching bank statements to patient files. Missed payments go unnoticed for weeks. No overview of who paid and who didn't.

**After Curo:** Everything runs automatically. The admin gets a daily briefing. The practice owner sees a real-time dashboard. AI flags problems before they escalate.

---

## Core Features

**Bank Reconciliation** — Connects to 380+ German banks via finAPI (PSD2/XS2A). Imports transactions automatically 4x per day. Matches payments to patients using fuzzy name matching, IBAN recognition, and payment reference analysis.

**Rate Plan Management** — Tracks every installment per patient: Rate 1, 2, 3... with due dates, amounts, and payment status. Shows progress at a glance.

**Automated Dunning** — Three-stage reminder system. Stage 1: friendly email. Stage 2: formal letter + phone call task. Stage 3: escalation to practice owner. All texts generated in German, all timelines configurable.

**AI Analysis** — Claude API integration with full data pseudonymization (GDPR-compliant). Detects anomalies, generates quarterly summaries, and forecasts cash flow for the next 90 days.

**Dashboard** — Seven screens covering overview, payments, patients, rate plans, dunning pipeline, quarterly reports, and settings.

---

## Architecture

```
Data Sources                Integration              Database
┌──────────┐              ┌──────────────┐         ┌──────────────┐
│ Bank     │──finAPI──────│              │         │              │
│ (PSD2)   │              │  Next.js API │────────▶│  Supabase    │
│          │              │  Routes      │         │  PostgreSQL  │
├──────────┤              │              │         │              │
│ Practice │──CSV/API────▶│  Services:   │         │  9 Tables    │
│ Software │              │  • Bank Sync │◀────────│  RLS + Audit │
│ (ivoris) │              │  • Matching  │         └──────────────┘
├──────────┤              │  • Dunning   │                │
│ DATEV    │──Export──────│  • AI Layer  │                ▼
│          │              └──────────────┘         ┌──────────────┐
└──────────┘                     │                 │  Dashboard   │
                                 ▼                 │  7 Screens   │
                          ┌──────────────┐         │  React 18    │
                          │  Claude API  │         │  Recharts    │
                          │  (Anthropic) │         └──────────────┘
                          └──────────────┘
```

---

## Tech Stack

| Layer        | Technology                          |
| ------------ | ----------------------------------- |
| Frontend     | Next.js 14, React 18, Tailwind CSS  |
| Charts       | Recharts                            |
| Database     | Supabase (PostgreSQL + RLS)         |
| Banking      | finAPI (PSD2 / XS2A)               |
| AI           | Claude API (Anthropic)              |
| Email        | Nodemailer (SMTP)                   |
| Hosting      | Vercel                              |
| Cron         | Vercel Cron (daily at 06:00)        |

---

## Project Structure

```
anima-curo/
│
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── cron/              Daily automation pipeline
│   │   │   ├── finapi/            Banking endpoints
│   │   │   ├── matching/          Manual match actions
│   │   │   ├── dunning/           Dunning controls
│   │   │   ├── reports/           PDF export
│   │   │   └── claude/            AI analysis endpoints
│   │   │
│   │   ├── (dashboard)/           Dashboard screens
│   │   │   ├── uebersicht/        Overview & KPIs
│   │   │   ├── zahlungen/         Payment matching
│   │   │   ├── patienten/[id]/    Patient detail
│   │   │   ├── ratenplan/         Rate plan overview
│   │   │   ├── mahnwesen/         Dunning pipeline (Kanban)
│   │   │   ├── quartal/           Quarterly report + AI
│   │   │   └── einstellungen/     Settings
│   │   │
│   │   └── auth/                  Authentication
│   │
│   ├── components/                Reusable UI components
│   ├── hooks/                     React hooks & stores
│   │
│   └── lib/
│       ├── api/finapi-client.ts   finAPI SDK wrapper
│       ├── db/supabase.ts         Database client
│       ├── services/
│       │   ├── bank-sync.ts       Bank import service
│       │   ├── matching-engine.ts Fuzzy matching algorithm
│       │   ├── dunning-engine.ts  3-stage dunning system
│       │   ├── claude-analysis.ts AI analysis (pseudonymized)
│       │   └── email-service.ts   SMTP email sender
│       └── types/index.ts         TypeScript definitions
│
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql Full database schema
│
├── .env.example                   Environment template
├── vercel.json                    Cron configuration
└── package.json
```

---

## Daily Automation (06:00 CET)

The system runs a four-step pipeline every morning:

1. **Bank Sync** — Fetches new transactions from finAPI
2. **Matching** — Matches each transaction to a patient + rate
3. **Dunning** — Checks overdue rates, sends reminders
4. **AI Analysis** — Detects anomalies, updates cash flow forecast

The admin receives a morning briefing. The practice owner gets a weekly report.

---

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/your-org/anima-curo.git
cd anima-curo
npm install
```

### 2. Set up Supabase

- Create a project at [supabase.com](https://supabase.com)
- Run the migration: `supabase/migrations/001_initial_schema.sql`
- Copy your URL + keys to `.env.local`

### 3. Configure services

```bash
cp .env.example .env.local
```

Fill in your API keys for Supabase, finAPI, Anthropic (Claude), and SMTP.

### IVORIS Praxissoftware anbinden (Patienten-Sync)

Setze diese Variablen in `.env.local`:

```bash
IVORIS_SYNC_ENABLED=true
IVORIS_LINKNAME=<dein-linkname-aus-ivoris-relay>
IVORIS_APP=<app_name>
IVORIS_APP_VERSION=<deine-version>
IVORIS_API_KEY=<api_key>
IVORIS_USERNAME=<ivoris-benutzername>
IVORIS_PASSWORD=<ivoris-passwort>
IVORIS_MANDANT_INDEX=<optional>
```

Optional (falls deine Installation andere Endpoint-Namen nutzt):

```bash
IVORIS_PATIENTS_PATH=/Patient/v1/AllPatients
IVORIS_PATIENTS_METHOD=GET
```

Verfügbare Endpoints:
- `GET /api/ivoris/about/documentation` (lädt die Webservice-Doku via About/v1/Documentation)
- `POST /api/ivoris/patients/sync` (importiert/aktualisiert Patienten in `patients` via `ivoris_id`)

### 4. Run locally

```bash
npm run dev
```

Open [localhost:3000](http://localhost:3000)

---

## Deployment

```bash
vercel deploy
```

Vercel Cron automatically runs the daily pipeline at 06:00 CET.

---

## Monthly Costs (estimated)

| Service      | Cost        |
| ------------ | ----------- |
| Vercel Pro   | ~€20        |
| Supabase Pro | ~€25        |
| finAPI       | ~€30–50     |
| Claude API   | ~€20–50     |
| SMTP         | ~€5         |
| **Total**    | **~€100–150** |

---

## Anima Integration

Anima Curo is designed to integrate with the Anima product ecosystem:

- **Anima CFO Avatar** can connect via REST API to receive alerts, discuss financial decisions, and process incoming invoices
- **Anima Drive** integration for automatic document categorization (invoices, receipts, contracts)
- **Anima Sheets** integration for tabular financial reporting

---

## License

Proprietary. © 2026 Anima / Juan Schubert.
