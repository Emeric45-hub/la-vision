// Accueil (iPad en paysage) : briefing, météo et compte à rebours en haut ; quatre colonnes
// (Aujourd'hui, Nounou + Ce soir, Rappels du jour, À faire) ; bande « Cette semaine » en bas.
// Étape 1 du lot 2 : la mise en page, l'écran maintenu allumé et la fraîcheur des sources.
// Les cartes se remplissent aux étapes suivantes.
import { el, maintenant } from "./outils.js";
import { niveau, depuis } from "./fraicheur.js";

let C = null, racine = null;
const S = { etat: null, serveur: false, verrou: null, minuteur: null, stop: null };

const NOMS = { agendas: "Agendas" };

export function initAccueil(ctx) {
  C = ctx;
  racine = document.getElementById("vue-accueil");
  if (!S.stop && C.db) {
    const { onSnapshot, doc } = C.F;
    S.stop = onSnapshot(doc(C.db, "vision", "etat"), { includeMetadataChanges: true }, snap => {
      S.etat = snap.exists() ? snap.data() : null;
      S.serveur = !snap.metadata.fromCache;
      rendreSiVisible();
    }, () => { S.serveur = false; rendreSiVisible(); });
  }
  if (!S.minuteur) S.minuteur = setInterval(rendreSiVisible, 60000);
  document.addEventListener("visibilitychange", gererVerrou);
}

const visible = () => racine && !racine.hidden;
const rendreSiVisible = () => { if (visible()) rendre(); };

export function afficherAccueil() {
  if (!racine) return;
  gererVerrou();
  rendre();
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

/* ---------- Fraîcheur des sources ---------- */
const enDate = ts => ts && ts.toDate ? ts.toDate() : ts ? new Date(ts) : null;
function sources() {
  const res = [];
  const ag = S.etat && S.etat.agendas;
  res.push({ cle: "agendas", ...niveau("agendas", enDate(ag && ag.lu), new Date(), maintenant()), erreur: ag && ag.erreur });
  return res;
}

function rendre() {
  const tout = el("div", "ac");
  const src = S.serveur ? sources() : [];
  const rouges = src.filter(s => s.niveau === "rouge");
  if (!S.serveur) tout.append(el("p", "ac-bandeau", "Base de données injoignable : l'accueil n'affiche rien plutôt qu'un faux vide."));
  for (const s of rouges) {
    tout.append(el("p", "ac-bandeau", `${NOMS[s.cle]} non mis à jour depuis ${depuis(s.minutes)} : ce qui suit peut être ancien.`));
  }

  const haut = el("div", "ac-haut");
  haut.append(carte("ac-briefing", "Briefing", "Arrive avec le lot 3."),
    carte("ac-meteo", "Météo", "Étape 4."),
    carte("ac-rebours", "Compte à rebours", "Étape 5."));
  tout.append(haut);

  const cols = el("div", "ac-colonnes");
  const milieu = el("div", "ac-pile");
  milieu.append(carte("ac-nounou", "Nounou", "Étape 2."), carte("ac-soir", "Ce soir", "Étape 7."));
  cols.append(carte("ac-jour", "Aujourd'hui", "Étape 3."), milieu,
    carte("ac-rappels", "Rappels du jour", "Étape 6."), carte("ac-afaire", "À faire", "Étape 6."));
  tout.append(cols);

  tout.append(carte("ac-semaine", "Cette semaine", "Étape 2."));

  const pied = el("div", "ac-sources");
  for (const s of src) {
    const p = el("span", "ac-source " + s.niveau, `${NOMS[s.cle]} · ${s.minutes == null ? "jamais lus" : "il y a " + depuis(s.minutes)}`);
    p.title = s.erreur ? "Dernier échec : " + (s.erreur.message || "") : "";
    pied.append(p);
  }
  if (!S.serveur) pied.append(el("span", "ac-source rouge", "Hors connexion"));
  tout.append(pied);
  racine.replaceChildren(tout);
}

function carte(classe, titre, attente) {
  const c = el("section", "carte ac-carte " + classe);
  c.append(el("h2", "ac-titre", titre), el("p", "ac-attente", attente));
  return c;
}
