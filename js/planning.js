// Écran « Planning du mois » et écran « Horaires du parent B ».
// Le moteur tourne aussi ici, dans le navigateur, pour que chaque saisie ou correction
// s'affiche immédiatement (la tâche planifiée recalcule de son côté pour les autres usages).
import { couchesAffichage, partieValidee, affiche, jourSemaine } from "../tache/moteur.js";
import { pad, decaler, aujourdhui, propre, canon, el, lirePlage as lire, jourAffiche, heureInput } from "./outils.js";
import { lignesJour, dessiner } from "./grille.js";
import { etiquettes as etiq, ligneE2 as ligne2, lignesCase } from "./texte-jour.js";

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const LIEUX = { ecole: "école", alae: "ALAE", centre: "ALAE", nounou: "nounou", maison: "avec nous" };
const h = x => x ? affiche(x) : "?";
const isoJour = (a, m, j) => `${a}-${pad(m)}-${pad(j)}`;

let C = null;            // contexte : { F, db, fam }
const S = { mois: null, jours: {}, selection: null, mode: "grille", valide: null, confirmer: false };

/* ---------- Données ---------- */
const lirePlage = (chemin, du, au) => lire(C, chemin, du, au);

async function chargerMois() {
  const [a, m] = S.mois.split("-").map(Number);
  const nb = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const du = isoJour(a, m, 1), au = isoJour(a, m, nb);
  const [agenda, sem, plan, moisDoc] = await Promise.all([
    lirePlage(["vision", "agenda", "jours"], decaler(du, -1), au),
    lirePlage(["vision", "semainier", "jours"], du, au),
    lirePlage(["vision", "planning", "jours"], du, au),
    C.F.getDocFromServer(C.F.doc(C.db, "vision", "planning", "mois", S.mois))
  ]);
  S.source = { agenda, sem, plan };
  const md = moisDoc.exists() ? moisDoc.data() : {};
  S.valide = md.valideLe ? md : null;
  S.envoi = md.envoi || null;
  S.jours = {};
  for (let j = 1; j <= nb; j++) {
    const d = isoJour(a, m, j);
    if ([0, 6].includes(jourSemaine(d))) continue;
    S.jours[d] = calculer(d);
  }
}

const calculer = d => jourAffiche(d, S.source, C.fam);

async function ecrireJour(d, donnees, champs) {
  const { doc, setDoc, serverTimestamp } = C.F;
  await setDoc(doc(C.db, "vision", "planning", "jours", d), donnees, champs ? { mergeFields: champs } : { merge: true });
  await setDoc(doc(C.db, "vision", "planning"), { majLe: serverTimestamp() }, { merge: true });   // prévient la tâche planifiée
}

function rafraichirJour(d, nouveau) {
  S.source.plan[d] = nouveau;
  S.jours[d] = calculer(d);
}

/* ---------- Libellés ---------- */
const etiquettes = calc => etiq(calc, C.fam);
const ligneE2 = aff => ligne2(aff, C.fam);
const qui = q => q === "A" ? C.fam.A.prenom : q === "B" ? C.fam.B.prenom : "?";
const plages = cr => (cr || []).map(x => `${h(x.debut)}–${h(x.fin)}`).join(" · ");

/* ---------- Points à vérifier ---------- */
// Un point est considéré comme traité quand le jour a été corrigé à la main ou que le mois est
// validé (valider = « j'ai tout vérifié »). Un écart avec le calcul validé reste toujours signalé.
const pointsTraites = j => !!((j.p && j.p.corrige) || S.valide);
const nbPointsJour = j => (pointsTraites(j) ? 0 : (j.calc.points || []).length) + (j.ecart ? 1 : 0);

/* ---------- Rendu ---------- */
let racine;
export function initPlanning(ctx) {
  C = ctx;
  racine = document.getElementById("vue-planning");
  if (!S.mois) { const t = aujourdhui(); S.mois = t.slice(0, 7); }
}

export async function afficherPlanning(jour) {
  if (!racine) return;
  if (jour) { S.mois = jour.slice(0, 7); S.selection = jour; S.mode = "grille"; }
  if (!C || !C.fam) { racine.replaceChildren(el("div", "carte", "Configuration familiale absente.")); return; }
  racine.replaceChildren(el("p", "discret", "Chargement…"));
  try { await chargerMois(); }
  catch (e) { racine.replaceChildren(el("p", "message ko", "Lecture impossible (" + (e.code || e.name) + ").")); return; }
  rendre();
}

