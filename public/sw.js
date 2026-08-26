/* Service worker chỉ làm đúng một việc: hiện thông báo đẩy.
   Không cache gì - app này luôn cần dữ liệu sống, một bản cache cũ
   hiển thị giá cũ còn tệ hơn là không mở được. */
self.addEventListener('push', (event) => {
  let data = { title: 'Cảnh báo danh mục', body: '' };
  try {
    if (event.data) data = event.data.json();
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon.png',
      badge: '/icon.png',
      tag: 'put-screener-alert',
    })
  );
});

/* Bấm vào thông báo thì mở app - dùng lại tab đang mở nếu có. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) return c.focus();
      return clients.openWindow('/');
    })
  );
});
