---
name: Anima Cura
description: A restrained clinical operations workspace for dependable practice administration.
colors:
  workspace-dark: "#10121c"
  field-dark: "#191e29"
  field-hover-dark: "#222938"
  border-dark: "#445166"
  text-dark: "#f0f3f8"
  text-muted-dark: "#b0bdcd"
  operational-green: "#4ade80"
  on-operational-green: "#082a17"
  danger-dark: "#f19a91"
  workspace-light: "#ffffff"
  field-light: "#f5f7fa"
  field-hover-light: "#e9eef3"
  border-light: "#aebdcb"
  text-light: "#1c3044"
  text-muted-light: "#4b6076"
  operational-green-light: "#176a40"
  danger-light: "#a8322b"
typography:
  headline:
    fontFamily: "Manrope, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.3
  title:
    fontFamily: "Manrope, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.4
  body:
    fontFamily: "Manrope, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Manrope, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.5
rounded:
  control: "8px"
  panel: "14px"
  card: "16px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  panel: "24px"
components:
  button-primary-dark:
    backgroundColor: "{colors.operational-green}"
    textColor: "{colors.on-operational-green}"
    rounded: "{rounded.control}"
    padding: "8px 14px"
    height: "44px"
  button-primary-light:
    backgroundColor: "{colors.operational-green-light}"
    textColor: "{colors.workspace-light}"
    rounded: "{rounded.control}"
    padding: "8px 14px"
    height: "44px"
  button-neutral-dark:
    backgroundColor: "{colors.field-dark}"
    textColor: "{colors.text-dark}"
    rounded: "{rounded.control}"
    padding: "8px 14px"
    height: "44px"
  input-dark:
    backgroundColor: "{colors.field-dark}"
    textColor: "{colors.text-dark}"
    rounded: "{rounded.control}"
    padding: "10px"
    height: "44px"
  panel-dark:
    backgroundColor: "{colors.workspace-dark}"
    textColor: "{colors.text-dark}"
    rounded: "{rounded.panel}"
    padding: "24px"
---

# Design System: Anima Cura

## Overview

**Creative North Star: "The Clinical Workbench"**

Anima Cura is a restrained clinical operations workspace: calm enough for sustained administrative work, explicit enough for billing decisions, and dense only where the task requires it. Neutral light and dark layers establish hierarchy; borders, spacing, and typography do more work than decoration.

The billing workspace extends the incumbent dashboard with a deliberately utilitarian surface. It keeps labels visible, exposes additional detail inline, and reserves color for state and action rather than atmosphere.

**Key Characteristics:**
- Neutral, high-contrast light and dark operational surfaces.
- Green reserved for selected, primary, focus, and success states.
- Readable 16px body copy and labeled 44px controls.
- Progressive disclosure stays in context through details, editors, and review panels.
- Responsive two-column forms collapse to one column on mobile.

## Colors

The palette is neutral and task-led, with a single green operational accent and a separate red danger signal.

### Primary
- **Operational Green:** Marks the current selection, primary action, focus outline, and successful notice. The dark surface uses the brighter green token; the light surface uses the deeper green token for contrast.

### Tertiary
- **Danger Red:** Used for errors and destructive actions. Destructive buttons remain outlined at rest and fill red only on hover.

### Neutral
- **Night Workspace:** The dark billing panel background and quietest layer.
- **Night Field:** The raised dark control and notice surface; its hover step is used only for interaction feedback.
- **Night Border:** The visible structural line around controls, panels, badges, and list divisions.
- **Night Text / Muted Text:** Primary readable copy and secondary operational context.
- **Clinical White:** The light billing panel background.
- **Pale Field:** The light control and notice surface; its hover step is the adjacent neutral layer.
- **Light Border:** A stronger cool-gray boundary chosen to remain visible on white.
- **Navy Text / Muted Navy:** Primary and secondary text on the light workspace.

### Named Rules
**The Operational Green Rule.** Green means selected, primary, focused, or successful; do not use it as general decoration.

**The Visible Boundary Rule.** Inputs, controls, and status regions retain a discernible border in both themes.

## Typography

**Display Font:** Manrope (with system sans-serif fallbacks)
**Body Font:** Manrope (with system sans-serif fallbacks)
**Label/Mono Font:** Manrope for labels; JetBrains Mono is available for code and machine-readable values.

**Character:** Clear, contemporary, and operational. The billing surface inherits the dashboard's sans-serif voice while increasing body and label readability to a full 16px.