function rendre() {
  const [a, m] = S.mois.split("-").map(Number);
  const nomMois = MOIS[m - 1];
  const jours = Object.values(S.jours);
  const nbPoints = jours.filter(j => !j.passe && j.calc).reduce((n, j) => n + nbPointsJour(j), 0);

  const tete = el("div", "pl-tete");
  const nav = el("div", "pl-nav");
  const prec = el("button", "bouton secondaire petit-bouton", "‹"); prec.setAttribute("aria-label", "Mois précédent");
  const suiv = el("button", "bouton secondaire petit-bouton", "›"); suiv.setAttribute("aria-label", "Mois suivant");
  prec.onclick = () => changerMois(-1); suiv.onclick = () => changerMois(1);
  const titre = el("h2", "pl-titre", S.mode === "horaires" ? `Horaires de ${C.fam.B.prenom} — ${nomMois}` : `Planning de ${nomMois} ${a}`);
  nav.append(prec, titre, suiv);
  const etatMois = el("span", "pastille " + (S.valide ? "ok" : ""), S.valide ? "Validé" : "Brouillon");
  const pts = el("span", "pastille alerte", `${nbPoints} point${nbPoints > 1 ? "s" : ""} à vérifier`);
  const actions = el("div", "pl-actions");
  const bH = el("button", "bouton secondaire", S.mode === "horaires" ? "Retour au planning" : `Horaires de ${C.fam.B.prenom}`);
  bH.onclick = () => { S.mode = S.mode === "horaires" ? "grille" : "horaires"; S.confirmer = false; rendre(); };
  actions.append(bH);
  if (S.mode === "grille") {
    const bV = el("button", "bouton", S.confirmer ? `Confirmer la validation de ${nomMois}` : S.valide ? `Revalider ${nomMois}` : `Valider ${nomMois}`);
    bV.onclick = () => S.confirmer ? valider() : (S.confirmer = true, rendre());
    actions.append(bV);
  }
  const modifs = joursModifiesDepuisEnvoi();
  const envoi = S.envoi ? el("span", "pastille" + (modifs.length ? " alerte" : ""),
    `Grille envoyée le ${dateCourte(S.envoi.le)}` + (modifs.length ? ` · ${modifs.length} jour${modifs.length > 1 ? "s" : ""} modifié${modifs.length > 1 ? "s" : ""} depuis` : "")) : null;
  if (S.mode === "grille") {
    const bG = el("button", "bouton secondaire", "Grille pour la nounou");
    bG.onclick = () => ouvrirGrille(nbPoints);
    actions.prepend(bG);
  }
  tete.append(nav, etatMois, pts, ...(envoi ? [envoi] : []), actions);

  const corps = el("div", "pl-corps");
  if (S.mode === "horaires") corps.append(rendreHoraires());
  else corps.append(rendreGrille(a, m), rendrePanneau());
  racine.replaceChildren(tete, corps);
}

function changerMois(n) {
  const [a, m] = S.mois.split("-").map(Number);
  const x = new Date(Date.UTC(a, m - 1 + n, 1));
  S.mois = x.toISOString().slice(0, 7); S.selection = null; S.confirmer = false;
  afficherPlanning();
}

function rendreGrille(a, m) {
  const grille = el("div", "pl-grille");
  ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"].forEach(j => grille.append(el("div", "pl-entete", j)));
  const premier = Object.keys(S.jours).sort()[0];
  for (let i = 1; i < jourSemaine(premier); i++) grille.append(el("div", "pl-vide"));
  for (const d of Object.keys(S.jours).sort()) {
    const j = S.jours[d], c = j.calc, aff = j.aff;
    const b = el("button", "pl-case" + (S.selection === d ? " choisi" : "") + (j.passe ? " passe" : "") + (aff && aff.corrige ? " modifie" : ""));
    b.type = "button";
    b.onclick = () => { S.selection = d; S.confirmer = false; rendre(); };
    b.append(el("span", "pl-num", String(Number(d.slice(8)))));
    etiquettes(c).forEach(t => b.append(el("span", "pl-etiq", t)));
    if (aff) {
      for (const l of lignesCase(j, C.fam)) b.append(el("span", l.cls.split(" ").map((x, k) => k ? x : "pl-" + x).join(" "), l.txt));
      const n = nbPointsJour(j);
      if (n && !j.passe) b.append(el("span", "pl-flag", `${n} à vérifier`));
      if (aff.corrige && j.p.corrige && j.p.corrige.apresValidation) b.append(el("span", "pl-flag bleu", "modifié depuis la validation"));
      if (S.envoi && texteGrille(d) !== (S.envoi.lignes || {})[d]) b.append(el("span", "pl-flag", "modifié depuis l'envoi"));
    }
    b.setAttribute("aria-label", `${JOURS[jourSemaine(d)]} ${Number(d.slice(8))}`);
    grille.append(b);
  }
  return grille;
}

