// Anima Cura Service Worker - Push Notifications

self.addEventListener("push", (event) => {
  let data = { title: "Anima Cura", body: "Neue Benachrichtigung", url: "/patient/portal" };
  
  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch (e) {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    vibrate: [100, 50, 100],
    data: { url: data.url || "/patient/portal" },
    actions: [
      { action: "open", title: "Öffnen" },
    ],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/patient/portal";
  const sep = url.includes("?") ? "&" : "?";
  event.waitUntil(clients.openWindow(url + sep + "from=push"));
});

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(clients.claim()));
