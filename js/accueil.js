// Accueil (iPad en paysage). Barre du haut : date, heure, état des sources, accès au planning,
// réglages. Puis briefing, météo et compte à rebours ; quatre colonnes (Aujourd'hui ; Nounou +
// Ce soir ; Rappels du jour + post-it, avec « À faire, plus tard » dessous) ; bande « Cette semaine ».
import { el, maintenant, aujourdhui, decaler, lirePlage, jourAffiche, surveillerDebord } from "./outils.js";
import { niveau, depuis } from "./fraicheur.js";
import { etiquettes, lignesCase, personnes, filDuJour, ligneE2 } from "./texte-jour.js";
import { monterNounou, rechargerNounou } from "./nounou.js";
import { affiche } from "../tache/moteur.js";
import { prochaineAnnuelle, joursAvant } from "../tache/rebours.js";
import { url as urlMeteo, decrire, creneaux as creneauxMeteo, SEUILS as SEUILS_METEO } from "./meteo.js";
import { lundiDe } from "./nounou-calcul.js";
import { postit as postitFamille, initPostit } from "./postit.js";
import { pourEnfant } from "../tache/cantine.js";
import { ouvrirRecette } from "./recette.js";
import { lire as lireRaccourci, repartir, evenementsDuJour, picto, libelleAnniversaire, appliquerActions, cleRappel } from "./raccourci.js";

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const JOURS_COURTS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

let C = null, racine = null;
const S = { etat: null, serveur: false, verrou: null, minuteur: null, stop: null,
  semaine: null, chargement: null, cleEtat: null, moisSuivant: null, nounou: null };

export function initAccueil(ctx) {
  C = ctx;
  racine = document.getElementById("vue-accueil");
  if (!S.stop && C.db) {
    const { onSnapshot, doc } = C.F;
    S.stop = onSnapshot(doc(C.db, "vision", "etat"), { includeMetadataChanges: true }, snap => {
      S.etat = snap.exists() ? snap.data() : null;
      S.serveur = !snap.metadata.fromCache;
      // Après chaque passage de la tâche, la semaine est relue (le planning a pu changer).
      const cle = JSON.stringify([S.etat && S.etat.agendas && S.etat.agendas.lu, S.etat && S.etat.planning && S.etat.planning.calcule]);
      if (cle !== S.cleEtat) { S.cleEtat = cle; S.semaine = null; }
      if (visible()) charger();
    }, () => { S.serveur = false; rendreSiVisible(); });
  }
  if (!S.stopRebours && C.db) {
    const { onSnapshot, doc } = C.F;
    S.stopRebours = onSnapshot(doc(C.db, "vision", "rebours"), snap => { S.rebours = snap.exists() ? snap.data() : {}; rendreSiVisible(); }, () => {});
  }
  if (!S.stopCantine && C.db) {   // menus de la cantine, lus une fois par jour par la tâche
    const { onSnapshot, doc } = C.F;
    S.stopCantine = onSnapshot(doc(C.db, "vision", "cantine"), snap => { S.cantine = snap.exists() ? snap.data() : {}; rendreSiVisible(); }, () => {});
    S.stopPlats = onSnapshot(doc(C.db, "vision", "plats"), snap => { S.plats = snap.exists() ? snap.data() : {}; rendreSiVisible(); }, () => {});
  }
  if (!S.stopRaccourci && C.db) {   // rappels, calendrier local et anniversaires envoyés par le Raccourci iOS
    const { onSnapshot, doc } = C.F;
    S.stopRaccourci = onSnapshot(doc(C.db, "vision", "raccourci"), { includeMetadataChanges: true }, snap => {
      if (snap.metadata.fromCache && !snap.exists()) return;   // cache vide : pas une absence de données
      S.raccourci = lireRaccourci(snap.exists() ? snap.data() : null);
      rendreSiVisible();
    }, () => {});
    // Actions en attente du prochain passage (cocher, créer, courses)
    S.stopActions = onSnapshot(C.F.collection(C.db, "vision", "raccourci", "actions"), snap => {
      S.actions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Raccourcis s'arrête sur un champ absent : toute fiche reçoit ses quatre champs texte.
      for (const a of S.actions) {
        const manque = CHAMPS_ACTION.filter(k => typeof a[k] !== "string");
        if (manque.length) C.F.updateDoc(C.F.doc(C.db, "vision", "raccourci", "actions", a.id), Object.fromEntries(manque.map(k => [k, ""]))).catch(() => {});
      }
      rendreSiVisible();
    }, () => {});
  }
  initPostit(C);
  lireMeteo();
  if (!S.minuteurMeteo) S.minuteurMeteo = setInterval(lireMeteo, 30 * 60000);
  if (!S.minuteur) S.minuteur = setInterval(() => {
    if (S.semaine && S.semaine.jour !== aujourdhui()) S.semaine = null;
    if (visible()) charger();
  }, 60000);
  document.addEventListener("visibilitychange", gererVerrou);
}

const visible = () => racine && !racine.hidden;
const rendreSiVisible = () => { if (visible()) rendre(); };

export function afficherAccueil() {
  if (!racine) return;
  gererVerrou();
  charger();
}

// Écran maintenu allumé tant que l'accueil est affiché (l'iPad est aussi réglé sur « Jamais »).
async function gererVerrou() {
  const voulu = visible() && document.visibilityState === "visible";
  try {
    if (voulu && !S.verrou && navigator.wakeLock) {
      S.verrou = await navigator.wakeLock.request("screen");
      S.verrou.addEventListener("release", () => { S.verrou = null; });
    } else if (!voulu && S.verrou) { await S.verrou.release(); S.verrou = null; }
  } catch (e) { /* refusé : sans conséquence */ }
}

