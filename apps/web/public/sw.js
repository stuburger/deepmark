self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Batch marking complete", body: event.data?.text() ?? "" };
  }

  const title = data.title ?? "Batch marking complete";
  const options = {
    body: data.body ?? "Your class scripts have been marked.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { batchJobId: data.batchJobId ?? null },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const batchJobId = event.notification.data?.batchJobId;
  const url = batchJobId ? `/teacher/mark/papers` : "/teacher";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.includes(url) && "focus" in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});