/* ---------- Panneau du jour ---------- */
function segment(options, actif, surChoix) {
  const g = el("div", "seg");
  for (const [val, lib] of options) {
    const b = el("button", "seg-btn" + (val === actif ? " actif" : ""), lib);
    b.type = "button"; b.setAttribute("aria-pressed", String(val === actif));
    b.onclick = () => surChoix(val);
    g.append(b);
  }
  return g;
}

function rendrePanneau() {
  const pan = el("aside", "pl-panneau");
  const d = S.selection, j = d && S.jours[d];
  if (!j || !j.calc) { pan.append(el("p", "discret", "Touche un jour pour voir le détail et le corriger.")); return pan; }
  const c = j.calc, aff = j.aff;
  pan.append(el("h3", "", `${JOURS[jourSemaine(d)]} ${Number(d.slice(8))} ${MOIS[Number(d.slice(5, 7)) - 1]}`));
  etiquettes(c).forEach(t => pan.append(el("p", "pl-etiq", t)));
  const just = el("div", "pl-pourquoi");
  (c.justification || []).forEach(t => just.append(el("p", "", t)));
  if (just.childNodes.length) pan.append(just);
  const traite = pointsTraites(j);
  (c.points || []).forEach(t => pan.append(el("p", "point" + (traite ? " traite" : ""), traite ? `${t} (traité)` : t)));
  if (j.ecart) {
    const box = el("div", "pl-ecart");
    box.append(el("p", "", "Le calcul a changé depuis la validation."));
    const b = el("button", "bouton", "Appliquer le nouveau calcul"); b.onclick = () => appliquer(d);
    box.append(b); pan.append(box);
  }
  if (c.ferie || j.passe) return pan;

  const corriger = (champ, valeur) => {
    const cor = { ...(j.p.corrige || {}), [champ]: valeur };
    if (S.valide) cor.apresValidation = true;
    enregistrerCorrection(d, cor);
  };
  const parents = [["A", C.fam.A.prenom], ["B", C.fam.B.prenom]];
  const n1 = C.fam.enfants.e1.prenom, n2 = C.fam.enfants.e2.prenom;

  pan.append(el("h4", "", n1));
  pan.append(segment([[true, "Chez la nounou"], [false, "Avec nous"]], !!aff.e1, v => corriger("e1", v)));
  if (aff.e1) {
    const dep = aff.depot || { qui: null, heure: null }, rec = aff.recup || { qui: null, heure: null };
    pan.append(el("h4", "", "Dépôt"));
    const l1 = el("div", "ligne-ctrl");
    l1.append(segment(parents, dep.qui, v => corriger("depot", { qui: v, heure: dep.heure })), heureInput(dep.heure, v => corriger("depot", { qui: dep.qui, heure: v }), "Heure du dépôt"));
    pan.append(l1);
    pan.append(el("h4", "", "Récupération"));
    const l2 = el("div", "ligne-ctrl");
    l2.append(segment(parents, rec.qui, v => corriger("recup", { qui: v, heure: rec.heure })), heureInput(rec.heure, v => corriger("recup", { qui: rec.qui, heure: v }), "Heure de la récupération"));
    pan.append(l2);
  }
  pan.append(el("h4", "", `${n2} ce jour-là`));
  pan.append(segment([["ecole", "École"], ["alae", "ALAE"], ["nounou", "Nounou"], ["maison", "Avec nous"]], aff.e2 === "centre" ? "alae" : aff.e2, v => corriger("e2", v)));
  pan.append(el("h4", "", "Note pour la nounou"));
  const note = el("input", "note"); note.type = "text"; note.maxLength = 80; note.value = aff.note || "";
  note.setAttribute("aria-label", "Note pour la nounou");
  note.onchange = () => corriger("note", note.value.trim());
  pan.append(note);

  const recap = el("div", "pl-recap");
  recap.append(el("p", "pl-e1", aff.e1 ? `${n1} ${plages(aff.creneauxE1) || "?"}` : `${n1} avec nous`), el("p", "pl-e2", ligneE2(aff)));
  pan.append(recap);
  if (aff.corrige) {
    const b = el("button", "bouton secondaire", "Annuler les modifications");
    b.onclick = () => enregistrerCorrection(d, null);
    pan.append(b);
  }
  pan.append(el("p", "message", ""));
  return pan;
}

