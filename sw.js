// Service Worker AeroTrack — met en cache l'application elle-même (HTML, bibliothèques, polices)
// pour qu'elle puisse s'ouvrir et fonctionner même sans réseau du tout.
// Les tuiles de carte, elles, restent gérées séparément par IndexedDB dans l'application.
//
// Stratégie : le document HTML est toujours pris en réseau en priorité quand c'est possible
// (pour ne jamais rester bloqué sur une ancienne version), avec le cache seulement en secours
// hors-ligne. Les bibliothèques externes (Leaflet, pdf.js, polices), elles, changent rarement :
// cache en priorité, réseau en secours.

const CACHE_VERSION = 'aerotrack-shell-v2';

const APP_SHELL = [
  './',
  './index.html',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap'
];

// Requêtes considérées comme "document" (le fichier HTML de l'appli lui-même) :
// c'est celles-là qu'on veut toujours vérifier en réseau en priorité.
function isAppDocument(request, url){
  return request.mode === 'navigate' ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('index.html');
}

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

  const url = new URL(event.request.url);

  // Ne pas intercepter les requêtes d'API dynamiques (météo, bases ULM, tuiles de carte) :
  // elles sont soit gérées par IndexedDB côté application, soit doivent rester en direct.
  if (url.href.includes('overpass-api.de') ||
      url.href.includes('vatsim.net') ||
      url.href.includes('aviationweather.gov') ||
      url.href.includes('allorigins.win') ||
      url.href.includes('data.geopf.fr') ||
      url.href.includes('tile.openstreetmap.org')) {
    return;
  }

  if (isAppDocument(event.request, url)){
    // Réseau en priorité pour le document principal, pour toujours récupérer la dernière
    // version quand une connexion est disponible ; le cache ne sert que si hors-ligne.
    event.respondWith(
      fetch(event.request).then((res) => {
        if (res && res.status === 200){
          const resClone = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, resClone));
        }
        return res;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // Ressources statiques externes (bibliothèques, polices) : cache en priorité, réseau en secours.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        if (res && res.status === 200){
          const resClone = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, resClone));
        }
        return res;
      });
    })
  );
});
