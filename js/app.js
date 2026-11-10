// La Vision — coquille de l'app : connexion, onglets, configuration, import du semainier.
// Firebase est chargé à part : si son chargement échoue, la page reste utilisable et le dit.
import { boutonsRaccourcis, boutonIcone, ICONES } from "./outils.js";
import { lireClasseur } from "./semainier.js";
import { initPlanning, afficherPlanning } from "./planning.js";
import { initNounou, afficherNounou } from "./nounou.js";
import { initVersion } from "./version.js";
import { initAccueil, afficherAccueil } from "./accueil.js";
import { initPostit, afficherPostit } from "./postit.js";
import { ouvrirRecette } from "./recette.js";
import { appliquerReglages, formulaireEcran } from "./fond.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
const FIREBASE = {
  apiKey: "AIzaSyC7sZDCVP-r34T33L6nEwWzibsrXnxletA",
  authDomain: "diversif-bebe.firebaseapp.com",
  projectId: "diversif-bebe"
};

const $ = id => document.getElementById(id);
const etat = { config: null, F: null, db: null, auth: null };

/* ---------- Onglets ---------- */
// Grand écran : même barre que l'accueil sur tous les écrans (les onglets restent sur téléphone).
const NOMS_VUES = { planning: "Planning", nounou: "Nounou", reglages: "Réglages" };
function barreEcran(vue) {
  const b = $("barre-ecran");
  b.hidden = vue === "accueil";
  if (b.hidden) return;
  const mk = (tag, cls, txt) => { const e = document.createElement(tag); e.className = cls; if (txt) e.textContent = txt; return e; };
  const retour = mk("button", "ac-pilule", "‹ Accueil");
  retour.type = "button"; retour.onclick = () => ouvrir("accueil");
  const titre = mk("span", "ac-date", NOMS_VUES[vue] || "");
  const etatSync = mk("span", "be-etat", $("etat-sync").textContent);
  // Mêmes icônes que l'accueil : Raccourcis de l'appareil et réglages (sauf sur l'écran Réglages).
  const nav = mk("div", "ac-boutons");
  nav.append(...boutonsRaccourcis(etat.config && etat.config.famille));
  if (vue !== "reglages") nav.append(boutonIcone(ICONES.roue, "Réglages", () => ouvrir("reglages")));
  b.replaceChildren(retour, titre, etatSync, nav, (m => { m.setAttribute("aria-label", "La Vision"); return m; })(mk("span", "ac-marque", "LΛ VISION")));
}

// Date du jour sous « LA VISION » (téléphone), mise à jour chaque minute.
function dateDuJour() {
  const d = new Date().toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" });
  $("tel-date").textContent = d.charAt(0).toUpperCase() + d.slice(1);
}
dateDuJour(); setInterval(dateDuJour, 60000);

appliquerReglages();
let vueActuelle = null;
function ouvrir(vue, jour) {
  vueActuelle = vue;
  barreEcran(vue);
  document.querySelectorAll(".onglet").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.vue === vue)));
  document.querySelectorAll(".vue").forEach(v => { v.hidden = v.id !== "vue-" + vue; });
  document.body.classList.toggle("large", vue === "planning" || vue === "accueil");
  document.body.classList.toggle("sur-accueil", vue === "accueil");
  if (!etat.db) return;
  if (vue === "planning") afficherPlanning(jour);
  if (vue === "nounou") afficherNounou();
  if (vue === "accueil") afficherAccueil();
  if (vue === "postit") afficherPostit();
  if (vue === "reglages") formulaireEcran($("reglages-ecran"));
}
document.querySelectorAll(".onglet").forEach(b => b.addEventListener("click", () => ouvrir(b.dataset.vue)));
// Onglet de départ : l'accueil, sur tous les appareils.
ouvrir("accueil");

