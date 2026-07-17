const CACHE = "zaney-v3";
const SHELL = [
  "./", "./index.html",
  "./killer-sudoku-rules.html", "./killer-sudoku-combinations.html",
  "./killer-sudoku-strategy.html", "./privacy.html",
  "./about.html", "./contact.html", "./terms.html",
  "./fonts/inter.woff2", "./fonts/bricolage.woff2",
  "./manifest.json", "./favicon.svg", "./icon-192.png", "./icon-512.png", "./icon-180.png", "./icon-48.png"
];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (e.request.mode === "navigate" || url.pathname.endsWith(".html")) {
    // network-first: fresh deploys win, cache is the offline fallback
    e.respondWith(
      fetch(e.request).then(r => {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return r;
      }).catch(() => caches.match(e.request).then(r => r || caches.match("./index.html")))
    );
  } else {
    // cache-first for static assets
    e.respondWith(
      caches.match(e.request).then(r => r || fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      }))
    );
  }
});
