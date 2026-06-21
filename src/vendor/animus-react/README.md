# Vendored: @onioko/animus-react

This is a copy of the ANIMUS HUD package source, not an npm dependency. The
package ships raw TypeScript (its `exports` point at `src/index.ts` with no build
step), so Next.js compiles these files directly. We vendor it because the React
19 `peerDependency` in the upstream package only applies to an installed package,
not to copied source, which compiles fine against this app's React 18.

## Source

- Repo: `juanschu-bear/animus`, path `react/src/`
- Commit: `5a2d822` ("ANIMUS HUD: Doku-Flaeche (DokuPanel + Events)")
- Vendored on: 2026-06-19

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
  node and `focusByName` can find any of them, not just the first 300. The
  reactive core was made small and subtle (fewer, smaller, dimmer points, still
  voice-reactive), and the patient field was tuned to the mockup NETZ look:
  distance-threshold links at low opacity, smaller node sprites, and a depth cue
  that shrinks farther nodes. focusByName/unfocus and the per-node patient data
  are untouched.
- `AnimusHud.tsx`: wires `onPatientFocus` to the scene focus callback, gates the
  built-in card behind `showCard`, and adds a "divers" legend entry.
- Visible layer rebuilt to match `ANIMUS-MOCKUP.html` (repo root), then adjusted
  past the mockup per later requests: topbar with a live clock, the left SYSTEM
  panel (STATUS, ANSICHT, MIKROFON, PEGEL), the right SIGNAL panel with a live
  waveform (LATENZ, SESSION), the greeting moved to the prominent top slot below
  the topbar, the buttons and command line at the bottom, the corner frame, grid
  and glow. The mode tabs, the bottom hint line, the MODELL and KANAL rows were
  removed. All chrome lives in a scoped `CHROME_CSS` block under `.ahud`. Clock
  and waveform effects run before the scene effect, and the scene schedules its
  first frame via rAF, so a scene failure can never block them. The wiring
  (useAnimus, LiveKit, DokuPanel, callbacks) is unchanged.
- `types.ts`/`AnimusHud.tsx`: the `greeting` prop was replaced by `greetingLead`
  + `userName` so the name can be shown in the gradient highlight. Added
  `onPatientUnfocus?` (host closes its card) and an imperative `AnimusHandle`
  (`unfocus`, `focusByName`) exposed via `forwardRef` so the host can zoom the
  orb back out when it closes its own card.

## Updating

The shared core logic should not be copied by hand. Use:

```bash
npm run sync:animus-react
```

The sync script copies the shared core files `useAnimus.ts`, `scene.ts`,
`types.ts`, `index.ts` and `patientCall.ts` from the upstream ANIMUS repo and
updates the commit hash above. By default it reads from the sibling checkout at
`../../ANIMUS/animus-git/react/src`. If your local path differs, set
`ANIMUS_REACT_SOURCE=/path/to/animus/react/src`.

`AnimusHud.tsx` and `DokuPanel.tsx` stay app-local here because `anima-cura`
deliberately carries custom cockpit chrome and workflow behavior on top.

## How it's wired here

`src/app/scribe/animus/AnimusCockpit.tsx` renders `<AnimusHud>` and implements
`onDokuConfirm`: it resolves the spoken patient name to a real `patient_id` via
`/api/praxis/search` and writes the draft through the logged-in session with
`POST /api/doku/eintrag` (`bestaetigen: true`), exactly like the cockpit confirm
flow. The token server URL comes from `NEXT_PUBLIC_ANIMUS_TOKEN_ENDPOINT`.
