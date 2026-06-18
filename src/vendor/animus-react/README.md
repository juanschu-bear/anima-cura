# Vendored: @onioko/animus-react

This is a copy of the ANIMUS HUD package source, not an npm dependency. The
package ships raw TypeScript (its `exports` point at `src/index.ts` with no build
step), so Next.js compiles these files directly. We vendor it because the React
19 `peerDependency` in the upstream package only applies to an installed package,
not to copied source, which compiles fine against this app's React 18.

## Source

- Repo: `juanschu-bear/animus`, path `react/src/`
- Commit: `2a70a5e` ("ANIMUS HUD: Doku-Flaeche (DokuPanel + Events)")
- Vendored on: 2026-06-18

## Runtime dependencies

These must stay installed in the app's `package.json` (the vendored code imports
them):

- `livekit-client` (data channel + audio), matched to upstream `2.19.2`
- `three` (the reactive orb scene), matched to upstream `0.184.0`
- `@types/three` (dev), `0.184.1`

## Local changes (drift from upstream)

These were added on top of commit `2a70a5e` to drive the HUD from real patient
data. Re-apply them after any re-sync, or fold them upstream:

- `types.ts`: `AnimusPatient.id?: string` (host maps focus and save back to the
  source record). `Gender` gained `"d"` (divers). `AnimusHudProps` gained
  `onPatientFocus?` (fires on click and on voice call) and `showCard?` (default
  true; the host sets it false to draw its own card).
- `scene.ts`: a third sprite material (neutral gold `0xf5c56b`) for `"d"`, and
  the node cap was removed (`NODES = data.length`) so every active patient is a
  node and `focusByName` can find any of them, not just the first 300.
- `AnimusHud.tsx`: wires `onPatientFocus` to the scene focus callback, gates the
  built-in card behind `showCard`, and adds a "divers" legend entry.

## Updating

Do not hand-edit these files. To pull a newer version, re-copy all of
`AnimusHud.tsx`, `DokuPanel.tsx`, `useAnimus.ts`, `scene.ts`, `types.ts`,
`index.ts` from the upstream repo, bump the commit hash above, and re-check the
two dependency versions. Local edits would be lost on the next sync and would
make this copy drift from GitHub `main`, which is the source of truth.

## How it's wired here

`src/app/scribe/animus/AnimusCockpit.tsx` renders `<AnimusHud>` and implements
`onDokuConfirm`: it resolves the spoken patient name to a real `patient_id` via
`/api/praxis/search` and writes the draft through the logged-in session with
`POST /api/doku/eintrag` (`bestaetigen: true`), exactly like the cockpit confirm
flow. The token server URL comes from `NEXT_PUBLIC_ANIMUS_TOKEN_ENDPOINT`.
