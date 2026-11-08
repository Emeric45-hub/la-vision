// Module « assistante maternelle » : la journée prévue et pointée de chaque enfant, le pointage
// en direct, la confirmation du soir à partir du planning et le total de la semaine.
// Lit et écrit les créneaux de l'app de pointage existante, au même format, pour que les deux
// apps restent synchronisées. Conçu compact : il sera repris tel quel sur l'accueil.
import { affiche, ecoleAvecNounou } from "../tache/moteur.js";
import { decaler, aujourdhui, maintenant, el, lirePlage, jourAffiche, heureInput } from "./outils.js";
import { lundiDe, joursOuvres, duJour, enCours, totalJour, totalSemaine, duree, nonCouverts, etatBouton, aCouper, arrondi5, enMin } from "./nounou-calcul.js";

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const LIEUX = { ecole: "école", alae: "ALAE", centre: "ALAE", nounou: "nounou", maison: "avec nous" };
const h = x => x ? affiche(x) : "?";
const plages = cr => (cr || []).map(x => `${h(x.debut)}–${h(x.fin)}`).join(" · ");

let C = null;            // { F, db, fam }
let racine = null;
const S = {
  jour: null, lundi: null, src: null, jours: {},      // planning de la semaine
  sessions: [], ecole: new Set(),                     // données de l'app de pointage
  serveur: { sessions: false, ecole: false },         // lectures confirmées par le serveur
  brouillons: {}, ouvert: null, message: "", occupe: false, abonne: null
};

/* ---------- Initialisation ---------- */
export function initNounou(ctx) {
  C = ctx;
  racine = document.getElementById("vue-nounou");
  const journal = C.fam && C.fam.nounou && C.fam.nounou.journal;
  if (!journal) return;
  if (S.abonne !== journal) abonner(journal);
  if (!S.minuteur) S.minuteur = setInterval(tic, 30000);
}

const col = (...p) => C.F.collection(C.db, "nounou", C.fam.nounou.journal, ...p);

function abonner(journal) {
  if (S.stop) S.stop.forEach(f => f());
  S.abonne = journal;
  S.lundi = lundiDe(aujourdhui());
  const { onSnapshot, query, where, documentId } = C.F;
  const fin = decaler(S.lundi, 4);
  const opts = { includeMetadataChanges: true };
  S.stop = [
    onSnapshot(query(col("sessions"), where("date", ">=", S.lundi), where("date", "<=", fin)), opts, snap => {
      S.sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      S.serveur.sessions = !snap.metadata.fromCache;
      surDonnees();
    }, () => { S.serveur.sessions = false; rendreSiVisible(); }),
    onSnapshot(query(col("schooldays"), where(documentId(), ">=", S.lundi), where(documentId(), "<=", fin)), opts, snap => {
      S.ecole = new Set(snap.docs.filter(d => d.data().school).map(d => d.id));
      S.ecoleConnus = new Set(snap.docs.map(d => d.id));
      S.serveur.ecole = !snap.metadata.fromCache;
      surDonnees();
    }, () => { S.serveur.ecole = false; rendreSiVisible(); })
  ];
}

function surDonnees() {
  couperMatin();
  cocherEcole();
  rendreSiVisible();
}

function tic() {
  if (!C || !C.fam || !C.fam.nounou || !C.fam.nounou.journal) return;
  if (lundiDe(aujourdhui()) !== S.lundi) { abonner(C.fam.nounou.journal); S.src = null; }
  if (S.jour !== aujourdhui()) S.src = null;
  couperMatin();
  if (S.message && Date.now() - (S.messageLe || 0) > 60000) S.message = "";
  if (!racine.hidden) S.src ? rendre() : afficherNounou();
}
const rendreSiVisible = () => { if (racine && !racine.hidden && S.src) rendre(); };

