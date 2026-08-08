// Service Worker AeroTrack — met en cache l'application elle-même (HTML, bibliothèques, polices)
// pour qu'elle puisse s'ouvrir et fonctionner même sans réseau du tout.
// Les tuiles de carte, elles, restent gérées séparément par IndexedDB dans l'application.

const CACHE_VERSION = 'aerotrack-shell-v1';

const APP_SHELL = [
  './',
  './index.html',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => Promise.all(
        APP_SHELL.map((url) => cache.add(url).catch(() => {}))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = event.request.url;
  // Ne pas intercepter les requêtes d'API dynamiques (météo, bases ULM, tuiles de carte) :
  // elles sont soit gérées par IndexedDB côté application, soit doivent rester en direct.
  if (url.includes('overpass-api.de') ||
      url.includes('vatsim.net') ||
      url.includes('aviationweather.gov') ||
      url.includes('allorigins.win') ||
      url.includes('data.geopf.fr') ||
      url.includes('tile.openstreetmap.org')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request).then((res) => {
        if (res && res.status === 200){
          const resClone = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, resClone));
        }
        return res;
      }).catch(() => cached);
      // Sert le cache immédiatement s'il existe (rapide, fonctionne hors-ligne),
      // tout en rafraîchissant le cache en arrière-plan si le réseau est disponible.
      return cached || network;
    })
  );
});