/* ---------- Données : semaine en cours et mois suivant ---------- */
async function charger() {
  rendre();
  if (S.semaine || S.chargement || !C || !C.fam) return;
  const jour = aujourdhui(), lundi = lundiDe(jour), dimanche = decaler(lundi, 6);
  const [a, m] = jour.split("-").map(Number);
  const suivant = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
  S.chargement = (async () => {
    try {
      const { doc, getDocFromServer } = C.F;
      const [agenda, sem, plan, mois, moisCourant] = await Promise.all([
        lirePlage(C, ["vision", "agenda", "jours"], decaler(lundi, -1), dimanche),
        lirePlage(C, ["vision", "semainier", "jours"], lundi, dimanche),
        lirePlage(C, ["vision", "planning", "jours"], lundi, dimanche),
        getDocFromServer(doc(C.db, "vision", "planning", "mois", suivant)),
        getDocFromServer(doc(C.db, "vision", "planning", "mois", jour.slice(0, 7)))
      ]);
      const src = { agenda, sem, plan }, jours = {};
      for (let i = 0; i < 7; i++) { const d = decaler(lundi, i); if (i < 5) jours[d] = jourAffiche(d, src, C.fam); else jours[d] = null; }
      S.semaine = { jour, lundi, jours, src, erreur: null, moisValide: moisCourant.exists() && !!moisCourant.data().valideLe };
      S.moisSuivant = { cle: suivant, ...(mois.exists() ? mois.data() : {}) };
    } catch (e) {
      S.semaine = { jour, lundi, jours: {}, erreur: e.code || e.name };
    } finally { S.chargement = null; rendreSiVisible(); }
  })();
}

/* ---------- Fraîcheur des sources ---------- */
const NOMS = { agendas: "Agendas", meteo: "Météo", rappels: "Rappels" };
const enDate = ts => ts && ts.toDate ? ts.toDate() : ts ? new Date(ts) : null;
function sources() {
  const ag = S.etat && S.etat.agendas;
  const res = [{ cle: "agendas", ...niveau("agendas", enDate(ag && ag.lu), new Date(), maintenant()), lu: enDate(ag && ag.lu) }];
  if (S.raccourci) { const lu = S.raccourci.le || null; res.push({ cle: "rappels", ...niveau("rappels", lu, new Date(), maintenant()), lu }); }
  if (meteoConfiguree()) res.push({ cle: "meteo", ...niveau("meteo", S.meteo && S.meteo.lu ? new Date(S.meteo.lu) : null, new Date(), maintenant()), lu: S.meteo && S.meteo.lu ? new Date(S.meteo.lu) : null });
  return res;
}
const hm = d => d ? d.toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }) : "?";

/* ---------- Rendu ---------- */
function rendre() {
  if (!racine) return;
  // Pas de reconstruction pendant une saisie : le champ perdrait son texte et le clavier.
  const actif = document.activeElement;
  if (actif && racine.contains(actif) && (actif.tagName === "INPUT" || actif.tagName === "TEXTAREA")) {
    if (!actif.dataset.attente) { actif.dataset.attente = "1"; actif.addEventListener("blur", () => setTimeout(rendreSiVisible, 0), { once: true }); }
    return;
  }
  const tout = el("div", "ac");
  const src = S.serveur ? sources() : [];
  tout.append(barre(src));

  if (!S.serveur) tout.append(el("p", "ac-bandeau", "Base de données injoignable : l'accueil n'affiche rien plutôt qu'un faux vide."));
  if (S.erreurEcriture) tout.append(el("p", "ac-bandeau", `Correction non enregistrée (${S.erreurEcriture}).`));
  for (const s of src.filter(x => x.niveau === "rouge" && x.cle === "agendas")) {
    tout.append(el("p", "ac-bandeau", s.minutes == null
      ? "La tâche planifiée n'a jamais lu les agendas."
      : `La tâche planifiée n'a pas lu les agendas depuis ${depuis(s.minutes)} (dernier passage à ${hm(s.lu)}) : vérifier cron-job.org.`));
  }

  for (const s of src.filter(x => x.niveau === "rouge" && x.cle === "rappels")) {
    tout.append(el("p", "ac-bandeau", s.minutes == null
      ? "Le Raccourci de l'iPhone n'a encore rien envoyé (rappels, calendrier de l'iPhone, anniversaires)."
      : `Le Raccourci de l'iPhone n'a rien envoyé depuis ${depuis(s.minutes)} : rappels non à jour. Vérifier ses automatisations.`));
  }

  const haut = el("div", "ac-haut");
  haut.append(carte("ac-briefing", "Briefing", "Arrive avec le lot 3."),
    meteoCarte(),
    reboursCarte());
  tout.append(haut);

  const cols = el("div", "ac-colonnes");
  const pile = el("div", "ac-pile");
  if (!S.nounou) S.nounou = el("div", "ac-nounou");
  pile.append(S.nounou, soirCarte());
  const droite = el("div", "ac-droite");
  droite.append(rappelsCarte(), postit(), afaireCarte());
  cols.append(aujourdhuiCarte(), pile, droite);
  tout.append(cols);
  tout.append(semaine());

  // La position de défilement de chaque bloc survit au rafraîchissement (toutes les minutes).
  const positions = {};
  racine.querySelectorAll(".ac-carte").forEach(x => { positions[x.className.split(" ").find(k => k.startsWith("ac-") && k !== "ac-carte")] = x.scrollTop; });
  racine.replaceChildren(tout);
  racine.querySelectorAll(".ac-carte").forEach(x => {
    const k = x.className.split(" ").find(k => k.startsWith("ac-") && k !== "ac-carte");
    if (positions[k]) x.scrollTop = positions[k];
    surveillerDebord(x);
  });
  if (C && C.fam && C.fam.nounou && C.fam.nounou.journal) monterNounou(S.nounou);
}

