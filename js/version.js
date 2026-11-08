// Mise à jour de l'app : un service worker force la revalidation des fichiers, et la version
// publiée (version.json, à incrémenter à chaque PR) est vérifiée au retour sur l'app ;
// si elle a changé, la page se recharge.
let chargee = null;
let derniereAction = Date.now();
["pointerdown", "keydown", "input"].forEach(t => document.addEventListener(t, () => { derniereAction = Date.now(); }, true));

async function lire() {
  const r = await fetch("version.json", { cache: "no-store" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return (await r.json()).version;
}

// Au retour sur l'app : rechargement immédiat. Vérification périodique (écran resté allumé) :
// seulement après 2 minutes sans toucher l'écran, pour ne jamais interrompre une saisie.
async function verifier(periodique) {
  if (periodique && Date.now() - derniereAction < 2 * 60 * 1000) return;
  try {
    const v = await lire();
    if (chargee && v !== chargee) location.reload();
  } catch (e) { /* hors connexion : on réessaiera */ }
}

export async function initVersion(el) {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(() => {});
  }
  try { chargee = await lire(); el.textContent = "Version " + chargee; }
  catch (e) { el.textContent = "Version inconnue (hors connexion)"; }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") verifier(); });
  setInterval(() => verifier(true), 30 * 60 * 1000);
}
