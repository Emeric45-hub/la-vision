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
export function lignesCase(j, fam) {
  const c = j && j.calc, aff = j && j.aff;
  if (!c || !aff) return [];
  const qui = q => q === "A" ? fam.A.prenom : q === "B" ? fam.B.prenom : "?";
  const n1 = fam.enfants.e1.prenom, out = [];
  if (aff.e1) out.push({ cls: "e1", txt: aff.creneauxE1.length ? `${n1} ${plages(aff.creneauxE1)}` : `${n1} ?` });
  else if (!c.ferie) out.push({ cls: "e1 attenue", txt: `${n1} avec nous` });
  if (!c.ferie) out.push({ cls: "e2", txt: ligneE2(aff, fam) });
  if (aff.e1 && aff.depot) out.push({ cls: "mvt", txt: `Dépôt ${qui(aff.depot.qui)} ${h(aff.depot.heure)}` });
  if (aff.e1 && aff.recup) out.push({ cls: "mvt", txt: `Récup. ${qui(aff.recup.qui)} ${h(aff.recup.heure)}` });
  if (aff.note) out.push({ cls: "note", txt: aff.note });
  return out;
}
