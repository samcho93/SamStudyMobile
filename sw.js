// 앱 껍데기만 캐시한다. 허브 설정(JSON)은 앱이 따로 저장하고, 강좌 사이트는 캐시하지 않는다.
const CACHE = 'samstudy-mobile-v1';
const SHELL = [
  './', 'index.html', 'style.css', 'manifest.webmanifest',
  'js/app.js', 'js/auth.js', 'js/catalog.js', 'js/hub.js',
  'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// 네트워크 우선, 실패하면 캐시. 배포하면 바로 새 버전이 뜨고 오프라인에서도 열린다.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return res;
      })
      .catch(() => caches.match(request).then((hit) => hit || caches.match('index.html'))),
  );
});