function sync(texte, classe) {
  const el = $("etat-sync");
  el.textContent = texte;
  el.className = "etat-sync" + (classe ? " " + classe : "");
}
function message(id, texte, ok) {
  const el = $(id);
  el.textContent = texte || "";
  el.className = "message" + (texte ? (ok ? " ok" : " ko") : "");
}
const dateFr = iso => new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
// Sérialisation à clés triées : Firestore ne garantit pas l'ordre des champs.
const canon = v => Array.isArray(v) ? "[" + v.map(canon).join(",") + "]"
  : (v && typeof v === "object") ? "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}"
  : JSON.stringify(v);
const quand = ts => ts && ts.toDate ? ts.toDate().toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }) : "?";

/* ---------- Démarrage Firebase ---------- */
async function demarrer() {
  try {
    const [app, fs, au] = await Promise.all([
      import(SDK + "firebase-app.js"), import(SDK + "firebase-firestore.js"), import(SDK + "firebase-auth.js")
    ]);
    const fb = app.initializeApp(FIREBASE);
    etat.F = { ...fs, ...au };
    etat.db = fs.getFirestore(fb);
    etat.auth = au.getAuth(fb);
  } catch (e) {
    sync("Firebase injoignable : vérifie la connexion réseau.", "ko");
    return;
  }
  const { onAuthStateChanged } = etat.F;
  onAuthStateChanged(etat.auth, user => {
    $("connexion").hidden = !!user;
    if (!user) { sync("Non connecté"); return; }
    $("compte-etat").textContent = "Connecté : " + (user.email || "compte famille");
    chargerTout();
  });
}

/* ---------- Connexion ---------- */
const MESSAGES = {
  "auth/invalid-credential": "E-mail ou mot de passe incorrect.",
  "auth/wrong-password": "E-mail ou mot de passe incorrect.",
  "auth/user-not-found": "E-mail ou mot de passe incorrect.",
  "auth/invalid-email": "Adresse e-mail invalide.",
  "auth/too-many-requests": "Trop d'essais. Réessaie dans quelques minutes.",
  "auth/network-request-failed": "Pas de connexion réseau."
};
$("cx-form").addEventListener("submit", async e => {
  e.preventDefault();
  if (!etat.auth) return message("cx-erreur", "Firebase n'est pas chargé.", false);
  $("cx-ok").disabled = true; message("cx-erreur", "");
  try {
    await etat.F.signInWithEmailAndPassword(etat.auth, $("cx-email").value.trim(), $("cx-mdp").value);
    $("cx-mdp").value = "";
  } catch (err) {
    message("cx-erreur", MESSAGES[err.code] || "Connexion impossible (" + (err.code || "erreur") + ").", false);
  } finally {
    $("cx-ok").disabled = false;
  }
});
$("deconnexion").addEventListener("click", () => etat.auth && etat.F.signOut(etat.auth));

/* ---------- Chargement ---------- */
async function chargerTout() {
  sync("Lecture…");
  const { doc, getDocFromServer } = etat.F;
  try {
    // Lecture forcée depuis le serveur : un cache vide ne doit jamais passer pour « rien ».
    const [cfg, et] = await Promise.all([
      getDocFromServer(doc(etat.db, "vision", "config")),
      getDocFromServer(doc(etat.db, "vision", "etat"))
    ]);
    etat.config = cfg.exists() ? cfg.data() : null;
    afficherConfig();
    afficherSemainier(et.exists() ? et.data().semainier : null);
    afficherSauvegarde(et.exists() ? et.data().sauvegarde : null);
    initPlanning({ F: etat.F, db: etat.db, fam: etat.config && etat.config.famille });
    if (!$("vue-planning").hidden) afficherPlanning();
    const ctx = { F: etat.F, db: etat.db, fam: etat.config && etat.config.famille };
    initNounou(ctx);
    if (!$("vue-nounou").hidden) afficherNounou();
    initPostit(ctx);
    if (!$("vue-postit").hidden) afficherPostit();
    initAccueil({ ...ctx, ouvrir });
    if (!$("vue-accueil").hidden) afficherAccueil();
    barreEcran(vueActuelle);   // icônes des Raccourcis, lues dans la configuration
    // Téléphone : icônes Maison, Caméras (Raccourcis de l'appareil) et Recettes dans l'en-tête.
    $("tel-icones").replaceChildren(...boutonsRaccourcis(etat.config && etat.config.famille),
      boutonIcone(ICONES.menu, "Recettes", () => ouvrirRecette(ctx, null)));
    sync("À jour · " + new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }), "ok");
  } catch (e) {
    sync("Serveur injoignable (" + (e.code || e.name) + ") : rien n'est affiché plutôt qu'un faux vide.", "ko");
  }
}