function barre(src) {
  const b = el("header", "ac-barre");
  const maintenantD = new Date();
  const date = maintenantD.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" });
  b.append(el("span", "ac-date", date.charAt(0).toUpperCase() + date.slice(1)), el("span", "ac-heure", maintenant()));

  const pire = !S.serveur ? { niveau: "rouge", texte: "Hors connexion" }
    : src.find(s => s.niveau !== "ok")
      ? (s => ({ niveau: s.niveau, texte: `${NOMS[s.cle]} · ${s.minutes == null ? "jamais lus" : "il y a " + depuis(s.minutes)}` }))(src.find(s => s.niveau === "rouge") || src.find(s => s.niveau !== "ok"))
      : { niveau: "ok", texte: "À jour" };
  const etat = el("span", "ac-etat " + pire.niveau, pire.texte);
  etat.title = src.map(s => `${NOMS[s.cle]} : lus à ${hm(s.lu)}`).join(" · ");
  b.append(etat);

  const boutons = el("div", "ac-boutons");
  // Raccourcis de l'appareil (applications Maison, caméras…) : famille.boutons = [{ libelle, icone, raccourci }].
  // Lancés par l'adresse shortcuts:// (le Raccourci doit exister sur l'appareil qui affiche l'accueil).
  for (const x of (C && C.fam && C.fam.boutons) || []) {
    const b = el("a", "ac-pilule ac-raccourci", `${x.icone ? x.icone + " " : ""}${x.libelle}`);
    b.href = "shortcuts://run-shortcut?name=" + encodeURIComponent(x.raccourci);
    boutons.append(b);
  }
  const rec = el("button", "ac-pilule", "📖 Recettes");
  rec.type = "button"; rec.onclick = () => ouvrirRecette(C, null);
  boutons.append(rec);
  const ms = S.moisSuivant;
  if (ms) {
    const nom = MOIS[Number(ms.cle.slice(5)) - 1];
    // Un envoi n'a de sens qu'après validation (un essai d'envoi sur un brouillon ne compte pas).
    const etatMois = !ms.valideLe ? "à préparer" : ms.envoi ? "envoyé" : "validé";
    const p = el("button", "ac-pilule", `Planning de ${nom}`);
    p.type = "button";
    p.append(el("span", "ac-pastille " + (ms.valideLe ? "ok" : "alerte"), etatMois));
    p.onclick = () => C.ouvrir("planning", ms.cle + "-01");
    boutons.append(p);
  }
  const r = el("button", "ac-pilule ac-icone", "⚙︎");
  r.type = "button"; r.setAttribute("aria-label", "Réglages");
  r.onclick = () => C.ouvrir("reglages");
  boutons.append(r);
  b.append(boutons, el("span", "ac-marque", "LA VISION"));
  return b;
}

function semaine() {
  const c = el("section", "carte ac-carte ac-semaine");
  c.append(el("h2", "ac-titre", "Cette semaine"));
  const s = S.semaine;
  if (!s) { c.append(el("p", "ac-attente", S.serveur ? "Chargement…" : "")); return c; }
  if (s.erreur) { c.append(el("p", "message ko", `Lecture impossible (${s.erreur}).`)); return c; }
  const rang = el("div", "ac-jours");
  for (let i = 0; i < 7; i++) {
    const d = decaler(s.lundi, i), j = s.jours[d];
    const x = el(j ? "button" : "div", "ac-jourc" + (d === s.jour ? " aujourdhui" : "") + (d < s.jour ? " passe" : ""));
    x.append(el("span", "ac-jnom", `${JOURS_COURTS[new Date(d + "T12:00:00Z").getUTCDay()]} ${Number(d.slice(8))}`));
    if (!j) x.append(el("span", "ac-jl attenue", "Week-end"));
    else {
      etiquettes(j.calc, C.fam).forEach(t => x.append(el("span", "ac-jl ac-jetiq", t)));
      lignesCase(j, C.fam, true).forEach(l => x.append(el("span", "ac-jl " + l.cls.split(" ").map(k => "ac-" + k).join(" "), l.txt)));
      x.type = "button";
      x.onclick = () => C.ouvrir("planning", d);
    }
    rang.append(x);
  }
  c.append(rang);
  return c;
}

function postit() {
  const case_ = el("div", "ac-postit-case");   // la case mesure la place ; le post-it y reste carré
  case_.append(postitFamille("ac-postit"));
  return case_;
}

function carte(classe, titre, attente) {
  const c = el("section", "carte ac-carte " + classe);
  c.append(el("h2", "ac-titre" + (classe === "ac-briefing" ? " grand" : ""), titre), el("p", "ac-attente", attente));
  return c;
}

/* ---------- Aujourd'hui ---------- */
const h = x => x ? affiche(x) : "?";
const LIEUX_E2 = [["ecole", "École"], ["alae", "ALAE"], ["nounou", "Nounou"], ["maison", "Avec nous"]];

function aujourdhuiCarte() {
  const c = el("section", "carte ac-carte ac-jour");
  c.append(el("h2", "ac-titre grand", "Aujourd'hui"));
  const s = S.semaine, d = aujourdhui();
  if (!s || s.erreur) { c.append(el("p", "ac-attente", s ? `Lecture impossible (${s.erreur}).` : "")); return c; }
  const j = s.jours[d];
  // Parents
  for (const p of personnes(j && j.calc, C.fam)) {
    const l = el("p", "ac-personne");
    l.append(el("strong", "", p.qui), document.createTextNode(" · " + p.texte));
    c.append(l);
  }
  // Statut de l'enfant scolarisé, modifiable quand la journée dévie
  if (j && j.aff && !j.calc.ferie) c.append(statutE2(d, j));
  // Fil du jour
  const fil = filDuJour(agendaAvecIphone(s.src.agenda[d], d), j, C.fam, d);
  const liste = el("ol", "ac-fil");
  if (!fil.length) liste.append(el("li", "ac-vide", "Rien de prévu."));
  for (const x of fil) {
    const li = el("li", "ac-item" + (x.planning ? " planning" : "") + (x.source ? " abonnement" : ""));
    li.append(el("span", "ac-h", x.heure ? h(x.heure) : "Journée"));
    const corps = el("span", "ac-corps");
    corps.append(el("span", "ac-t", (x.qui && !x.planning ? x.qui + " : " : "") + x.titre));
    if (x.lieu) corps.append(el("span", "ac-lieu", x.lieu));
    if (x.notes) corps.append(el("span", "ac-notes", x.notes));
    li.append(corps);
    liste.append(li);
  }
  c.append(liste);
  return c;
}

