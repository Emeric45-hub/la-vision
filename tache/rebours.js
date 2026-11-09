// Compte à rebours : événements à venir repérés dans les agendas (pur, testé sous Node ; aussi
// chargé par l'app pour les dates fixes). Une période de plusieurs jours compte une seule fois,
// à son premier jour.

const UN_JOUR = 86400000;
const lendemain = d => new Date(Date.parse(d + "T12:00:00Z") + UN_JOUR).toISOString().slice(0, 10);

// parJour : { 'AAAA-MM-JJ': [événements] } ; garder(e) : l'événement compte-t-il ?
// Renvoie [{ titre, date }] : premier jour de chaque suite de jours consécutifs, par titre.
export function debutsDePeriodes(parJour, garder, apres) {
  const parTitre = {};
  for (const [d, evs] of Object.entries(parJour)) {
    for (const e of evs || []) if (garder(e)) (parTitre[e.titre.trim()] = parTitre[e.titre.trim()] || new Set()).add(d);
  }
  const res = [];
  for (const [titre, jours] of Object.entries(parTitre)) {
    const l = [...jours].sort();
    l.forEach((d, i) => { if ((i === 0 || lendemain(l[i - 1]) !== d) && d > apres) res.push({ titre, date: d }); });
  }
  return res.sort((a, b) => a.date.localeCompare(b.date) || a.titre.localeCompare(b.titre));
}

// Vacances ou congés posés par un parent (pas les vacances scolaires ni les congés de la nounou).
export function estVacancesPosees(titre, fam) {
  const t = titre.trim();
  if (/scolaire/i.test(t)) return false;
  if (fam && fam.nounou && fam.nounou.conges && new RegExp(fam.nounou.conges, "i").test(t)) return false;
  return /(^|[^\p{L}])(cong[ée]s?|vacances)(?!\p{L})/iu.test(t);
}

// Dates fixes de chaque année (« MM-JJ ») : prochaine occurrence à partir d'aujourd'hui inclus.
export function prochaineAnnuelle(mmjj, aujourdhui) {
  const an = Number(aujourdhui.slice(0, 4));
  const cette = `${an}-${mmjj}`;
  return cette >= aujourdhui ? cette : `${an + 1}-${mmjj}`;
}

export const joursAvant = (date, aujourdhui) => Math.round((Date.parse(date + "T12:00:00Z") - Date.parse(aujourdhui + "T12:00:00Z")) / UN_JOUR);
