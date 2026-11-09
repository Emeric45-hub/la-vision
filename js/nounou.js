// Module « assistante maternelle » : la journée prévue et saisie de chaque enfant, la confirmation
// du soir à partir du planning, l'ajout et la correction d'un créneau, le total de la semaine.
// Pas de pointage en direct : il se fait dans l'app de pointage, sur le téléphone.
// Lit et écrit les créneaux de l'app de pointage existante, au même format, pour que les deux
// apps restent synchronisées. Conçu compact : il sera repris tel quel sur l'accueil.
import { affiche, ecoleAvecNounou } from "../tache/moteur.js";
import { decaler, aujourdhui, maintenant, el, lirePlage, jourAffiche, heureInput } from "./outils.js";
import { lundiDe, joursOuvres, duJour, enCours, totalJour, totalSemaine, duree, nonCouverts, verifierCreneau, enMin } from "./nounou-calcul.js";

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const LIEUX = { ecole: "école", alae: "ALAE", centre: "ALAE", nounou: "nounou", maison: "avec nous" };
const h = x => x ? affiche(x) : "?";
const plages = cr => (cr || []).map(x => `${h(x.debut)}–${h(x.fin)}`).join(" · ");

let C = null;            // { F, db, fam }
let racine = null;
const autres = new Set();   // autres emplacements (carte de l'accueil)
const visible = e => e && e.isConnected && !e.closest(".vue").hidden;
const cibles = () => [racine, ...autres].filter(visible);
const afficherPartout = n => cibles().forEach(c => c.replaceChildren(typeof n === "function" ? n() : n.cloneNode(true)));
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
  cocherEcole();
  rendreSiVisible();
}

function tic() {
  if (!C || !C.fam || !C.fam.nounou || !C.fam.nounou.journal) return;
  if (lundiDe(aujourdhui()) !== S.lundi) { abonner(C.fam.nounou.journal); S.src = null; }
  if (S.jour !== aujourdhui()) S.src = null;
  if (S.message && Date.now() - (S.messageLe || 0) > 60000) S.message = "";
  if (cibles().length) S.src ? rendre() : afficherNounou();
}
const rendreSiVisible = () => { if (S.src && cibles().length) rendre(); };

// Affiche aussi le module dans un autre emplacement (l'accueil).
export function monterNounou(e) { autres.add(e); S.src ? rendre() : afficherNounou(); }