/* ---------- Planning de la semaine ---------- */
export async function afficherNounou() {
  if (!racine) return;
  if (!C || !C.fam) { racine.replaceChildren(el("div", "carte", "Configuration familiale absente.")); return; }
  if (!C.fam.nounou || !C.fam.nounou.journal) {
    racine.replaceChildren(el("div", "carte", "Journal de pointage non configuré (famille.nounou.journal)."));
    return;
  }
  if (!S.src) racine.replaceChildren(el("p", "discret", "Chargement…"));
  try {
    S.jour = aujourdhui();
    const lundi = lundiDe(S.jour), vendredi = decaler(lundi, 4);
    const [agenda, sem, plan] = await Promise.all([
      lirePlage(C, ["vision", "agenda", "jours"], decaler(lundi, -1), vendredi),
      lirePlage(C, ["vision", "semainier", "jours"], lundi, vendredi),
      lirePlage(C, ["vision", "planning", "jours"], lundi, vendredi)
    ]);
    S.src = { agenda, sem, plan };
    S.jours = {};
    for (const d of joursOuvres(lundi)) S.jours[d] = jourAffiche(d, S.src, C.fam);
  } catch (e) {
    racine.replaceChildren(el("p", "message ko", "Lecture impossible (" + (e.code || e.name) + ")."));
    return;
  }
  surDonnees();
  rendre();
}

/* ---------- Règles de la journée ---------- */
const enfants = () => [
  { n: "e1", cle: C.fam.enfants.e1.cle, prenom: C.fam.enfants.e1.prenom, scolarise: false },
  { n: "e2", cle: C.fam.enfants.e2.cle, prenom: C.fam.enfants.e2.prenom, scolarise: true }
];
// L'école ce jour-là, d'après le planning ou la case cochée dans l'app de pointage.
function jourEcole(d) {
  if (S.ecole.has(d)) return true;
  const j = S.jours[d], E = C.fam.ecole;
  return !!(j && j.calc && j.aff && j.aff.e2 === "ecole" && !j.calc.vacances && !j.calc.ferie && E.jours.includes(j.calc.jour));
}
function prevus(d, e) {
  const j = S.jours[d];
  if (!j || !j.aff) return [];
  return e.n === "e1" ? (j.aff.e1 ? j.aff.creneauxE1 : []) : (j.aff.creneauxE2 || []);
}
function lignePrevue(d, e) {
  const j = S.jours[d];
  if (!j || !j.calc) return "pas de planning";
  const a = j.aff;
  if (j.calc.ferie) return j.calc.ferie;
  if (e.n === "e1") return a.e1 ? (plages(a.creneauxE1) || "horaires à saisir") : "avec nous";
  const cr = plages(a.creneauxE2);
  if (!a.e2) return "à préciser";
  if (a.e2 === "nounou") return cr || "horaires à saisir";
  return LIEUX[a.e2] + (cr ? " · nounou " + cr : "");
}
const ctxTotaux = () => ({ jour: aujourdhui(), heure: maintenant(), ecole: S.ecole, sortie: C.fam.ecole.sortie, ecolier: C.fam.enfants.e2.cle });
const lu = () => S.serveur.sessions && S.serveur.ecole;

// Créneaux restant à confirmer un jour donné, par enfant (jamais pour un enfant en cours de pointage).
function aConfirmer(d) {
  const res = {};
  for (const e of enfants()) {
    if (d === aujourdhui() && enCours(S.sessions, d, e.cle)) continue;
    const r = nonCouverts(prevus(d, e), duJour(S.sessions, d, e.cle));
    if (r.length) res[e.cle] = r;
  }
  return res;
}
// Le soir : à partir de l'heure de récupération prévue (18h si elle manque).
function soirVenu(d) {
  const j = S.jours[d];
  const r = (j && j.aff && j.aff.recup && j.aff.recup.heure) || "18:00";
  return enMin(maintenant()) >= enMin(r);
}

/* ---------- Écritures (même format que l'app de pointage) ---------- */
async function ecrire(action, texte) {
  if (S.occupe) return;
  S.occupe = true; S.message = ""; rendre();
  try { await action(); S.message = texte; S.messageLe = Date.now(); }
  catch (e) { S.message = "Échec (" + (e.code || e.name) + ")."; }
  finally { S.occupe = false; rendre(); }
}
const creer = data => C.F.addDoc(col("sessions"), data);
const modifier = (id, data) => C.F.updateDoc(C.F.doc(col("sessions"), id), data);

