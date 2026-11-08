// Calculs du module assistante maternelle, sans accès au DOM ni à Firestore (testés sous Node).
// Les créneaux suivent le format de l'app de pointage existante :
// { child, date: 'YYYY-MM-DD', start: 'HH:MM', end: 'HH:MM' | null }.
// Les totaux reproduisent exactement ceux de cette app pour que les deux affichent le même chiffre.

export const enMin = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
export const enHeure = m => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
export const arrondi5 = t => enHeure(Math.min(24 * 60 - 5, Math.round(enMin(t) / 5) * 5));

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

// État du bouton de pointage, comme dans l'app de pointage.
// ecole : jour d'école ; entree / sortie : heures de l'école ; scolarise : l'enfant va à l'école.
export function etatBouton({ sessions, jour, heure, cle, scolarise, ecole, entree, sortie }) {
  const run = enCours(sessions, jour, cle);
  if (run) return { action: "depart", libelle: "Départ", sous: `chez la nounou depuis ${run.start}`, run };
  if (!scolarise || !ecole) return { action: "arrivee", libelle: "Arrivée", sous: "" };
  const m = enMin(heure);
  if (m < enMin(entree)) return { action: "arrivee", libelle: "Arrivée", sous: "avant l'école" };
  if (m < enMin(sortie)) return { action: null, libelle: "À l'école", sous: `sortie à ${sortie.replace(":", "h")}` };
  const soirFait = duJour(sessions, jour, cle).some(s => enMin(s.start) >= enMin(sortie));
  if (soirFait) return { action: "arrivee", libelle: "Arrivée", sous: "" };
  return { action: "recuperee", libelle: "Départ", sous: `chez la nounou depuis ${sortie} (école)` };
}

// Créneau du matin à couper à l'entrée de l'école (l'app de pointage fait de même).
export function aCouper({ sessions, jour, heure, cle, ecole, entree }) {
  if (!ecole) return null;
  const run = enCours(sessions, jour, cle);
  return run && enMin(run.start) < enMin(entree) && enMin(heure) >= enMin(entree) ? run : null;
}
