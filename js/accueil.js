// Accueil (iPad en paysage). Barre du haut : date, heure, état des sources, accès au planning,
// réglages. Puis briefing, météo et compte à rebours ; quatre colonnes (Aujourd'hui ; Nounou +
// Ce soir ; Rappels du jour + post-it, avec « À faire, plus tard » dessous) ; bande « Cette semaine ».
import { el, maintenant, aujourdhui, decaler, lirePlage, jourAffiche } from "./outils.js";
import { niveau, depuis } from "./fraicheur.js";
import { etiquettes, lignesCase } from "./texte-jour.js";
import { monterNounou } from "./nounou.js";
import { lundiDe } from "./nounou-calcul.js";

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
      const [agenda, sem, plan, mois] = await Promise.all([
        lirePlage(C, ["vision", "agenda", "jours"], decaler(lundi, -1), dimanche),
        lirePlage(C, ["vision", "semainier", "jours"], lundi, dimanche),
        lirePlage(C, ["vision", "planning", "jours"], lundi, dimanche),
        getDocFromServer(doc(C.db, "vision", "planning", "mois", suivant))
      ]);
      const src = { agenda, sem, plan }, jours = {};
      for (let i = 0; i < 7; i++) { const d = decaler(lundi, i); if (i < 5) jours[d] = jourAffiche(d, src, C.fam); else jours[d] = null; }
      S.semaine = { jour, lundi, jours, erreur: null };
      S.moisSuivant = { cle: suivant, ...(mois.exists() ? mois.data() : {}) };
    } catch (e) {
      S.semaine = { jour, lundi, jours: {}, erreur: e.code || e.name };
    } finally { S.chargement = null; rendreSiVisible(); }
  })();
}

/* ---------- Fraîcheur des sources ---------- */
const NOMS = { agendas: "Agendas" };
const enDate = ts => ts && ts.toDate ? ts.toDate() : ts ? new Date(ts) : null;
function sources() {
  const ag = S.etat && S.etat.agendas;
  return [{ cle: "agendas", ...niveau("agendas", enDate(ag && ag.lu), new Date(), maintenant()), lu: enDate(ag && ag.lu) }];
}
const hm = d => d ? d.toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }) : "?";

/* ---------- Rendu ---------- */
function rendre() {
  if (!racine) return;
  const tout = el("div", "ac");
  const src = S.serveur ? sources() : [];
  tout.append(barre(src));

  if (!S.serveur) tout.append(el("p", "ac-bandeau", "Base de données injoignable : l'accueil n'affiche rien plutôt qu'un faux vide."));
  for (const s of src.filter(x => x.niveau === "rouge")) {
    tout.append(el("p", "ac-bandeau", s.minutes == null
      ? "La tâche planifiée n'a jamais lu les agendas."
      : `La tâche planifiée n'a pas lu les agendas depuis ${depuis(s.minutes)} (dernier passage à ${hm(s.lu)}) : vérifier cron-job.org.`));
  }

  const haut = el("div", "ac-haut");
  haut.append(carte("ac-briefing", "Briefing", "Arrive avec le lot 3."),
    carte("ac-meteo", "Météo", "Étape 4."),
    carte("ac-rebours", "Compte à rebours", "Étape 5."));
  tout.append(haut);

  const cols = el("div", "ac-colonnes");
  const pile = el("div", "ac-pile");
  if (!S.nounou) S.nounou = el("div", "ac-nounou");
  pile.append(S.nounou, carte("ac-soir", "Ce soir", "Étape 7."));
  const droite = el("div", "ac-droite");
  droite.append(carte("ac-rappels", "Rappels du jour", "Étape 6."),
    postit(),
    carte("ac-afaire", "À faire, plus tard", "Étape 6."));
  cols.append(carte("ac-jour", "Aujourd'hui", "Étape 3."), pile, droite);
  tout.append(cols);
  tout.append(semaine());

  racine.replaceChildren(tout);
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
      lignesCase(j, C.fam).forEach(l => x.append(el("span", "ac-jl " + l.cls.split(" ").map(k => "ac-" + k).join(" "), l.txt)));
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
  const p = el("section", "ac-postit");
  p.append(el("span", "ac-scotch"), el("p", "ac-postit-attente", "Post-it : après l'étape 6."));
  case_.append(p);
  return case_;
}

function carte(classe, titre, attente) {
  const c = el("section", "carte ac-carte " + classe);
  c.append(el("h2", "ac-titre", titre), el("p", "ac-attente", attente));
  return c;
}