function pointer(e, etat) {
  const d = aujourdhui(), t = arrondi5(maintenant());
  if (etat.action === "depart") return ecrire(() => modifier(etat.run.id, { end: t }), `Départ de ${e.prenom} à ${h(t)}`);
  if (etat.action === "recuperee") {
    const s = C.fam.ecole.sortie;
    return ecrire(() => creer({ child: e.cle, date: d, start: s, end: t }), `Départ de ${e.prenom} à ${h(t)} (arrivée ${h(s)}, sortie d'école)`);
  }
  return ecrire(() => creer({ child: e.cle, date: d, start: t, end: null }), `Arrivée de ${e.prenom} à ${h(t)}`);
}

// Coupe le créneau du matin à l'entrée de l'école, comme l'app de pointage.
let coupe = false;
async function couperMatin() {
  if (coupe || !lu() || !S.src) return;
  const d = aujourdhui(), e2 = C.fam.enfants.e2.cle;
  const run = aCouper({ sessions: S.sessions, jour: d, heure: maintenant(), cle: e2, ecole: jourEcole(d), entree: C.fam.ecole.entree });
  if (!run) return;
  coupe = true;
  try { await modifier(run.id, { end: C.fam.ecole.entree }); } catch (e) { /* nouvel essai au prochain passage */ }
  finally { coupe = false; }
}

// Coche « jour d'école » si le planning prévoit l'école et la nounou après, seulement si la case est vide.
let cochage = false;
async function cocherEcole() {
  const d = aujourdhui(), j = S.jours[d];
  if (cochage || !S.serveur.ecole || !j || (S.ecoleConnus && S.ecoleConnus.has(d))) return;
  if (!ecoleAvecNounou(j.calc, j.aff, C.fam)) return;
  cochage = true;
  const { runTransaction, doc } = C.F;
  try {
    await runTransaction(C.db, async tx => {
      const ref = doc(col("schooldays"), d);
      if (!(await tx.get(ref)).exists()) tx.set(ref, { school: true });
    });
  } catch (e) { /* la tâche planifiée s'en charge aussi */ }
  finally { cochage = false; }
}

async function confirmer(d, e, creneaux) {
  const ok = creneaux.filter(c => c.debut && c.fin && enMin(c.debut) < enMin(c.fin));
  if (!ok.length) { S.message = "Heures incomplètes."; return rendre(); }
  await ecrire(async () => {
    for (const c of ok) await creer({ child: e.cle, date: d, start: c.debut, end: c.fin });
    delete (S.brouillons[d] || {})[e.cle];
    if (S.ouvert === d && !Object.keys(aConfirmer(d)).length) S.ouvert = null;
  }, `${e.prenom} : ${plages(ok)} enregistré`);
}