### Hierarchy
- **Headline** (700, 22px, 1.3): Billing workspace title.
- **Title** (700, 18px, 1.4): Editor, review, and subsection titles.
- **Body** (400, 16px, 1.5): Explanations, values, notices, and action context.
- **Label** (600, 16px, 1.5): Persistent field names and interactive control text.
- **Badge** (600, 14px): Compact version and state metadata.

### Named Rules
**The Read-Once Rule.** Operational body text and form labels remain readable at 16px; compact metadata may step down to 14px but cannot replace a visible label.

## Layout

The application shell uses a fixed sidebar, a 64px header, and a scrolling content region. Within the billing workspace, the panel uses 24px padding, 16px grid gaps, 12px action gaps, and 20px section separation. Search is constrained to 600px so lookup remains a focused task rather than a full-width field.

Forms use two equal columns with explicit full-width rows for long selections, text areas, and source details. At 640px and below, the panel padding becomes 16px, the form becomes one column, and definition lists stack label above value. Flex action rows wrap instead of compressing controls below their usable size.

**The In-Context Rule.** Editors, approval decisions, history, and source detail replace or expand within the workspace instead of opening detached overlays.

## Elevation & Depth

The billing workspace is flat by default. It uses neutral layer changes and one-pixel borders rather than shadows; section depth is expressed by top rules and spacing. The surrounding dashboard may use soft card shadows and a blurred header, but these do not enter the billing workbench.

### Named Rules
**The Flat Workbench Rule.** Do not add shadows to billing fields, action groups, notices, or list rows; preserve depth through surfaces and borders.

## Shapes

Controls, inputs, notices, and errors use gently rounded 8px corners. The billing container uses a 14px radius, while dashboard cards elsewhere use 16px. Badges use a compact 6px radius; circular and pill shapes remain limited to shell utilities, status chips, and avatars.

## Components

### Buttons
- **Shape:** Gently rounded controls (8px) with a minimum 44px height and 8px by 14px internal padding.
- **Primary:** Operational green fill with high-contrast text. The selected toggle uses the same assignment through `aria-pressed`.
- **Hover / Focus:** Neutral buttons move one surface step on hover. Primary buttons retain their green identity with a subtle brightness reduction. Keyboard focus uses a 3px green outline with a 3px offset.
- **Neutral:** Field-colored fill, visible border, and primary text.
- **Destructive:** Transparent background with danger-red text and border; the background fills red only on hover.

### Badges
- **Style:** Compact 14px text, 2px by 9px padding, 6px corners, and a neutral border.
- **State:** Badges state version and lifecycle information without competing with the selected or primary green action.

### Cards / Containers
- **Corner Style:** Billing workspace panels use 14px; surrounding dashboard cards use 16px.
- **Background:** One neutral surface per theme, with adjacent neutral field layers inside.
- **Shadow Strategy:** Flat inside the billing workspace; soft shadows belong to higher-level dashboard cards only.
- **Border:** One-pixel visible structural border.
- **Internal Padding:** 24px desktop and 16px mobile.

### Inputs / Fields
- **Style:** Full-width, 44px minimum height, 10px padding, visible one-pixel border, and 8px corners.
- **Focus:** A 3px operational-green outline offset by 3px; the caret and checkbox accent use the same green.
- **Error / Disabled:** Errors use a red border on a neutral field surface. Disabled controls remain legible at 50% opacity and lose the pointer cursor.

### Navigation
- **Style:** The dashboard uses grouped sidebar navigation with visible labels and icon support. Active destinations receive a restrained tinted surface and semantic accent; hover stays neutral. Groups expand and collapse inline, and mobile content stacks rather than preserving multi-column billing forms.

### Progressive Disclosure
Native `details` and `summary` reveal record detail, history, and source information in place. Summaries remain keyboard focusable and retain 44px-adjacent vertical space through 10px padding.

## Do's and Don'ts

### Do:
- **Do** keep operational body copy and visible form labels at 16px.
- **Do** preserve 44px minimum heights for buttons, inputs, text areas, and selects.
- **Do** use green only for selected, primary, focus, and success meaning.
- **Do** keep destructive actions red, outlined, and visually separate from the primary path.
- **Do** collapse two-column forms and definition lists to one column at 640px.
- **Do** disclose details, editing, and confirmation inline where their record context remains visible.

### Don't:
- **Don't** use green as decorative ambient color inside the billing workspace.
- **Don't** remove labels in favor of placeholder-only fields or icon-only operational actions.
- **Don't** introduce modal detours for detail, history, revision, or approval flows already handled inline.
- **Don't** add shadows to billing controls, list rows, or status regions.
- **Don't** compress action controls below their 44px target or preserve two columns on narrow screens.