async function enregistrerCorrection(d, cor) {
  const { deleteField } = C.F;
  const p = { ...(S.source.plan[d] || {}) };
  try {
    if (cor) { await ecrireJour(d, { corrige: propre(cor) }, ["corrige"]); p.corrige = propre(cor); }
    else { await ecrireJour(d, { corrige: deleteField() }); delete p.corrige; }
    rafraichirJour(d, p); rendre();
  } catch (e) { signaler("Enregistrement impossible (" + (e.code || e.name) + ")."); }
}

async function appliquer(d) {
  const j = S.jours[d], { serverTimestamp } = C.F;
  const valide = { affiche: propre(couchesAffichage(j.calc)), calculeAlors: propre(partieValidee(j.calc)), le: serverTimestamp() };
  try {
    await ecrireJour(d, { valide }, ["valide"]);
    rafraichirJour(d, { ...(S.source.plan[d] || {}), valide: { ...valide, le: null } }); rendre();
  } catch (e) { signaler("Enregistrement impossible (" + (e.code || e.name) + ")."); }
}

async function valider() {
  const { doc, writeBatch, serverTimestamp } = C.F;
  const lot = writeBatch(C.db);
  for (const j of Object.values(S.jours)) {
    if (!j.calc || j.passe) continue;
    const affiche = { depot: j.aff.depot, recup: j.aff.recup, e1: j.aff.e1, e2: j.aff.e2, note: j.aff.note };
    lot.set(doc(C.db, "vision", "planning", "jours", j.d), { valide: { affiche: propre(affiche), calculeAlors: propre(partieValidee(j.calc)), le: serverTimestamp() } }, { mergeFields: ["valide"] });
  }
  lot.set(doc(C.db, "vision", "planning", "mois", S.mois), { valideLe: serverTimestamp() }, { mergeFields: ["valideLe"] });
  lot.set(doc(C.db, "vision", "planning"), { majLe: serverTimestamp() }, { merge: true });
  try { await lot.commit(); S.confirmer = false; await afficherPlanning(); }
  catch (e) { signaler("Validation impossible (" + (e.code || e.name) + ")."); }
}

function signaler(t) {
  const m = racine.querySelector(".pl-panneau .message") || racine.appendChild(el("p", "message"));
  m.className = "message ko"; m.textContent = t;
}

/* ---------- Horaires du parent B ---------- */
function rendreHoraires() {
  const liste = el("div", "hor-liste");
  liste.append(el("p", "discret", `Début et fin de cabinet, ou Off / Vacances. Enregistré à chaque changement. Les gardes viennent de l'agenda de ${C.fam.B.prenom}.`));
  for (const d of Object.keys(S.jours).sort()) {
    const j = S.jours[d], c = j.calc;
    const ligne = el("div", "hor-ligne" + (j.passe ? " passe" : ""));
    ligne.append(el("span", "hor-date", `${JOURS[jourSemaine(d)].slice(0, 3)}. ${Number(d.slice(8))}`));
    const s = (j.p.saisies && j.p.saisies.B) || null;
    if (!c) { ligne.append(el("span", "discret", "—")); liste.append(ligne); continue; }
    if (c.ferie) { ligne.append(el("span", "hor-info", c.ferie)); liste.append(ligne); continue; }
    if (c.B.statut === "garde" || c.B.statut === "lendemain") {
      ligne.append(el("span", "hor-info", c.B.statut === "garde" ? "Garde" : "Lendemain de garde"));
      liste.append(ligne); continue;
    }
    const debut = heureInput(s && s.type === "travail" ? s.debut : "", () => sauver(), "Début");
    const fin = heureInput(s && s.type === "travail" ? s.fin : "", () => sauver(), "Fin");
    const type = s ? s.type : (c.B.statut === "repos" || c.B.statut === "conge" ? c.B.statut : null);
    const choix = segment([["repos", "Off"], ["conge", "Vacances"]], type === "repos" || type === "conge" ? type : null, v => sauver(v));
    const effacer = el("button", "bouton secondaire petit-bouton", "Effacer"); effacer.onclick = () => sauver("effacer");
    const etat = el("span", "hor-etat", !s && (type === "repos" || type === "conge") ? "agenda" : "");
    async function sauver(v) {
      const { deleteField } = C.F;
      let saisie;
      if (v === "repos" || v === "conge") saisie = { type: v };
      else if (v === "effacer") saisie = null;
      else if (debut.value && fin.value) saisie = { type: "travail", debut: debut.value, fin: fin.value };
      else return;
      try {
        const p = { ...(S.source.plan[d] || {}) };
        if (saisie) { await ecrireJour(d, { saisies: { B: saisie } }, ["saisies.B"]); p.saisies = { ...(p.saisies || {}), B: saisie }; }
        else { await ecrireJour(d, { saisies: { B: deleteField() } }); if (p.saisies) delete p.saisies.B; }
        rafraichirJour(d, p);
        if (v) rendre(); else { etat.textContent = "Enregistré"; etat.className = "hor-etat ok"; }
      } catch (e) { etat.textContent = "Échec"; etat.className = "hor-etat ko"; }
    }
    ligne.append(debut, el("span", "discret", "–"), fin, choix, effacer, etat);
    liste.append(ligne);
  }
  return liste;
}

