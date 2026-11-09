// Calculs du module assistante maternelle, sans accès au DOM ni à Firestore (testés sous Node).
// Les créneaux suivent le format de l'app de pointage existante :
// { child, date: 'YYYY-MM-DD', start: 'HH:MM', end: 'HH:MM' | null }.
// Les totaux reproduisent exactement ceux de cette app pour que les deux affichent le même chiffre.

export const enMin = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
export const enHeure = m => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");

export function lundiDe(d) {
  const x = new Date(d + "T12:00:00Z");
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
}
export function joursOuvres(lundi) {
  return [0, 1, 2, 3, 4].map(i => { const x = new Date(lundi + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + i); return x.toISOString().slice(0, 10); });
}

export const duJour = (sessions, date, cle) => sessions.filter(s => s.date === date && s.child === cle).sort((a, b) => a.start.localeCompare(b.start));
export const enCours = (sessions, date, cle) => sessions.find(s => s.date === date && s.child === cle && !s.end) || null;

// ctx = { jour, heure, ecole: Set des jours d'école cochés, sortie, ecolier: clé de l'enfant scolarisé }
function minutesCreneau(s, ctx) {
  if (!s.end) return s.date === ctx.jour ? Math.max(0, enMin(ctx.heure) - enMin(s.start)) : 0;
  return Math.max(0, enMin(s.end) - enMin(s.start));
}
// Soir d'école : le temps court dès la sortie tant que le départ n'est pas pointé.
function soirVirtuel(sessions, date, cle, ctx) {
  if (cle !== ctx.ecolier || date !== ctx.jour || !ctx.ecole.has(date)) return 0;
  const m = enMin(ctx.heure), sortie = enMin(ctx.sortie);
  if (m < sortie) return 0;
  if (duJour(sessions, date, cle).some(s => enMin(s.start) >= sortie)) return 0;
  return m - sortie;
}
export const totalJour = (sessions, date, cle, ctx) =>
  duJour(sessions, date, cle).reduce((t, s) => t + minutesCreneau(s, ctx), 0) + soirVirtuel(sessions, date, cle, ctx);
export const totalSemaine = (sessions, lundi, cle, ctx) =>
  joursOuvres(lundi).reduce((t, d) => t + totalJour(sessions, d, cle, ctx), 0);

export function duree(min) {
  min = Math.round(min);
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h}h${String(m).padStart(2, "0")}` : `${m} min`;
}

// Créneaux prévus qu'aucun créneau pointé ne recouvre (ce qu'il reste à confirmer).
export function nonCouverts(prevus, pointes) {
  return (prevus || []).filter(p => p.debut && p.fin && !pointes.some(s =>
    enMin(s.start) < enMin(p.fin) && (s.end ? enMin(s.end) : 24 * 60) > enMin(p.debut)));
}

// Vérifie un créneau saisi à la main : heures dans l'ordre, sans recouvrir un autre créneau
// du même enfant le même jour (sauf lui-même). Renvoie un message d'erreur ou null.
export function verifierCreneau(sessions, { id, child, date, start, end }) {
  if (!start) return "Heure d'arrivée manquante.";
  if (end && enMin(end) <= enMin(start)) return "Le départ doit suivre l'arrivée.";
  const autre = sessions.find(s => s.id !== id && s.child === child && s.date === date &&
    enMin(s.start) < (end ? enMin(end) : 24 * 60) && (s.end ? enMin(s.end) : 24 * 60) > enMin(start));
  return autre ? `Recouvre le créneau ${autre.start}–${autre.end || "…"} déjà saisi.` : null;
}
