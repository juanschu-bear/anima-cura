# Anima Cura — Complete Knowledge Base for iCura

## What is Anima Cura?

Anima Cura is an intelligent practice finance management tool built for orthodontic dental practices (Kieferorthopädische Praxen). It automates installment payment tracking, bank reconciliation, dunning (Mahnwesen), and patient communication. The software replaces manual Excel tracking and paper-based dunning processes.

**Practice:** Kieferorthopädische Praxis Dr. Maria Schubert
**Address:** Nikolaistraße 20, 04109 Leipzig, Germany
**URL:** https://anima-cura.vercel.app
**Owner:** Dr. med. dent. Maria Elena Schubert (referred to as "Frau Dr. Schubert")
**Manager:** Juan Schubert (son, handles tech and administration)
**Office staff:** Sabine (Verwaltung/Administration)

## Practice Context

The practice treats mostly children and adolescents (orthodontics). Key facts:
- 4601 patients in the system
- 2435 family-insured (children insured through parents)
- 1696 statutory health insurance (GKV)
- 350 private insurance (PKV)
- 108 retired patients
- 1988 children (under 18), 2613 adults
- 3187 patients have email addresses (69%)
- 3675 have phone numbers (80%)
- 3078 have mobile numbers

95% of installment plans have identical total and monthly amounts (standard orthodontic treatment). The remaining 5% vary due to additional services.

## The Problem Anima Cura Solves

Before Anima Cura:
- Maria checks the bank account manually 2x per month
- If a patient reverses a direct debit (Rücklastschrift), nobody notices until Maria looks
- Patients who don't pay are confronted in person at the reception — embarrassing for everyone
- No automated reminders or escalation
- Rate plan management is done in IVORIS (practice software) which has no bank connection
- "It's always the same suspects" — repeat offenders need flagging

With Anima Cura:
- Automatic bank synchronization detects missed payments and chargebacks
- Automated email/WhatsApp reminders sent before awkward in-person conversations
- Patient scoring rates payment reliability (0-100)
- Visual dunning pipeline tracks escalation stages
- AI workflow builder creates automations in natural language

## App Pages — Detailed Guide

### Overview (/uebersicht)
The dashboard shows real-time KPIs:
- **Total patients:** 4601 with email/phone coverage stats
- **Treatment status:** How many patients have which treatment phase
- **Insurance distribution:** Pie chart showing GKV/PKV/Family/Retired split
- **Open installments:** Count of overdue payments (shows "—" until rate plans are created)
- **System alerts:** Notifications about missed payments, chargebacks, system events
- **Latest payments:** Recent incoming transactions (empty until bank is connected)

Welcome message says "Willkommen zurück, Frau Dr. Schubert" in German or "Welcome back, Dr. Schubert" in English.

### Payments (/zahlungen)
Manages bank transaction imports and payment matching:
- **Bank Sync button:** Triggers import from finAPI (currently blocked — KYC pending)
- **Transaction table:** Shows date, sender, amount, purpose, matching status, assigned patient
- **Matching:** Automatic matching of incoming payments to patient installments
- **Chargebacks section:** Displays reversed direct debits (Rücklastschriften) with bank fees
- Currently shows empty state with link to Settings for bank connection setup

### Patients (/patienten)
Full patient database synced from IVORIS:
- **4601 patients** with search functionality
- **Columns:** Name, Age, Child/Adult badge, Insurance type (Familie/GKV/PKV/Rentner), Treatment status, Progress, Monthly rate, Remaining debt, Status
- **Search:** Filter by name in the search bar or use the global search in the header
- **IVORIS Sync button:** Triggers full re-sync of all patient data from the IVORIS practice software
- **New Patient button:** Create a patient manually

### Patient Detail (/patienten/[id])
Detailed view of a single patient:
- IVORIS number (practice internal ID)
- Date of birth, gender
- Treatment status (Beratung/KFO/Plan/Nachkontrolle)
- Insurance: shows type (Familienversichert/Gesetzlich/Privat/Rentner) and insurance number
- Policy holder (Versicherungsnehmer) — shows parent's name for children
- Patient since (from insurance valid-from date)
- Phone, mobile, email, address
- Rate plan details (if exists): monthly rate, progress bar, remaining debt
- Payment history table

### Installments (/ratenplan)
Manages rate plans (Ratenpläne):
- List of all active rate plans with patient name, total amount, monthly rate, progress
- **New Rate Plan button:** Create a plan by selecting patient, entering total amount, number of installments, start date, rhythm (monthly/quarterly)
- Rate plan detail shows individual installments with due dates and payment status
- Treatment types: Kassenbehandlung (standard), Privatbehandlung (private), Zusatzleistung (additional)

### Dunning (/mahnwesen)
Visual drag & drop dunning pipeline:
- **4 stages:**
  - Karenz (1-5 days): Automatic grace period, no action needed
  - Stufe 1 (6-20 days): Friendly email reminder sent automatically
  - Stufe 2 (21-42 days): Formal letter + phone call task created
  - Eskalation (42+ days): Case escalated to practice management
- **Drag & drop:** Cases can be moved between stages manually
- **KPIs:** Cases in dunning, open volume, average delay days, chargebacks
- Demo mode with sample cards for testing (real cases appear when rate plans and payments exist)
- Chargeback info: "Chargebacks are detected automatically once the bank connection is active"