/* ---------- Configuration ---------- */
function afficherConfig() {
  const c = etat.config;
  $("cfg-etat").textContent = c
    ? "Enregistrée" + (c.majLe ? " le " + quand(c.majLe) : "") + "."
    : "Absente : colle le texte de configuration dans « Modifier », puis enregistre.";
  const { majLe, ...sansDate } = c || {};
  $("cfg-texte").value = c ? JSON.stringify(sansDate, null, 2) : "";
}
$("cfg-enregistrer").addEventListener("click", async () => {
  let obj;
  try { obj = JSON.parse($("cfg-texte").value); }
  catch (e) { return message("cfg-message", "Texte invalide : " + e.message, false); }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return message("cfg-message", "Le texte doit être un objet JSON { … }.", false);
  const { doc, setDoc, serverTimestamp } = etat.F;
  try {
    // L'ancienne version est gardée (les 5 dernières) : un mauvais collage se rattrape.
    let garde = true;
    try { await garderAncienne(obj); } catch (e) { garde = false; }
    await setDoc(doc(etat.db, "vision", "config"), { ...obj, majLe: serverTimestamp() });
    message("cfg-message", "Configuration enregistrée." + (garde ? "" : " (Version précédente non gardée.)"), true);
    chargerTout();
  } catch (e) {
    message("cfg-message", "Échec de l'enregistrement (" + (e.code || e.name) + ").", false);
  }
});

// Versions précédentes de la configuration : vision/config_historique = { versions: [{ le, texte }] },
// la plus récente d'abord. Rien n'est ajouté si le texte enregistré est identique à l'actuel.
const HISTORIQUE = 5;
async function garderAncienne(nouvelle) {
  const { majLe, ...actuelle } = etat.config || {};
  if (!etat.config || canon(actuelle) === canon(nouvelle)) return;
  const { doc, getDocFromServer, setDoc } = etat.F;
  const ref = doc(etat.db, "vision", "config_historique");
  const snap = await getDocFromServer(ref);
  const versions = (snap.exists() && snap.data().versions) || [];
  versions.unshift({ le: new Date().toISOString(), texte: JSON.stringify(actuelle) });
  await setDoc(ref, { versions: versions.slice(0, HISTORIQUE) });
}
$("cfg-precedente").addEventListener("click", async () => {
  const { doc, getDocFromServer } = etat.F || {};
  if (!etat.db) return;
  try {
    const snap = await getDocFromServer(doc(etat.db, "vision", "config_historique"));
    const v = snap.exists() && (snap.data().versions || [])[0];
    if (!v) return message("cfg-message", "Aucune version précédente gardée.", false);
    $("cfg-texte").value = JSON.stringify(JSON.parse(v.texte), null, 2);
    message("cfg-message", `Version remplacée le ${new Date(v.le).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })} chargée ci-dessus : relis, puis « Enregistrer la configuration ».`, true);
  } catch (e) {
    message("cfg-message", "Lecture impossible (" + (e.code || e.name) + ").", false);
  }
});