function statutE2(d, j) {
  const e2 = C.fam.enfants.e2, aff = j.aff;
  const bloc = el("div", "ac-statut");
  const ligne = el("div", "ac-statut-ligne");
  const t = el("span", "ac-statut-t");
  t.append(el("strong", "ac-e2", e2.prenom), document.createTextNode(" · " + ligneE2(aff, C.fam).replace(e2.prenom + " ", "").replace(e2.prenom + " : ", "")));
  const b = el("button", "ac-mini", S.statutOuvert ? "Fermer" : "Changer");
  b.type = "button"; b.onclick = () => { S.statutOuvert = !S.statutOuvert; rendre(); };
  ligne.append(t, b);
  bloc.append(ligne);
  if (S.statutOuvert) {
    const seg = el("div", "seg");
    for (const [v, lib] of LIEUX_E2) {
      const x = el("button", "seg-btn" + (aff.e2 === v || (v === "alae" && aff.e2 === "centre") ? " actif" : ""), lib);
      x.type = "button"; x.onclick = () => changerE2(d, { e2: v });
      seg.append(x);
    }
    const note = el("input", "note"); note.type = "text"; note.maxLength = 80;
    note.placeholder = "Note (malade, sortie…)"; note.value = aff.note || "";
    note.onchange = () => changerE2(d, { note: note.value.trim() || null });
    bloc.append(seg, note, el("p", "ac-aide", "Corrige le planning du jour : récupération et nounou suivent."));
  }
  return bloc;
}

async function changerE2(d, champs) {
  S.erreurEcriture = null;
  const { doc, setDoc, serverTimestamp, deleteField } = C.F;
  const donnees = { corrige: {} }, chemins = [];
  for (const [k, v] of Object.entries(champs)) { donnees.corrige[k] = v === null ? deleteField() : v; chemins.push("corrige." + k); }
  if (S.semaine && S.semaine.moisValide) { donnees.corrige.apresValidation = true; chemins.push("corrige.apresValidation"); }
  try {
    await setDoc(doc(C.db, "vision", "planning", "jours", d), donnees, { mergeFields: chemins });
    await setDoc(doc(C.db, "vision", "planning"), { majLe: serverTimestamp() }, { merge: true });
    S.semaine = null; S.statutOuvert = false;
    rechargerNounou(d === aujourdhui());
    charger();
  } catch (e) { alerteEcriture(e); }
}
function alerteEcriture(e) { S.erreurEcriture = e.code || e.name; rendre(); }


/* ---------- Ce soir ---------- */
// Repas de midi de l'enfant scolarisé selon son lieu du jour : école → cantine de l'école ;
// ALAE / centre (mercredis, vacances) → accueil de loisirs ; ailleurs, pas de ligne.
function soirCarte() {
  const c = el("section", "carte ac-carte ac-soir");
  const d = aujourdhui(), j = S.semaine && S.semaine.jours && S.semaine.jours[d];
  const lieu = j && j.aff && j.aff.e2;
  const source = lieu === "ecole" ? "ecole" : (lieu === "alae" || lieu === "centre") ? "loisirs" : null;
  let midi = null;
  if (source && S.cantine) {
    const prenom = C.fam.enfants.e2.prenom;
    const plats = pourEnfant((S.cantine[source] || {})[d]);
    midi = el("button", "ac-mini", `🍽 Midi ${prenom}`);
    midi.type = "button";
    midi.onclick = () => {
      const { f, fermer } = fenetre(`Ce midi à la cantine (${prenom})`);
      const l = el("ul", "ac-midi-liste");
      if (!plats.length) l.append(el("li", "ac-vide", "Menu non publié."));
      plats.forEach(p => l.append(el("li", "", p)));
      const pied = el("div", "ac-fenetre-pied");
      const ok = el("button", "bouton", "Fermer"); ok.type = "button"; ok.onclick = fermer;
      pied.append(ok);
      f.append(l, pied);
      f.onsubmit = e => { e.preventDefault(); fermer(); };
    };
  }
  c.append(teteCarte("Ce soir", midi));
  c.append(platsDuSoir());
  return c;
}

