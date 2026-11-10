// La Vision — coquille de l'app : connexion, onglets, configuration, import du semainier.
// Firebase est chargé à part : si son chargement échoue, la page reste utilisable et le dit.
import { lireClasseur } from "./semainier.js";
import { initPlanning, afficherPlanning } from "./planning.js";
import { initNounou, afficherNounou } from "./nounou.js";
import { initVersion } from "./version.js";
import { initAccueil, afficherAccueil } from "./accueil.js";
import { initPostit, afficherPostit } from "./postit.js";

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
  const etat = mk("span", "be-etat", $("etat-sync").textContent);
  const nav = mk("div", "ac-boutons");
  for (const v of ["planning", "nounou"]) {
    if (v === vue) continue;
    const p = mk("button", "ac-pilule", NOMS_VUES[v]); p.type = "button"; p.onclick = () => ouvrir(v); nav.append(p);
  }
  if (vue !== "reglages") {
    const r = mk("button", "ac-pilule ac-icone", "⚙︎"); r.type = "button"; r.setAttribute("aria-label", "Réglages"); r.onclick = () => ouvrir("reglages"); nav.append(r);
  }
  b.replaceChildren(retour, titre, etat, nav, mk("span", "ac-marque", "LA VISION"));
}

function ouvrir(vue, jour) {
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
}
document.querySelectorAll(".onglet").forEach(b => b.addEventListener("click", () => ouvrir(b.dataset.vue)));
// Onglet de départ : l'accueil sur un grand écran (iPad, Mac), le module nounou sur un téléphone.
ouvrir(window.matchMedia("(min-width: 900px)").matches ? "accueil" : "nounou");

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
    initPlanning({ F: etat.F, db: etat.db, fam: etat.config && etat.config.famille });
    if (!$("vue-planning").hidden) afficherPlanning();
    const ctx = { F: etat.F, db: etat.db, fam: etat.config && etat.config.famille };
    initNounou(ctx);
    if (!$("vue-nounou").hidden) afficherNounou();
    initPostit(ctx);
    if (!$("vue-postit").hidden) afficherPostit();
    initAccueil({ ...ctx, ouvrir });
    if (!$("vue-accueil").hidden) afficherAccueil();
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
    await setDoc(doc(etat.db, "vision", "config"), { ...obj, majLe: serverTimestamp() });
    message("cfg-message", "Configuration enregistrée.", true);
    chargerTout();
  } catch (e) {
    message("cfg-message", "Échec de l'enregistrement (" + (e.code || e.name) + ").", false);
  }
});

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