### Quarterly Report (/quartal)
Practice analytics based on real patient data:
- Total patients count
- Children vs adults split (1988 children, 2613 adults)
- Email reachability (69% — 3187 of 4601)
- Phone reachability (80% — 3675 landline, 3078 mobile)
- Insurance distribution pie chart with percentages
- Treatment status bar chart
- Note: Financial KPIs available once rate plans and bank connection are set up

### Automations (/automatisierungen)
Visual workflow builder inspired by n8n:
- **Premium design** with cinematic gradient header, animated KPI cards
- **KPIs:** Active workflows, runs today, errors today
- **Workflow list:** Cards showing name, description, trigger type, node count, runs, active/inactive toggle
- **+ New Workflow button:** Opens template picker or blank canvas

**Inside the Workflow Editor:**
- **Left sidebar:** Node palette (Trigger, Condition, Wait, Email, WhatsApp, Alert, Dunning stage, Scoring)
- **Canvas:** React Flow visual editor with drag & drop nodes and connections
- **iCura Co-Pilot:** AI chat assistant (right side) that creates workflows from natural language descriptions
  - User describes what they want in any language
  - iCura proposes a complete workflow with rationale and node list
  - "Übernehmen" (Apply) button places all nodes on the canvas
  - Can iterate — "Add WhatsApp too" or "Change delay to 3 days"
- **Save button:** Persists workflow to Supabase
- **Workflow templates:** Pre-built templates for common scenarios

**Available Node Types:**
- **Trigger:** Rate overdue (X days), Chargeback detected, Daily cron, Scoring below threshold
- **Condition:** Check if email exists, mobile exists, insurance type, dunning stage
- **Action Email:** Send personalized email with template variables ({{patient_name}}, {{betrag}}, {{faellig_am}})
- **Action WhatsApp:** Send WhatsApp message (coming soon, uses template variables)
- **Action Alert:** Internal notification to practice team (info/warning/critical)
- **Action Dunning Stage:** Increase or set dunning stage
- **Action Scoring:** Decrease or set patient reliability score

### Data Import (/import)
CSV/DATEV file import wizard:
- **4-step process:** Upload → Column Mapping → Preview → Import
- **Smart format detection:** Automatically detects DATEV, IVORIS export, or generic CSV
- **Auto-mapping:** Recognizes common column names (Patient, Betrag, Rate, etc.)
- **Drag & drop upload** or file picker
- **Two modes:** Import rate plans (total + monthly rate) or import payments (amount + date)
- **Patient matching:** Matches by IVORIS number or name against 4601 patients in database
- Instructions for IVORIS export: "Open list → Right-click → CSV Export"

### Settings (/einstellungen)
Password-protected settings page (password: ms13sr06?!):
- **Practice info:** Name, address, phone
- **Bank connection:** Connect via finAPI (currently pending KYC verification)
- **Dunning configuration:** Delay days per stage, email templates
- **User management:** Editable table with name, role (Admin/Verwaltung/Lesezugriff), permissions (payments/dunning/settings), password
  - Default users: Dr. Maria Schubert (Admin), Sabine (Verwaltung), Empfang (Lesezugriff)
- **IVORIS sync settings**

## Technical Architecture

- **Frontend:** Next.js 14, React 18, TypeScript, Tailwind CSS
- **Database:** Supabase (PostgreSQL)
- **Hosting:** Vercel
- **AI:** Anthropic Claude (workflow assistant), OpenAI Whisper (speech-to-text), ElevenLabs (text-to-speech)
- **Patient data:** Synced from IVORIS practice software via REST API (4601 patients)
- **Workflow engine:** Custom execution engine that runs active workflows daily via cron job at 06:00 CET
- **Email:** Resend API (configured but not yet active)
- **WhatsApp:** Placeholder endpoint ready for Baileys/OpenWA integration

## Language

The app supports German (DE) and English (EN) with a toggle in the header. All UI labels, navigation, and content switch between languages. Patient data and workflow names stay in the language they were created in. Email templates to patients are always in German (patients are German-speaking).

## Key Keyboard Shortcuts

- Global search: Type in the search bar in the header, press Enter
- Language toggle: Click DE/EN button in header
- Dark/Light mode: Click Dark/Light button in header

## Common User Tasks

**"How do I create a payment reminder?"**
→ Go to Automations → New Workflow → Use iCura Co-Pilot: "Create a payment reminder for 7 days overdue" → Click Übernehmen → Save

**"How do I see which patients haven't paid?"**
→ Go to Dunning — the pipeline shows all overdue cases by stage. Currently in demo mode until rate plans and bank connection are active.

**"How do I connect the bank account?"**
→ Go to Settings → Bank Connection → Currently pending finAPI KYC verification. Documents need to be submitted.

**"How do I import data from IVORIS?"**
→ Go to Data Import → Upload CSV file → Map columns → Preview → Import. For IVORIS: Right-click on any list in the program → CSV Export.

**"How do I add a new user?"**
→ Go to Settings (password required) → User Management → Click "Add User" → Set name, role, permissions, password.

**"How do I sync patient data?"**
→ Go to Patients → Click "IVORIS Sync" button. This re-imports all patients from the practice software.

**"How do I search for a patient?"**
→ Use the search bar at the top of any page, type a name, press Enter. Or go to Patients and use the search field there.
