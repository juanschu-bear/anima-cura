import webPush from "web-push";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_KEY || "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webPush.setVapidDetails("mailto:praxis@anima-cura.de", VAPID_PUBLIC, VAPID_PRIVATE);
}

export async function sendPushNotification(
  subscriptionJson: string,
  payload: { title: string; body: string; url?: string }
): Promise<boolean> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    console.warn("VAPID keys not configured, skipping push");
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
