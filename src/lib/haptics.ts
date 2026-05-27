/**
 * Haptic feedback utility for mobile devices.
 * Uses navigator.vibrate where available, silently no-ops on unsupported browsers.
 */

function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Silently ignore - not all contexts allow vibration
    }
  }
}

/** Light tap - tab switches, checkbox toggles, list item taps */
export function hapticLight(): void {
  vibrate(10);
}

/** Medium tap - navigation actions, opening menus, sub-views */
export function hapticMedium(): void {
  vibrate(25);
}

/** Strong tap - important actions like payments, confirmations */
export function hapticStrong(): void {
  vibrate(50);
}

/** Success pattern - message sent, download complete, save confirmed */
export function hapticSuccess(): void {
  vibrate([15, 50, 15]);
}
