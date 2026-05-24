# Anima Cura — Agent Instructions

## Repo
github.com/juanschu-bear/anima-cura

## Stack
- Next.js 14 (App Router)
- Supabase (Auth, Database)
- TypeScript
- Tailwind CSS
- Vercel (auto-deploy on push to main)
- i18n: bilingual DE/EN via `t()` from `src/lib/i18n.ts`

## MANDATORY RULES — FOLLOW EVERY TIME

1. **Working directory:** Always work in the repo root. Do NOT create copies, clones, or new directories.
2. **Commit and push:** After making changes, ALWAYS run: `git add -A && git commit -m "descriptive message" && git push origin main`. NEVER leave changes uncommitted.
3. **Build check:** `npm run build` must pass BEFORE committing. If it fails, fix it.
4. **Do NOT modify these files** unless explicitly asked: `src/components/icura/ICuraChat.tsx`, `src/components/workflows/WorkflowCanvas.tsx`
5. **Do NOT break existing features.** Test that your changes don't affect unrelated functionality.
6. **Umlauts:** Always use proper German umlauts (ä, ö, ü, ß) in user-facing text, never ae, oe, ue, ss substitutes.
7. **No technology exposure:** Never show "Supabase", "Vercel", "Next.js" or any other technology name in user-facing UI. This is a branded product.
8. **i18n:** All user-facing text must go through the `t()` function from `src/lib/i18n.ts` with both DE and EN translations.

## Key Files
| File | Purpose |
|------|---------|
| `src/app/(dashboard)/layout.tsx` | Dashboard layout with sidebar |
| `src/app/(dashboard)/uebersicht/page.tsx` | Overview page |
| `src/app/(dashboard)/automatisierungen/page.tsx` | Workflow builder page |
| `src/components/icura/ICuraChat.tsx` | iCura Workflow Co-Pilot (DO NOT MODIFY) |
| `src/components/workflows/WorkflowCanvas.tsx` | Visual workflow canvas (DO NOT MODIFY) |
| `src/app/api/cfo/query/route.ts` | Dr. Cashy CFO query endpoint |
| `src/app/api/workflows/assist/route.ts` | Workflow assistant API |
| `src/lib/i18n.ts` | Translations (DE/EN) |
| `src/lib/db/supabase.ts` | Supabase client |
| `middleware.ts` | Auth middleware |

## Git
- Branch: main (push directly)
- Commit messages: imperative mood, concise
- Do not force-push
