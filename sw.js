// Service worker de La Vision : toujours redemander les fichiers de l'app au serveur
// (revalidation, réponse 304 si rien n'a changé) pour qu'une nouvelle version publiée
// soit prise tout de suite ; la dernière copie reçue ne sert que hors connexion.
// Les requêtes vers d'autres domaines (Firebase, bibliothèques) ne passent pas par ici.
const CACHE = "la-vision";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    try {
      const rep = await fetch(req.url, { cache: "no-cache", credentials: "same-origin" });
      if (rep.ok) { const copie = rep.clone(); caches.open(CACHE).then(c => c.put(req.url, copie)); }
      return rep;
    } catch (err) {
      const copie = await caches.match(req.url) || await caches.match(req.url, { ignoreSearch: true });
      if (copie) return copie;
      throw err;
    }
  })());
});
