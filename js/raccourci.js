// Données envoyées par le Raccourci iOS (document vision/raccourci, champ « texte » = JSON) :
// { le, rappels: [{ t, l, e, n }], evenements: [{ t, d, f, j, n }], anniversaires: [{ t, d }] }.
// Dates en ISO 8601 avec décalage (heure locale lisible directement : AAAA-MM-JJTHH:MM).
// Fonctions pures, testées sous Node.

const OUI = /^(oui|yes|vrai|true|1)$/i;
const txt = x => (x == null ? "" : String(x)).trim();
const jourDe = x => /^\d{4}-\d{2}-\d{2}/.test(x || "") ? x.slice(0, 10) : null;
const heureDe = x => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(x || "") ? x.slice(11, 16) : null;

// Lit le document ; renvoie { le: Date|null, rappels, evenements, anniversaires } ou { erreur }.
export function lire(donnees) {
  if (!donnees || typeof donnees.texte !== "string") return { erreur: "vide" };
  let j;
  try { j = JSON.parse(donnees.texte); } catch (e) { return { erreur: "format" }; }
  const le = j.le && !isNaN(new Date(j.le)) ? new Date(j.le) : null;
  const rappels = (Array.isArray(j.rappels) ? j.rappels : []).map(r => {
    const jour = jourDe(r.e), heure = heureDe(r.e);
    // Échéance sans heure : l'iPhone l'envoie à 00:00.
    return { titre: txt(r.t), liste: txt(r.l), jour, heure: heure && heure !== "00:00" ? heure : null, notes: txt(r.n) || null };
  }).filter(r => r.titre);
  const evenements = (Array.isArray(j.evenements) ? j.evenements : [])
    .filter(e => txt(e.t) && jourDe(e.d))
    .map(e => ({ titre: txt(e.t), debut: e.d.slice(0, 16), fin: (jourDe(e.f) ? e.f : e.d).slice(0, 16), journee: OUI.test(txt(e.j)), notes: txt(e.n) || null }));
  const anniversaires = (Array.isArray(j.anniversaires) ? j.anniversaires : [])
    .filter(a => txt(a.t) && jourDe(a.d))
    .map(a => ({ titre: txt(a.t), date: jourDe(a.d) }));
  return { le, rappels, evenements, anniversaires };
}

// Listes de rappels récurrents : reconnues à leur nom (« … (récurrents) »), modifiable par
// la configuration (famille.rappels.recurrents = expression régulière). Raccourcis ne transmet
// pas la récurrence d'un rappel.
export const RECURRENTS = "r[ée]currente?s?";

// Rappels du jour (échéance aujourd'hui ou dépassée, toutes listes) et « à faire, plus tard »
// (rappels ponctuels sans date ou à date future ; les récurrents n'y figurent pas).
export function repartir(rappels, aujourdhui, motif = RECURRENTS) {
  const rec = new RegExp(motif || RECURRENTS, "i");
  const cle = r => (r.jour || "9999") + (r.heure || "99:99") + r.titre;
  const jour = rappels.filter(r => r.jour && r.jour <= aujourdhui).map(r => ({ ...r, retard: r.jour < aujourdhui }))
    .sort((a, b) => cle(a).localeCompare(cle(b)));
  const plusTard = rappels.filter(r => (!r.jour || r.jour > aujourdhui) && !rec.test(r.liste))
    .sort((a, b) => cle(a).localeCompare(cle(b)));
  return { jour, plusTard };
}

// Événements du calendrier local qui concernent ce jour, au format des agendas (fil du jour).
export function evenementsDuJour(evenements, date) {
  return evenements.filter(e => {
    const d = e.debut.slice(0, 10), f = e.fin.slice(0, 10);
    if (date < d || date > f) return false;
    // Fin à minuit pile : le jour de fin n'est pas couvert.
    return !(date === f && f > d && e.fin.slice(11, 16) === "00:00");
  });
}

// Pictogramme en tête d'un nom de liste (« 🏠 Maison » → « 🏠 »), sinon rien.
export function picto(nom) {
  const m = /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)/u.exec(nom || "");
  return m ? m[1] : "";
}

// Libellé d'un anniversaire : « Prénom Nom (5 ans) » → « Anniversaire de Prénom Nom (5 ans) ».
export const libelleAnniversaire = t => `Anniversaire de ${t}`;