/* ---------- Rendu ---------- */
function rendre() {
  const d = aujourdhui(), j = S.jours[d];
  const carte = el("div", "carte nn");
  const tete = el("div", "nn-tete");
  const titre = el("h2", "", "Nounou");
  const long = new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const date = long.charAt(0).toUpperCase() + long.slice(1);
  const lien = el("a", "nn-lien", "Chez Nounou ↗"); lien.href = "/nounou/"; lien.target = "_blank"; lien.rel = "noopener";
  tete.append(titre, el("span", "nn-date", date), lien);
  carte.append(tete);

  const weekEnd = !j;
  if (!lu()) carte.append(el("p", "nn-hors", "Pointages non confirmés par le serveur : totaux et boutons en attente."));

  for (const e of enfants()) {
    const ligne = el("div", "nn-ligne " + e.n);
    const gauche = el("div", "nn-id");
    gauche.append(el("span", "nn-prenom", e.prenom), el("span", "nn-prevu", weekEnd ? "week-end" : lignePrevue(d, e)));
    const pointes = duJour(S.sessions, d, e.cle).map(s => `${h(s.start)}–${s.end ? h(s.end) : "…"}`).join(" · ");
    if (pointes) gauche.append(el("span", "nn-pointe", "pointé " + pointes));
    const total = el("span", "nn-total", lu() ? duree(totalJour(S.sessions, d, e.cle, ctxTotaux())) : "—");
    const etat = etatBouton({ sessions: S.sessions, jour: d, heure: maintenant(), cle: e.cle, scolarise: e.scolarise,
      ecole: jourEcole(d), entree: C.fam.ecole.entree, sortie: C.fam.ecole.sortie });
    const bouton = el("button", "nn-bouton" + (etat.action === "depart" || etat.action === "recuperee" ? " sortie" : ""), etat.libelle);
    bouton.type = "button";
    bouton.disabled = !lu() || S.occupe || !etat.action;
    bouton.onclick = () => pointer(e, etat);
    const droite = el("div", "nn-action");
    droite.append(bouton);
    if (etat.sous) droite.append(el("span", "nn-sous", etat.sous.replace(/\b\d\d:\d\d\b/g, h)));
    ligne.append(gauche, total, droite);
    carte.append(ligne);
  }

  // Confirmation du soir (aujourd'hui) puis jours de la semaine restés sans pointage
  if (lu() && j && soirVenu(d) && Object.keys(aConfirmer(d)).length) carte.append(rendreConfirmation(d, "Ce soir — à confirmer"));
  if (lu()) {
    const passes = joursOuvres(S.lundi).filter(x => x < d && S.jours[x] && S.jours[x].calc && Object.keys(aConfirmer(x)).length);
    if (passes.length) {
      const rang = el("div", "nn-passes");
      rang.append(el("span", "nn-sous", "Non confirmés :"));
      for (const x of passes) {
        const b = el("button", "seg-btn" + (S.ouvert === x ? " actif" : ""), `${JOURS[new Date(x + "T12:00:00Z").getUTCDay()]} ${Number(x.slice(8))}`);
        b.type = "button"; b.onclick = () => { S.ouvert = S.ouvert === x ? null : x; rendre(); };
        rang.append(b);
      }
      carte.append(rang);
      if (S.ouvert && passes.includes(S.ouvert)) carte.append(rendreConfirmation(S.ouvert, null));
    }
  }

  const pied = el("div", "nn-pied");
  const ctx = ctxTotaux();
  pied.append(el("span", "", "Semaine"), ...enfants().map(e =>
    el("span", "nn-semaine " + e.n, `${e.prenom} ${lu() ? duree(totalSemaine(S.sessions, S.lundi, e.cle, ctx)) : "—"}`)));
  carte.append(pied);
  if (S.message) carte.append(el("p", "message ok", S.message));
  racine.replaceChildren(carte);
}

function rendreConfirmation(d, titre) {
  const bloc = el("div", "nn-confirmer");
  if (titre) bloc.append(el("h3", "", titre));
  const restes = aConfirmer(d);
  S.brouillons[d] = S.brouillons[d] || {};
  for (const e of enfants()) {
    if (!restes[e.cle]) continue;
    const br = S.brouillons[d][e.cle] = S.brouillons[d][e.cle] || restes[e.cle].map(c => ({ ...c }));
    const ligne = el("div", "nn-conf-ligne " + e.n);
    ligne.append(el("span", "nn-prenom", e.prenom));
    const cr = el("div", "nn-creneaux");
    br.forEach((c, i) => {
      const x = el("span", "nn-creneau");
      x.append(heureInput(c.debut, v => { br[i].debut = v; }, `${e.prenom}, début du créneau ${i + 1}`),
        el("span", "discret", "–"),
        heureInput(c.fin, v => { br[i].fin = v; }, `${e.prenom}, fin du créneau ${i + 1}`));
      cr.append(x);
    });
    const b = el("button", "bouton petit-bouton", "Confirmer");
    b.type = "button"; b.disabled = S.occupe;
    b.onclick = () => confirmer(d, e, br);
    ligne.append(cr, b);
    bloc.append(ligne);
  }
  return bloc;
}