// Le plat prévu ce soir (le premier qui reste, dans l'ordre du plan) ; les autres dans une fenêtre.
// Toucher un plat ouvre sa recette (PDF) avec « On l'a fait ce soir ».
function platsDuSoir() {
  const b = el("div", "ac-plats");
  const P = S.plats;
  if (!P) return b;
  if (!P.plats) { b.append(el("p", "ac-attente", "Le plan repas arrivera par le Raccourci de l'iPhone.")); return b; }
  if (P.erreur) { b.append(el("p", "message ko", "Plan repas reçu, mais son tableau est illisible.")); return b; }
  const faits = P.faits || [];
  const reste = P.plats.filter(p => !faits.includes(p.id));
  const { doc, updateDoc, arrayUnion, arrayRemove } = C.F;
  const ref = doc(C.db, "vision", "plats");
  const ouvrir = p => ouvrirRecette(C, p, () => updateDoc(ref, { faits: arrayUnion(p.id) }));
  const bouton = (p, prevu) => {
    const x = el("button", "ac-plat" + (prevu ? " prevu" : ""));
    x.type = "button";
    x.append(el("span", "ac-plat-j", prevu ? `Prévu · ${p.jour}` : p.jour), el("span", "ac-plat-t", p.repas),
      el("span", "ac-plat-d", [p.proteine, p.temps].filter(Boolean).join(" · ")));
    return x;
  };
  // Fenêtre « Autres plats » : les plats restants après celui prévu, et « Rétablir » le dernier fait.
  const fenetreAutres = () => {
    const { f, fermer } = fenetre("Autres plats de la semaine");
    const l = el("div", "ac-plats");
    if (reste.length < 2) l.append(el("p", "ac-attente", "Aucun autre plat cette semaine."));
    reste.slice(1).forEach(p => { const x = bouton(p, false); x.onclick = () => { fermer(); ouvrir(p); }; l.append(x); });
    const pied = el("div", "ac-fenetre-pied");
    if (faits.length) {
      const dernier = P.plats.find(p => p.id === faits[faits.length - 1]);
      const r = el("button", "bouton secondaire", `Rétablir « ${dernier ? dernier.repas : "le dernier"} »`);
      r.type = "button"; r.onclick = () => { fermer(); updateDoc(ref, { faits: arrayRemove(faits[faits.length - 1]) }).catch(alerteEcriture); };
      pied.append(r);
    }
    const ok = el("button", "bouton", "Fermer"); ok.type = "button"; ok.onclick = fermer;
    pied.append(ok);
    f.append(l, pied);
    f.onsubmit = e => { e.preventDefault(); fermer(); };
  };
  const autres = el("button", "ac-lien", reste.length > 1 ? `Autres (${reste.length - 1}) ›` : "Autres ›");
  autres.type = "button";
  autres.onclick = e => { e.stopPropagation(); fenetreAutres(); };
  if (!reste.length) {
    const v = el("div", "ac-plats-bas");
    v.append(el("span", "ac-attente", "Tous les plats sont faits."), autres);
    b.append(v);
    return b;
  }
  // Le plat prévu : toucher la carte ouvre la recette ; « Autres › » ouvre la liste.
  const p = reste[0];
  const x = el("div", "ac-plat prevu");
  x.setAttribute("role", "button"); x.tabIndex = 0;
  const haut = el("div", "ac-plat-haut");
  haut.append(el("span", "ac-plat-j", `Prévu · ${p.jour}`), autres);
  x.append(haut, el("span", "ac-plat-t", p.repas), el("span", "ac-plat-d", [p.proteine, p.temps].filter(Boolean).join(" · ")));
  x.onclick = () => ouvrir(p);
  b.append(x);
  return b;
}

/* ---------- Rappels (Raccourci iOS) ---------- */
const JOURS_ABR = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const MOIS_ABR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
// « sam. 28 » dans le mois en cours, « sam. 5 déc. » au-delà.
const dateCourte = d => `${JOURS_ABR[new Date(d + "T12:00:00Z").getUTCDay()]} ${Number(d.slice(8))}${d.slice(0, 7) !== aujourdhui().slice(0, 7) ? " " + MOIS_ABR[Number(d.slice(5, 7)) - 1] : ""}`;

// Événements du calendrier de l'iPhone ajoutés au calendrier commun (sans doublon).
function agendaAvecIphone(agendaJour, d) {
  const r = S.raccourci;
  if (!r || r.erreur) return agendaJour;
  const base = agendaJour || {}, deja = new Set((base.C || []).map(e => e.titre + e.debut.slice(0, 16)));
  const ajout = evenementsDuJour(r.evenements, d).filter(e => !deja.has(e.titre + e.debut));
  return ajout.length ? { ...base, C: [...(base.C || []), ...ajout] } : agendaJour;
}

function etatRappels(c) {
  const r = S.raccourci;
  if (!r) { c.append(el("p", "ac-attente", S.serveur ? "Chargement…" : "")); return null; }
  if (r.erreur === "vide") { c.append(el("p", "ac-attente", "En attente du premier passage du Raccourci de l'iPhone.")); return null; }
  if (r.erreur) { c.append(el("p", "message ko", "Données du Raccourci illisibles.")); return null; }
  const liste = appliquerActions(r.rappels, S.actions || []).filter(x => !S.envoyes.has(cleRappel(x)));
  return repartir(liste, aujourdhui(), C.fam && C.fam.rappels && C.fam.rappels.recurrents);
}

// Cocher : le rappel se raye et reste 3 s (un second toucher ou « Annuler » le rétablit),
// puis la ligne se replie et l'action part pour le Raccourci.
const DELAI_COCHE = 3000;
S.coches = new Map(); S.envoyes = new Set();
function basculer(x) {
  const k = cleRappel(x);
  if (S.coches.has(k)) { clearTimeout(S.coches.get(k).minuteur); S.coches.delete(k); rendre(); return; }
  const minuteur = setTimeout(() => valider(k), DELAI_COCHE);
  S.coches.set(k, { x, minuteur, le: Date.now() });
  rendre();
}
function valider(k) {
  const c = S.coches.get(k);
  if (!c) return;
  racine.querySelectorAll(".ac-rp").forEach(li => { if (li.dataset.cle === k) li.classList.add("replie"); });
  setTimeout(async () => {
    S.coches.delete(k); S.envoyes.add(k); rendre();
    const { x } = c, { addDoc, deleteDoc, doc, collection, serverTimestamp } = C.F;
    try {
      // Rappel créé dans l'app et pas encore transmis : on retire simplement sa création.
      if (x.action) await deleteDoc(doc(C.db, "vision", "raccourci", "actions", x.action));
      else await envoyerAction({ type: "cocher", t: x.titre, l: x.liste || "" });
    } catch (e) { S.envoyes.delete(k); alerteEcriture(e); }
    setTimeout(() => { S.envoyes.delete(k); }, 15000);   // le temps que la lecture des actions le masque
  }, 320);
}
function annulerDernier() {
  const dernier = [...S.coches.entries()].sort((a, b) => b[1].le - a[1].le)[0];
  if (dernier) { clearTimeout(dernier[1].minuteur); S.coches.delete(dernier[0]); rendre(); }
}