/* ---------- Sauvegarde ---------- */
function afficherSauvegarde(s) {
  const e = $("sauv-etat");
  if (!s || !s.le) { e.textContent = "Aucune sauvegarde pour l'instant."; e.className = "discret"; return; }
  const jours = Math.floor((Date.now() - s.le.toDate().getTime()) / 864e5);
  e.textContent = `Dernière sauvegarde : ${quand(s.le)} · ${s.documents} documents.` + (jours > 15 ? ` Aucune depuis ${jours} jours : vérifier la tâche planifiée.` : "");
  e.className = jours > 15 ? "message ko" : "discret";
}

/* ---------- Semainier ---------- */
let lus = null;   // jours lus dans le fichier choisi, en attente d'enregistrement

function afficherSemainier(s) {
  $("sem-etat").textContent = s
    ? `Importé le ${quand(s.importe)} : ${s.jours} jours, du ${dateFr(s.du)} au ${dateFr(s.au)}.`
    : "Aucun semainier importé.";
}

$("sem-fichier").addEventListener("change", async e => {
  const f = e.target.files[0];
  e.target.value = "";
  $("sem-apercu").hidden = true; lus = null; message("sem-message", "");
  if (!f) return;
  if (!window.XLSX) return message("sem-message", "Le lecteur Excel n'est pas chargé (réseau ?).", false);
  if (!etat.config || !etat.config.semainier) return message("sem-message", "La configuration du semainier est absente.", false);
  try {
    const jours = lireClasseur(window.XLSX, await f.arrayBuffer(), etat.config.semainier);
    lus = jours;
    const gardes = jours.filter(j => j.evenements.some(x => x.cls === "garde")).length;
    const aVerifier = jours.filter(j => j.evenements.some(x => /^À vérifier/.test(x.titre))).length;
    $("sem-chiffres").innerHTML = "";
    [["Jours lus", jours.length], ["Du", dateFr(jours[0].date)], ["Au", dateFr(jours[jours.length - 1].date)],
     ["Gardes", gardes], ["Jours à vérifier", aVerifier]].forEach(([k, v]) => {
      const dt = document.createElement("dt"); dt.textContent = k;
      const dd = document.createElement("dd"); dd.textContent = v;
      $("sem-chiffres").append(dt, dd);
    });
    $("sem-apercu").hidden = false;
  } catch (err) {
    message("sem-message", err.message, false);
  }
});

$("sem-enregistrer").addEventListener("click", async () => {
  if (!lus) return;
  const { collection, doc, getDocsFromServer, writeBatch, setDoc, serverTimestamp } = etat.F;
  const bouton = $("sem-enregistrer");
  bouton.disabled = true; message("sem-message", "Enregistrement…", true);
  try {
    // N'écrire que les jours qui ont changé (quota Firestore partagé entre plusieurs apps).
    const col = collection(etat.db, "vision", "semainier", "jours");
    const existants = {};
    (await getDocsFromServer(col)).forEach(d => { existants[d.id] = canon(d.data()); });
    const aEcrire = lus.filter(j => existants[j.date] !== canon({ semaine: j.semaine, evenements: j.evenements }));
    for (let i = 0; i < aEcrire.length; i += 400) {
      const lot = writeBatch(etat.db);
      aEcrire.slice(i, i + 400).forEach(j => lot.set(doc(col, j.date), { semaine: j.semaine, evenements: j.evenements }));
      await lot.commit();
    }
    await setDoc(doc(etat.db, "vision", "etat"), {
      semainier: { importe: serverTimestamp(), jours: lus.length, du: lus[0].date, au: lus[lus.length - 1].date }
    }, { merge: true });
    message("sem-message", `${aEcrire.length} jours écrits, ${lus.length - aEcrire.length} inchangés.`, true);
    $("sem-apercu").hidden = true; lus = null;
    chargerTout();
  } catch (err) {
    message("sem-message", "Échec de l'enregistrement (" + (err.code || err.name) + ").", false);
  } finally {
    bouton.disabled = false;
  }
});

initVersion($("version"));
demarrer();