/* ---------- Planning de la semaine ---------- */
export async function afficherNounou() {
  if (!racine) return;
  if (!C || !C.fam) { afficherPartout(el("div", "carte", "Configuration familiale absente.")); return; }
  if (!C.fam.nounou || !C.fam.nounou.journal) {
    afficherPartout(el("div", "carte", "Journal de pointage non configuré (famille.nounou.journal)."));
    return;
  }
  if (!S.src) afficherPartout(el("p", "discret", "Chargement…"));
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
    afficherPartout(el("p", "message ko", "Lecture impossible (" + (e.code || e.name) + ")."));
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
    const p = S.src && S.src.plan[d];
    if (p && p.nounouFait && p.nounouFait[e.cle]) continue;   // journée déjà confirmée ou « pas allé(e) »
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
const supprimer = id => C.F.deleteDoc(C.F.doc(col("sessions"), id));

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

// Le jour même, l'app de pointage compte l'enfant scolarisé chez la nounou dès la sortie de
// l'école tant qu'aucun créneau du soir n'existe. S'il n'y en aura pas, on décoche « école ».
async function finirSoir(d, e, creesApresSortie) {
  if (e.n !== "e2" || d !== aujourdhui() || !S.ecole.has(d) || creesApresSortie) return;
  const sortie = enMin(C.fam.ecole.sortie);
  if (duJour(S.sessions, d, e.cle).some(s => enMin(s.start) >= sortie)) return;
  await C.F.setDoc(C.F.doc(col("schooldays"), d), { school: false });
}

// Journée traitée pour un enfant (« confirme » ou « absent ») : plus rien n'est proposé ce jour-là,
// même si des créneaux prévus ont été retirés avant de confirmer.
async function noterFait(d, e, valeur) {
  const { doc, setDoc } = C.F;
  await setDoc(doc(C.db, "vision", "planning", "jours", d), { nounouFait: { [e.cle]: valeur } }, { mergeFields: [`nounouFait.${e.cle}`] });
  const p = S.src.plan[d] = S.src.plan[d] || {};
  p.nounouFait = { ...(p.nounouFait || {}), [e.cle]: valeur };
}

// « Pas allé(e) chez la nounou ».
async function absent(d, e) {
  await ecrire(async () => {
    await noterFait(d, e, "absent");
    delete (S.brouillons[d] || {})[e.cle];
    await finirSoir(d, e, false);
    if (S.ouvert === d && !Object.keys(aConfirmer(d)).length) S.ouvert = null;
  }, `${e.prenom} : pas chez la nounou ce jour-là, noté`);
}

async function confirmer(d, e, creneaux) {
  const ok = creneaux.filter(c => c.debut && c.fin && enMin(c.debut) < enMin(c.fin));
  if (!ok.length) { S.message = "Heures incomplètes, ou aucun créneau : utiliser « Pas allé(e) »."; return rendre(); }
  await ecrire(async () => {
    for (const c of ok) await creer({ child: e.cle, date: d, start: c.debut, end: c.fin });
    await noterFait(d, e, "confirme");
    await finirSoir(d, e, ok.some(c => enMin(c.debut) >= enMin(C.fam.ecole.sortie)));
    delete (S.brouillons[d] || {})[e.cle];
    if (S.ouvert === d && !Object.keys(aConfirmer(d)).length) S.ouvert = null;
  }, `${e.prenom} : ${plages(ok)} enregistré`);
}

/* ---------- Rendu ---------- */
function rendre() { afficherPartout(construire); }

function construire() {
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
  if (!lu()) carte.append(el("p", "nn-hors", "Créneaux non confirmés par le serveur : totaux et saisie en attente."));

  for (const e of enfants()) {
    const ligne = el("div", "nn-ligne " + e.n);
    const gauche = el("div", "nn-id");
    gauche.append(el("span", "nn-prenom", e.prenom), el("span", "nn-prevu", weekEnd ? "week-end" : "prévu " + lignePrevue(d, e)));
    const saisis = duJour(S.sessions, d, e.cle);
    if (saisis.length) {
      const puces = el("div", "nn-puces");
      for (const x of saisis) {
        const b = el("button", "nn-puce" + (S.edition && S.edition.id === x.id ? " actif" : ""), `${h(x.start)}–${x.end ? h(x.end) : "…"}`);
        b.type = "button"; b.disabled = !lu();
        b.setAttribute("aria-label", `Corriger le créneau de ${e.prenom} ${b.textContent}`);
        b.onclick = () => { S.edition = { id: x.id, child: x.child, date: x.date, start: x.start, end: x.end || "" }; S.confirmSuppr = false; rendre(); };
        puces.append(b);
      }
      gauche.append(puces);
    }
    ligne.append(gauche, el("span", "nn-total", lu() ? duree(totalJour(S.sessions, d, e.cle, ctxTotaux())) : "—"));
    carte.append(ligne);
    if (S.edition && S.edition.child === e.cle && S.edition.id && S.edition.date === d) carte.append(rendreEdition());
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

  if (S.edition && !S.edition.id) carte.append(rendreEdition());
  const pied = el("div", "nn-pied");
  const ctx = ctxTotaux();
  pied.append(el("span", "", "Semaine"), ...enfants().map(e =>
    el("span", "nn-semaine " + e.n, `${e.prenom} ${lu() ? duree(totalSemaine(S.sessions, S.lundi, e.cle, ctx)) : "—"}`)));
  const ajout = el("button", "seg-btn nn-ajout", "+ Ajouter un créneau");
  ajout.type = "button"; ajout.disabled = !lu();
  ajout.onclick = () => { S.edition = { id: null, child: C.fam.enfants.e1.cle, date: d < S.lundi || !S.jours[d] ? decaler(S.lundi, 4) : d, start: "", end: "" }; rendre(); };
  pied.append(ajout);
  carte.append(pied);
  if (S.message) carte.append(el("p", "message ok", S.message));
  return carte;
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
    br.forEach((c, i) => {
      const x = el("div", "nn-creneau");
      const retirer = el("button", "nn-retirer", "✕");
      retirer.type = "button"; retirer.setAttribute("aria-label", `Retirer ce créneau de ${e.prenom}`);
      retirer.onclick = () => { br.splice(i, 1); rendre(); };
      x.append(el("span", "nn-de", "de"), heureInput(c.debut, v => { br[i].debut = v; }, `${e.prenom}, début du créneau ${i + 1}`), retirer,
        el("span", "nn-de", "à"), heureInput(c.fin, v => { br[i].fin = v; }, `${e.prenom}, fin du créneau ${i + 1}`));
      ligne.append(x);
    });
    const actions = el("div", "nn-conf-actions");
    const b = el("button", "bouton petit-bouton", "Confirmer");
    b.type = "button"; b.disabled = S.occupe || !br.length;
    b.onclick = () => confirmer(d, e, br);
    const non = el("button", "bouton secondaire petit-bouton", "Pas allé(e)");
    non.type = "button"; non.disabled = S.occupe;
    non.onclick = () => absent(d, e);
    actions.append(b, non);
    ligne.append(actions);
    bloc.append(ligne);
  }
  return bloc;
}

/* ---------- Ajout et correction d'un créneau ---------- */
function rendreEdition() {
  const E = S.edition;
  const bloc = el("div", "nn-edition");
  bloc.append(el("h3", "", E.id ? "Corriger le créneau" : "Ajouter un créneau"));
  if (!E.id) {
    const segE = el("div", "seg");
    for (const e of enfants()) {
      const b = el("button", "seg-btn" + (E.child === e.cle ? " actif" : ""), e.prenom);
      b.type = "button"; b.onclick = () => { E.child = e.cle; rendre(); };
      segE.append(b);
    }
    const jours = el("select", "nn-jour"); jours.setAttribute("aria-label", "Jour");
    for (const x of joursOuvres(S.lundi).filter(x => x <= aujourdhui())) {
      jours.append(new Option(`${JOURS[new Date(x + "T12:00:00Z").getUTCDay()]} ${Number(x.slice(8))}`, x));
    }
    jours.value = E.date; jours.onchange = () => { E.date = jours.value; };
    const l = el("div", "ligne-ctrl"); l.append(segE, jours); bloc.append(l);
  }
  const heures = el("div", "ligne-ctrl");
  heures.append(el("span", "nn-sous", "Arrivée"), heureInput(E.start, v => { E.start = v; }, "Arrivée"),
    el("span", "nn-sous", "Départ"), heureInput(E.end, v => { E.end = v; }, "Départ"));
  bloc.append(heures);
  const actions = el("div", "ligne-ctrl");
  const ok = el("button", "bouton petit-bouton", "Enregistrer");
  ok.type = "button"; ok.disabled = S.occupe;
  ok.onclick = () => {
    const err = verifierCreneau(S.sessions, E);
    if (err) { S.message = err.replace(/\b\d\d:\d\d\b/g, h); S.messageLe = Date.now(); return rendre(); }
    const prenom = enfants().find(e => e.cle === E.child).prenom;
    const texte = `${prenom} : ${h(E.start)}–${E.end ? h(E.end) : "…"} enregistré`;
    const data = { child: E.child, date: E.date, start: E.start, end: E.end || null };
    S.edition = null;
    ecrire(() => E.id ? modifier(E.id, { start: data.start, end: data.end }) : creer(data), texte);
  };
  const annuler = el("button", "bouton secondaire petit-bouton", "Annuler");
  annuler.type = "button"; annuler.onclick = () => { S.edition = null; rendre(); };
  actions.append(ok, annuler);
  if (E.id) {
    const suppr = el("button", "bouton secondaire petit-bouton nn-suppr", S.confirmSuppr ? "Confirmer la suppression" : "Supprimer");
    suppr.type = "button"; suppr.disabled = S.occupe;
    suppr.onclick = () => {
      if (!S.confirmSuppr) { S.confirmSuppr = true; return rendre(); }
      const id = E.id; S.edition = null; S.confirmSuppr = false;
      ecrire(() => supprimer(id), "Créneau supprimé");
    };
    actions.append(suppr);
  }
  bloc.append(actions);
  return bloc;
}