function ligneRappel(x, avecDate) {
  const k = cleRappel(x), coche = S.coches.has(k);
  const li = el("li", "ac-rp" + (x.retard ? " retard" : "") + (coche ? " coche" : ""));
  li.dataset.cle = k;
  li.append(el("span", "ac-rp-case", coche ? "✓" : ""));
  const p = picto(x.liste);
  li.append(el("span", "ac-rp-picto", p || "•"));
  const corps = el("span", "ac-corps");
  const t = el("span", "ac-t");
  t.append(el("span", "ac-tx", x.titre));   // le trait suit le texte, pas la colonne
  corps.append(t);
  if (x.notes) corps.append(el("span", "ac-rp-notes", x.notes));
  li.append(corps);
  const quand = x.retard ? `depuis ${dateCourte(x.jour)}` : avecDate && x.jour ? dateCourte(x.jour) + (x.heure ? " " + h(x.heure) : "") : x.heure ? h(x.heure) : "";
  li.append(el("span", "ac-rp-quand", quand));
  li.title = x.liste;
  li.setAttribute("role", "checkbox"); li.setAttribute("aria-checked", coche ? "true" : "false");
  li.onclick = () => basculer(x);
  return li;
}

// « Annuler » dans l'en-tête du bloc tant qu'un de ses rappels vient d'être coché.
function boutonAnnuler(liste) {
  if (![...S.coches.values()].some(v => liste.some(x => cleRappel(x) === cleRappel(v.x)))) return null;
  const b = el("button", "ac-annuler", "Annuler");
  b.type = "button"; b.onclick = annulerDernier;
  return b;
}

function teteCarte(titre, ...boutons) {
  const t = el("div", "ac-rp-tete");
  t.append(el("h2", "ac-titre", titre));
  const g = el("div", "ac-rp-boutons");
  boutons.filter(Boolean).forEach(b => g.append(b));
  t.append(g);
  return t;
}

// Champs texte toujours présents (vides au besoin) : le Raccourci lit fields.<champ>.stringValue.
const CHAMPS_ACTION = ["type", "t", "l", "e"];
const envoyerAction = donnees => C.F.addDoc(C.F.collection(C.db, "vision", "raccourci", "actions"),
  { type: "", t: "", l: "", e: "", ...donnees, le: C.F.serverTimestamp() });

function rappelsCarte() {
  const c = el("section", "carte ac-carte ac-rappels");
  const b = el("button", "ac-mini", "🛒 Courses");
  b.type = "button"; b.onclick = fenetreCourses;
  const tete = teteCarte("Rappels du jour", b);
  c.append(tete);
  const r = etatRappels(c);
  if (!r) return c;
  const a = boutonAnnuler(r.jour);
  if (a) tete.lastChild.prepend(a);
  const l = el("ul", "ac-rp-liste");
  if (!r.jour.length) l.append(el("li", "ac-vide", "Rien pour aujourd'hui."));
  r.jour.forEach(x => l.append(ligneRappel(x, false)));
  c.append(l);
  return c;
}

function afaireCarte() {
  const c = el("section", "carte ac-carte ac-afaire");
  const listes = (C.fam && C.fam.rappels && C.fam.rappels.ajout) || [];
  let b = null;
  if (listes.length) {
    b = el("button", "ac-mini", "+ Ajouter");
    b.type = "button"; b.onclick = () => fenetreAjout(listes);
  }
  const tete = teteCarte("À faire, plus tard", b);
  c.append(tete);
  const r = etatRappels(c);
  if (!r) return c;
  const a = boutonAnnuler(r.plusTard);
  if (a) tete.lastChild.prepend(a);
  const l = el("ul", "ac-rp-liste ac-rp-colonnes");
  if (!r.plusTard.length) l.append(el("li", "ac-vide", "Rien en attente."));
  r.plusTard.forEach(x => l.append(ligneRappel(x, true)));
  c.append(l);
  return c;
}

/* Fenêtres d'ajout : au centre de l'écran, au-dessus de l'accueil (hors des blocs, que le
   rafraîchissement de l'accueil ne touche pas). Fermeture : bouton, fond ou touche Échap. */
function fenetre(titre) {
  const fond = el("div", "ac-fenetre-fond");
  const f = el("form", "ac-fenetre");
  f.setAttribute("role", "dialog"); f.setAttribute("aria-modal", "true"); f.setAttribute("aria-label", titre);
  f.append(el("h2", "ac-fenetre-titre", titre));
  const fermer = () => { fond.remove(); document.removeEventListener("keydown", echap); };
  const echap = e => { if (e.key === "Escape") fermer(); };
  fond.onclick = e => { if (e.target === fond) fermer(); };
  document.addEventListener("keydown", echap);
  fond.append(f);
  document.body.append(fond);
  return { f, fermer };
}

