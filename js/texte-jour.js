// Texte d'un jour du planning, commun à l'écran Planning et à la bande « Cette semaine ».
import { affiche } from "../tache/moteur.js";

const LIEUX = { ecole: "école", alae: "ALAE", centre: "ALAE", nounou: "nounou", maison: "avec nous" };
const h = x => x ? affiche(x) : "?";
export const plages = cr => (cr || []).map(x => `${h(x.debut)}–${h(x.fin)}`).join(" · ");

// Gardes, repos, congés et vacances du jour.
export function etiquettes(calc, fam) {
  if (!calc) return [];
  const A = fam.A.prenom, B = fam.B.prenom, out = [];
  if (calc.ferie) return [calc.ferie];
  if (calc.A.gardeSoir) out.push(`Garde ${A}`);
  else if (calc.A.lendemain) out.push(`Repos ${A}`);
  else if (calc.A.statut === "conge") out.push(`${A} en congé`);
  else if (calc.A.statut === "off") out.push(`${A} à la maison`);
  if (calc.B.statut === "garde") out.push(`Garde ${B}`);
  else if (calc.B.statut === "lendemain") out.push(`Repos ${B}`);
  else if (calc.B.statut === "repos") out.push(`${B} off`);
  else if (calc.B.statut === "conge") out.push(`${B} en vacances`);
  if (calc.vacances) out.push("Vacances");
  return out;
}

export function ligneE2(aff, fam) {
  const n = fam.enfants.e2.prenom;
  if (!aff.e2 || aff.e2 === "maison") return aff.e2 ? `${n} avec nous` : `${n} : ?`;
  const cr = plages(aff.creneauxE2);
  if (aff.e2 === "ecole") return cr ? `${n} ${cr}` : `${n} école`;
  if (aff.e2 === "nounou") return `${n} ${cr || "?"}`;
  return `${n} ${LIEUX[aff.e2]}${cr ? " · nounou " + cr : ""}`;
}

// Lignes d'une case : [{ cls, txt }] (cls : e1, e2, mvt, note, attenue).
// compact : dépôt et récupération sur une seule ligne, avec les initiales (bande de l'accueil).
export function lignesCase(j, fam, compact = false) {
  const c = j && j.calc, aff = j && j.aff;
  if (!c || !aff) return [];
  const qui = q => q === "A" ? fam.A.prenom : q === "B" ? fam.B.prenom : "?";
  const n1 = fam.enfants.e1.prenom, out = [];
  if (aff.e1) out.push({ cls: "e1", txt: aff.creneauxE1.length ? `${n1} ${plages(aff.creneauxE1)}` : `${n1} ?` });
  else if (!c.ferie) out.push({ cls: "e1 attenue", txt: `${n1} avec nous` });
  if (!c.ferie) out.push({ cls: "e2", txt: ligneE2(aff, fam) });
  if (compact && aff.e1 && (aff.depot || aff.recup)) {
    const ini = q => q === "A" ? fam.A.initiale : q === "B" ? fam.B.initiale : "?";
    const m = x => x ? `${ini(x.qui)} ${h(x.heure)}` : "?";
    out.push({ cls: "mvt", txt: `${m(aff.depot)} → ${m(aff.recup)}` });
  } else {
    if (aff.e1 && aff.depot) out.push({ cls: "mvt", txt: `Dépôt ${qui(aff.depot.qui)} ${h(aff.depot.heure)}` });
    if (aff.e1 && aff.recup) out.push({ cls: "mvt", txt: `Récup. ${qui(aff.recup.qui)} ${h(aff.recup.heure)}` });
  }
  if (aff.note) out.push({ cls: "note", txt: aff.note });
  return out;
}

// Situation de chaque parent ce jour-là : [{ qui: prénom, texte }].
export function personnes(calc, fam) {
  if (!calc) return [];
  const A = calc.A, B = calc.B, res = [];
  let ta;
  if (calc.ferie) ta = "Férié";
  else if (A.gardeSoir) ta = "Garde ce soir";
  else if (A.lendemain || A.statut === "repos") ta = "Repos de garde";
  else if (A.statut === "conge") ta = "En congé";
  else if (A.statut === "off") ta = "À la maison";
  else if (A.statut === "site") ta = `${fam.A.site.lieu}, retour ${h(fam.A.site.retour)}`;
  else if (A.statut === "chm") ta = fam.A.chm && fam.A.chm.retour ? `Au travail, retour ${h(fam.A.chm.retour)}` : "Au travail";
  else if (A.statut === "fmc") ta = "Formation";
  else ta = "Planning inconnu";
  res.push({ qui: fam.A.prenom, texte: ta });
  const tb = { garde: "Garde (24 h)", lendemain: "Repos de garde", repos: "Off", conge: "En vacances",
    travail: `Cabinet ${h(B.debut)}–${h(B.fin)}`, a_saisir: "Horaires à saisir" }[B.statut] || "?";
  res.push({ qui: fam.B.prenom, texte: tb });
  return res;
}

// Fil de la journée : événements datés des agendas (parents, calendrier commun, abonnements) et
// dépôt / récupération du planning, triés par heure. Les événements « journée » des parents qui
// décrivent déjà leur situation (garde, repos, congé) sont omis.
export function filDuJour(agendaJour, j, fam, date) {
  const items = [];
  if (!agendaJour) agendaJour = {};
  // Situation déjà affichée sur la ligne du parent : garde, repos, off, congé, vacances.
  const motifs = [fam.A.garde, fam.B.garde, fam.B.repos, fam.B.conge, "cong[ée]", "vacances", "\\brepos\\b"]
    .filter(Boolean).map(m => new RegExp(m, "i"));
  const ajouter = (e, qui, source) => {
    // Un événement à heures qui couvre toute la journée (commencé avant, ou de 0h à minuit) compte comme « journée ».
    const journee = e.journee || (date && (e.debut.slice(0, 10) < date || (e.debut.slice(11, 16) === "00:00" && (e.fin.slice(0, 10) > date || e.fin.slice(11, 16) >= "23:59"))));
    if (journee && qui && motifs.some(m => m.test(e.titre.trim()))) return;
    e = { ...e, journee };
    const heure = e.journee ? null : e.debut.slice(11, 16);
    items.push({ heure, fin: e.journee ? null : e.fin.slice(11, 16), titre: e.titre, notes: e.notes || null, lieu: e.lieu || null,
      qui, source: source || null });
  };
  (agendaJour.A || []).forEach(e => ajouter(e, fam.A.prenom));
  (agendaJour.B || []).forEach(e => ajouter(e, fam.B.prenom));
  (agendaJour.C || []).forEach(e => ajouter(e, null, e.source === "commun" ? null : e.source));
  const aff = j && j.aff;
  if (aff && aff.e1) {
    const nom = q => q === "A" ? fam.A.prenom : q === "B" ? fam.B.prenom : "?";
    if (aff.depot && aff.depot.heure) items.push({ heure: aff.depot.heure, titre: `${nom(aff.depot.qui)} dépose`, planning: true });
    if (aff.recup && aff.recup.heure) items.push({ heure: aff.recup.heure, titre: `${nom(aff.recup.qui)} récupère`, planning: true });
  }
  return items.sort((x, y) => (x.heure || "").localeCompare(y.heure || "") || (x.planning ? 1 : 0) - (y.planning ? 1 : 0));
}