/* ---------- Grille pour la nounou ---------- */
const texteGrille = d => canon(lignesJour(S.jours[d], C.fam));
const dateCourte = ts => {
  const x = ts && ts.toDate ? ts.toDate() : ts ? new Date(ts) : null;
  return x ? x.toLocaleDateString("fr-FR", { day: "numeric", month: "numeric" }) + " à " + x.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "?";
};
function joursModifiesDepuisEnvoi() {
  if (!S.envoi) return [];
  const l = S.envoi.lignes || {};
  return Object.keys(S.jours).filter(d => texteGrille(d) !== l[d]);
}

function ouvrirGrille(nbPoints) {
  const [, m] = S.mois.split("-").map(Number);
  const canvas = dessiner(document.createElement("canvas"), S.mois, S.jours, C.fam);
  const nom = `Planning nounou ${MOIS[m - 1]} ${S.mois.slice(0, 4)}.png`;
  const fond = el("div", "gr-fond");
  const boite = el("div", "gr-boite");
  const img = el("img", "gr-image"); img.alt = "Grille du mois"; img.src = canvas.toDataURL("image/png");
  const avert = [];
  if (!S.valide) avert.push("mois non validé");
  if (nbPoints) avert.push(`${nbPoints} point${nbPoints > 1 ? "s" : ""} à vérifier`);
  const info = el("p", "gr-info", avert.length ? "Attention : " + avert.join(", ") + "." : "");
  const msg = el("p", "message", "");
  const actions = el("div", "gr-actions");
  const fermer = el("button", "bouton secondaire", "Fermer");
  const partager = el("button", "bouton", "Partager");
  const telecharger = el("button", "bouton secondaire", "Télécharger");
  fermer.onclick = () => fond.remove();
  let fichier = null;
  canvas.toBlob(b => { fichier = new File([b], nom, { type: "image/png" }); }, "image/png");
  const peutPartager = () => fichier && navigator.canShare && navigator.canShare({ files: [fichier] });
  partager.onclick = async () => {
    if (!fichier) return;
    if (!peutPartager()) { msg.textContent = "Partage indisponible sur cet appareil : utilise « Télécharger »."; msg.className = "message ko"; return; }
    try { await navigator.share({ files: [fichier] }); await noterEnvoi(msg); }
    catch (e) { if (e.name !== "AbortError") { msg.textContent = "Partage impossible (" + e.name + ")."; msg.className = "message ko"; } }
  };
  telecharger.onclick = async () => {
    const a = document.createElement("a"); a.href = img.src; a.download = nom; a.click();
    await noterEnvoi(msg);
  };
  actions.append(fermer, telecharger, partager);
  boite.append(img, info, actions, msg);
  fond.append(boite);
  fond.onclick = e => { if (e.target === fond) fond.remove(); };
  document.body.append(fond);
}

// Mémorise le texte de chaque jour envoyé, pour signaler ensuite les jours modifiés.
async function noterEnvoi(msg) {
  const { doc, setDoc, serverTimestamp } = C.F;
  const lignes = {};
  for (const d of Object.keys(S.jours)) lignes[d] = texteGrille(d);
  try {
    await setDoc(doc(C.db, "vision", "planning", "mois", S.mois), { envoi: { le: serverTimestamp(), lignes } }, { mergeFields: ["envoi"] });
    S.envoi = { le: new Date(), lignes };
    msg.textContent = "Envoi noté : les jours modifiés ensuite seront signalés."; msg.className = "message ok";
    rendre();
  } catch (e) { msg.textContent = "Envoi non noté (" + (e.code || e.name) + ")."; msg.className = "message ko"; }
}