// Courses : la fenêtre reste ouverte pour enchaîner les articles.
function fenetreCourses() {
  const { f, fermer } = fenetre("Ajouter aux courses");
  const t = el("input", "note ac-fenetre-champ"); t.type = "text"; t.placeholder = "Article"; t.maxLength = 80;
  t.enterKeyHint = "send"; t.autocapitalize = "sentences";
  const msg = el("p", "ac-aide", "Ajouté dans Rappels au prochain passage du Raccourci.");
  const pied = el("div", "ac-fenetre-pied");
  const fin = el("button", "bouton secondaire", "Terminé"); fin.type = "button"; fin.onclick = fermer;
  const ok = el("button", "bouton", "Ajouter"); ok.type = "submit";
  pied.append(fin, ok);
  f.append(t, msg, pied);
  f.onsubmit = async e => {
    e.preventDefault();
    const v = t.value.trim();
    if (!v) return;
    ok.disabled = true;
    try { await envoyerAction({ type: "courses", t: v }); t.value = ""; msg.textContent = `« ${v} » ajouté.`; }
    catch (er) { msg.textContent = `Non enregistré (${er.code || er.name}).`; }
    ok.disabled = false; t.focus();
  };
  t.focus();
}

function fenetreAjout(listes) {
  const { f, fermer } = fenetre("Nouveau rappel");
  if (!listes.includes(S.ajoutListe)) S.ajoutListe = listes[0];
  const t = el("input", "note ac-fenetre-champ"); t.type = "text"; t.placeholder = "Titre du rappel"; t.maxLength = 120; t.autocapitalize = "sentences";
  const seg = el("div", "seg");
  for (const nom of listes) {
    const x = el("button", "seg-btn" + (nom === S.ajoutListe ? " actif" : ""), nom);
    x.type = "button";
    x.onclick = () => { S.ajoutListe = nom; seg.querySelectorAll(".seg-btn").forEach(y => y.classList.toggle("actif", y === x)); };
    seg.append(x);
  }
  const lib = el("label", "ac-fenetre-date");
  const d = el("input", "note"); d.type = "date"; d.min = aujourdhui();
  lib.append(document.createTextNode("Échéance (facultative)"), d);
  const msg = el("p", "ac-aide", "Créé dans Rappels au prochain passage du Raccourci.");
  const pied = el("div", "ac-fenetre-pied");
  const non = el("button", "bouton secondaire", "Annuler"); non.type = "button"; non.onclick = fermer;
  const ok = el("button", "bouton", "Ajouter"); ok.type = "submit";
  pied.append(non, ok);
  f.append(t, seg, lib, msg, pied);
  f.onsubmit = async e => {
    e.preventDefault();
    const v = t.value.trim();
    if (!v) { t.focus(); return; }
    ok.disabled = true;
    try { await envoyerAction({ type: "creer", t: v, l: S.ajoutListe, e: d.value || "" }); fermer(); rendre(); }
    catch (er) { ok.disabled = false; msg.textContent = `Non enregistré (${er.code || er.name}).`; }
  };
  t.focus();
}

