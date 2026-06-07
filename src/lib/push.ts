import webPush from "web-push";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_KEY || "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "";

// Wichtig: setVapidDetails NICHT beim Modul-Laden aufrufen. Ein fehlendes
// oder fehlerhaftes Schluesselpaar wuerde sonst beim Next-Build (collect
// page data) eine Exception werfen und das Deployment killen. Stattdessen
// faul und in try-catch erst beim ersten echten Senden.
let vapidReady = false;
function ensureVapid(): boolean {
  if (vapidReady) return true;
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return false;
  try {
    webPush.setVapidDetails("mailto:praxis@anima-cura.de", VAPID_PUBLIC, VAPID_PRIVATE);
    vapidReady = true;
    return true;
  } catch (err: any) {
    console.error("VAPID-Schluessel ungueltig, Push deaktiviert:", err?.message);
    return false;
  }
}

export async function sendPushNotification(
  subscriptionJson: string,
  payload: { title: string; body: string; url?: string }
): Promise<boolean> {
  if (!ensureVapid()) {
    console.warn("VAPID keys not configured or invalid, skipping push");
    return false;
  }

  try {
    const subscription = JSON.parse(subscriptionJson);
    await webPush.sendNotification(subscription, JSON.stringify(payload));
    return true;
  } catch (err: any) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      // Subscription expired or invalid
      return false;
    }
    console.error("Push failed:", err.message);
    return false;
  }
}