/* ---------- Météo (Open-Meteo, lue directement par l'app) ---------- */
const meteoConfiguree = () => !!(C && C.fam && C.fam.meteo && C.fam.meteo.lat != null && C.fam.meteo.lon != null);
async function lireMeteo() {
  if (!meteoConfiguree()) return;
  if (!S.meteo) {   // dernière prévision gardée sur l'appareil, en attendant la nouvelle
    try { const m = JSON.parse(localStorage.getItem("vision-meteo") || "null"); if (m && m.data) S.meteo = m; } catch (e) { /* sans stockage */ }
  }
  try {
    const r = await fetch(urlMeteo(C.fam.meteo.lat, C.fam.meteo.lon), { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    S.meteo = { data: await r.json(), lu: new Date().toISOString(), erreur: null };
    try { localStorage.setItem("vision-meteo", JSON.stringify(S.meteo)); } catch (e) { /* sans stockage */ }
  } catch (e) { S.meteo = { ...(S.meteo || {}), erreur: e.message || e.name }; }
  rendreSiVisible();
}

function meteoCarte() {
  const c = el("section", "carte ac-carte ac-meteo");
  c.append(el("h2", "ac-titre grand", "Météo"));
  if (!meteoConfiguree()) { c.append(el("p", "ac-attente", "Coordonnées à ajouter dans la configuration (famille.meteo).")); return c; }
  const m = S.meteo;
  if (!m || !m.data) { c.append(el("p", "ac-attente", m && m.erreur ? `Prévisions indisponibles (${m.erreur}).` : "Chargement…")); return c; }
  const d = m.data, cur = d.current || {};
  const jour = aujourdhui(), demain = decaler(jour, 1);
  const desc = decrire(cur.weather_code);
  const haut = el("div", "ac-mt-haut");
  haut.append(el("span", "ac-mt-icone", desc.icone), el("span", "ac-mt-temp", `${Math.round(cur.temperature_2m)}°`));
  const det = el("div", "ac-mt-det");
  det.append(el("span", "", desc.texte), el("span", "ac-mt-ress", `ressenti ${Math.round(cur.apparent_temperature)}°`));
  haut.append(det);
  c.append(haut);
  const seuils = { ...SEUILS_METEO, ...(C.fam.meteo.seuils || {}) };
  const x = creneauxMeteo(d, jour, demain, maintenant(), seuils);
  // Le conseil d'abord (le plus utile), puis les créneaux sur une ligne chacun.
  if (x.conseil) c.append(el("p", "ac-mt-conseil", x.conseil));
  const liste = el("div", "ac-mt-cren");
  for (const k of x.creneaux) {
    const l = el("p", "ac-mt-l");
    l.title = `${decrire(k.code).texte}, ressenti ${k.ressenti}°`;
    l.append(el("strong", "", k.libelle), document.createTextNode(` ${decrire(k.code).icone} ${k.temp}° · ress. ${k.ressenti}°${k.pluie >= 30 ? ` · ☔ ${k.pluie} %` : ""}`));
    liste.append(l);
  }
  c.append(liste);
  if (m.erreur) c.append(el("p", "ac-aide", `Dernière mise à jour à ${hm(new Date(m.lu))}.`));
  return c;
}

/* ---------- Compte à rebours ---------- */
const JOURS_LONGS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const dateLongue = d => `${JOURS_LONGS[new Date(d + "T12:00:00Z").getUTCDay()]} ${Number(d.slice(8))} ${MOIS[Number(d.slice(5, 7)) - 1]}`;

function candidats() {
  const j = aujourdhui(), r = S.rebours || {}, cal = r.calcules || {}, res = [];
  (cal.posees || []).forEach((x, i) => res.push({ cle: "p:" + x.date, titre: x.titre, date: x.date, type: "posees", premiere: i === 0 }));
  (cal.scolaires || []).forEach(x => res.push({ cle: "s:" + x.date, titre: x.titre, date: x.date, type: "scolaires" }));
  res.push({ cle: "noel", titre: "Noël", date: prochaineAnnuelle("12-25", j), type: "fixe" });
  const ip = S.raccourci && !S.raccourci.erreur ? S.raccourci.anniversaires : [];
  ip.forEach(a => res.push({ cle: "a:" + a.titre, titre: libelleAnniversaire(a.titre), date: a.date, type: "anniversaire" }));
  (r.manuels || []).forEach(m => res.push({ cle: "m:" + m.id, titre: m.titre, date: m.annuel ? prochaineAnnuelle(m.date.slice(5), j) : m.date, type: "manuel", id: m.id, annuel: !!m.annuel }));
  return res.filter(x => x.date >= j).sort((a, b) => a.date.localeCompare(b.date));
}

function reboursCarte() {
  const c = el("section", "carte ac-carte ac-rebours");
  const tete = el("div", "ac-rb-tete");
  tete.append(el("h2", "ac-titre", "Compte à rebours"));
  const choisir = el("button", "ac-mini", S.reboursOuvert ? "Fermer" : "Choisir");
  choisir.type = "button"; choisir.onclick = () => { S.reboursOuvert = !S.reboursOuvert; rendre(); };
  tete.append(choisir);
  c.append(tete);
  if (!S.rebours) { c.append(el("p", "ac-attente", "Chargement…")); return c; }
  const liste = candidats(), j = aujourdhui();
  if (S.reboursOuvert) { c.append(reboursChoix(liste)); return c; }
  const auto = liste.find(x => x.premiere) || liste[0];
  const choix = (S.rebours.choix && liste.find(x => x.cle === S.rebours.choix)) || auto;
  if (!choix) { c.append(el("p", "ac-attente", "Rien à venir.")); return c; }
  const n = joursAvant(choix.date, j);
  const grand = el("p", "ac-rb-grand");
  grand.append(el("span", "ac-rb-n", n === 0 ? "C'est" : String(n)), el("span", "ac-rb-u", n === 0 ? "aujourd'hui" : n === 1 ? "jour" : "jours"));
  c.append(grand);
  const libelle = choix === auto && choix.type === "posees" && !S.rebours.choix ? "avant nos prochaines vacances" : choix.titre;
  c.append(el("p", "ac-rb-lib", libelle));
  c.append(el("p", "ac-rb-date", dateLongue(choix.date)));
  const autres = el("div", "ac-rb-autres");
  for (const x of liste.filter(x => x !== choix).slice(0, 2)) {
    const l = el("p", "ac-rb-autre");
    l.append(el("span", "", x.titre), el("span", "", `${joursAvant(x.date, j)} j`));
    autres.append(l);
  }
  c.append(autres);
  return c;
}

function reboursChoix(liste) {
  const bloc = el("div", "ac-rb-choix");
  const j = aujourdhui();
  const enregistrer = champs => C.F.setDoc(C.F.doc(C.db, "vision", "rebours"), champs, { mergeFields: Object.keys(champs) })
    .catch(e => alerteEcriture(e));
  const auto = el("button", "ac-rb-option" + (!S.rebours.choix ? " actif" : ""), "Prochaines vacances posées (automatique)");
  auto.type = "button"; auto.onclick = () => { S.reboursOuvert = false; enregistrer({ choix: null }); };
  bloc.append(auto);
  for (const x of liste) {
    const l = el("div", "ac-rb-ligne");
    const b = el("button", "ac-rb-option" + (S.rebours.choix === x.cle ? " actif" : ""), `${x.titre} · ${joursAvant(x.date, j)} j`);
    b.type = "button"; b.onclick = () => { S.reboursOuvert = false; enregistrer({ choix: x.cle }); };
    l.append(b);
    if (x.type === "manuel") {
      const sup = el("button", "nn-retirer", "✕");
      sup.type = "button"; sup.setAttribute("aria-label", "Supprimer " + x.titre);
      sup.onclick = () => enregistrer({ manuels: (S.rebours.manuels || []).filter(m => m.id !== x.id) });
      l.append(sup);
    }
    bloc.append(l);
  }
  // Ajout à la main (voyage, anniversaire…)
  const f = el("div", "ac-rb-ajout");
  const t = el("input", "note"); t.placeholder = "Événement (ex. Guadeloupe)"; t.maxLength = 40;
  const d = el("input", "note"); d.type = "date"; d.min = j;
  const an = el("label", "ac-rb-an"); const cb = el("input"); cb.type = "checkbox"; an.append(cb, document.createTextNode(" chaque année"));
  const ok = el("button", "bouton petit-bouton", "Ajouter");
  ok.type = "button";
  ok.onclick = () => {
    if (!t.value.trim() || !d.value) return;
    const m = { id: Date.now().toString(36), titre: t.value.trim(), date: d.value, annuel: cb.checked };
    enregistrer({ manuels: [...(S.rebours.manuels || []), m] });
  };
  f.append(t, d, an, ok);
  bloc.append(f);
  return bloc;
}
