// Valises — coquille de l'app : connexion au compte famille, lecture de la liste principale,
// import initial, navigation. Firebase est chargé à part : si son chargement échoue,
// la page reste affichée et le dit.
import { preparerImport, personnesTriees, sacsDe, objetsDe, compter, pluriel } from "./modele.js";
import { picto } from "./icones.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
// Même projet que le tableau de bord : la liste vit dans le document protégé « vision/valises ».
const FIREBASE = {
  apiKey: "AIzaSyC7sZDCVP-r34T33L6nEwWzibsrXnxletA",
  authDomain: "diversif-bebe.firebaseapp.com",
  projectId: "diversif-bebe"
};

const $ = id => document.getElementById(id);
// lue : la liste a été lue sur le serveur au moins une fois (un cache vide ne vaut pas « rien »).
const etat = { F: null, db: null, auth: null, liste: null, lue: false, personne: null, essai: null, version: "" };

// Petit constructeur d'éléments : h("button", { class: "x", onclick: f }, enfant, "texte").
function h(balise, attributs, ...enfants) {
  const el = document.createElement(balise);
  for (const [cle, v] of Object.entries(attributs || {})) {
    if (v === false || v == null) continue;
    if (cle.startsWith("on")) el.addEventListener(cle.slice(2), v);
    else if (cle === "style") Object.assign(el.style, v);
    else el.setAttribute(cle, v === true ? "" : v);
  }
  el.append(...enfants.filter(e => e != null && e !== false));
  return el;
}

function sync(texte, classe) {
  const el = $("etat");
  el.textContent = texte;
  el.className = "etat" + (classe ? " " + classe : "");
}

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
  etat.F.onAuthStateChanged(etat.auth, user => {
    $("connexion").hidden = !!user;
    if (!user) { etat.liste = null; etat.lue = false; sync("Non connecté"); afficher(); return; }
    charger();
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
  const erreur = $("cx-erreur");
  if (!etat.auth) { erreur.textContent = "Firebase n'est pas chargé."; return; }
  $("cx-ok").disabled = true; erreur.textContent = "";
  try {
    await etat.F.signInWithEmailAndPassword(etat.auth, $("cx-email").value.trim(), $("cx-mdp").value);
    $("cx-mdp").value = "";
  } catch (err) {
    erreur.textContent = MESSAGES[err.code] || "Connexion impossible (" + (err.code || "erreur") + ").";
  } finally {
    $("cx-ok").disabled = false;
  }
});

/* ---------- Lecture de la liste ---------- */
let arretEcoute = null;
async function charger() {
  sync("Lecture…");
  const { doc, getDocFromServer, onSnapshot } = etat.F;
  const ref = doc(etat.db, "vision", "valises");
  try {
    // Première lecture forcée sur le serveur : un cache vide ne doit jamais passer pour « pas de liste ».
    const snap = await getDocFromServer(ref);
    recevoir(snap);
  } catch (e) {
    sync("Serveur injoignable (" + (e.code || e.name) + ") : rien n'est affiché plutôt qu'un faux vide.", "ko");
    return;
  }
  if (arretEcoute) arretEcoute();
  // Ensuite, mises à jour en direct (l'autre téléphone, un import).
  arretEcoute = onSnapshot(ref, s => {
    if (s.metadata.fromCache && !s.exists()) return;
    recevoir(s);
  }, () => sync("Mises à jour en direct interrompues : recharge la page.", "ko"));
}

function recevoir(snap) {
  const d = snap.exists() ? snap.data() : null;
  etat.liste = d && d.personnes && d.sacs ? { personnes: d.personnes, sacs: d.sacs, objets: d.objets || {} } : null;
  etat.lue = true;
  sync("À jour à " + new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }), "ok");
  afficher();
}

/* ---------- Navigation (par l'adresse, pour que le geste retour de l'iPhone fonctionne) ---------- */
function route() {
  const [nom, arg] = location.hash.replace(/^#\/?/, "").split("/");
  return { nom: nom || "accueil", arg: arg ? decodeURIComponent(arg) : "" };
}
window.addEventListener("hashchange", afficher);

function afficher() {
  const ecran = $("ecran");
  const r = route();
  let vue;
  if (!etat.lue) vue = vueAttente();
  else if (r.nom === "import") vue = vueImport();
  else if (!etat.liste) vue = vueVide();
  else if (r.nom === "sac" && etat.liste.sacs[r.arg]) vue = vueSac(r.arg);
  else vue = vueListe();
  ecran.replaceChildren(...vue);
  window.scrollTo(0, 0);
}

const lienRetour = (texte, cible) =>
  h("a", { class: "retour", href: cible }, picto("retour", 22, 2.2), h("span", null, texte));

/* ---------- Vues ---------- */
function vueAttente() {
  return [h("h1", null, "Valises")];
}

function vueVide() {
  return [
    h("h1", null, "Valises"),
    h("div", { class: "carte bloc" },
      h("h2", null, "Aucune liste enregistrée"),
      h("p", { class: "second" }, "Colle le texte de la liste fourni dans le projet pour créer les personnes, les sacs et les objets."),
      h("a", { class: "bouton", href: "#import" }, "Importer la liste"))
  ];
}

function pastille(p, taille) {
  return h("span", { class: "disque" + (taille ? " " + taille : ""), style: { background: p.couleur } }, p.initiale);
}

function vueListe() {
  const liste = etat.liste;
  const personnes = personnesTriees(liste);
  if (!personnes.some(p => p.cle === etat.personne)) etat.personne = personnes[0] && personnes[0].cle;
  const choisie = personnes.find(p => p.cle === etat.personne);
  const total = compter(liste);

  const choix = h("div", { class: "personnes", role: "group", "aria-label": "Propriétaire" },
    ...personnes.map(p => h("button", {
      type: "button", class: "personne", "aria-pressed": String(p.cle === etat.personne),
      onclick: () => { etat.personne = p.cle; afficher(); }
    }, pastille(p), h("span", { class: "personne-nom" }, p.nom))));

  const sacs = sacsDe(liste, etat.personne);
  const cartes = sacs.length
    ? h("div", { class: "carte" }, ...sacs.map(s => {
      const n = objetsDe(liste, s.id).length;
      return h("a", { class: "ligne-sac", href: "#sac/" + encodeURIComponent(s.id) },
        h("span", { class: "tuile" }, picto(s.icone)),
        h("span", { class: "ligne-texte" },
          h("span", { class: "ligne-nom" }, s.nom),
          h("span", { class: "ligne-sous" }, pluriel(n, "objet") + (s.office ? "" : ", occasionnel"))),
        picto("chevron", 22, 2));
    }))
    : h("p", { class: "second" }, "Aucun sac pour " + choisie.nom + ".");

  return [
    h("h1", null, "Valises"),
    h("p", { class: "second sous-titre" }, "Liste principale : " + pluriel(total.sacs, "sac") + ", " + pluriel(total.objets, "objet")),
    choix,
    h("div", { class: "entete-section" },
      h("h2", null, choisie.nom),
      h("span", { class: "second" }, pluriel(sacs.length, "sac"))),
    cartes,
    h("details", { class: "reglages" },
      h("summary", null, "Réglages"),
      h("a", { class: "bouton secondaire", href: "#import" }, "Remplacer la liste"),
      h("button", { type: "button", class: "bouton secondaire", onclick: () => etat.F.signOut(etat.auth) }, "Se déconnecter de cet appareil"),
      h("p", { class: "second petit" }, etat.version))
  ];
}

function vueSac(id) {
  const liste = etat.liste;
  const sac = liste.sacs[id];
  const proprio = { cle: sac.proprio, ...liste.personnes[sac.proprio] };
  const objets = objetsDe(liste, id);
  return [
    h("div", { class: "barre" },
      lienRetour("Liste", "#"),
      h("span", { class: "puce" }, pastille(proprio, "petit"), h("span", null, proprio.nom))),
    h("h1", null, sac.nom),
    h("p", { class: "second sous-titre" }, pluriel(objets.length, "objet") + (sac.office ? "" : ", sac occasionnel")),
    objets.length
      ? h("ul", { class: "carte objets" }, ...objets.map(o => {
        const pour = o.pour && liste.personnes[o.pour];
        return h("li", { class: "ligne-objet" },
          h("span", { class: "objet-nom" }, o.nom),
          pour ? h("span", { class: "ligne-sous" }, "Seulement si " + pour.nom + " part") : null);
      }))
      : h("p", { class: "second" }, "Ce sac est vide.")
  ];
}

function vueImport() {
  const zone = h("textarea", {
    id: "imp-texte", rows: "10", spellcheck: "false", autocapitalize: "off", autocomplete: "off",
    "aria-label": "Texte de la liste", placeholder: "Colle ici le texte de la liste"
  });
  const resultat = h("div", { class: "resultat", role: "status" });
  const enregistrer = h("button", { type: "button", class: "bouton", hidden: true }, "Enregistrer la liste");

  function verifier() {
    etat.essai = null; enregistrer.hidden = true;
    if (!zone.value.trim()) { resultat.replaceChildren(h("p", { class: "ko" }, "Colle d'abord le texte de la liste.")); return; }
    const r = preparerImport(zone.value);
    if (!r.ok) {
      resultat.replaceChildren(
        h("p", { class: "ko" }, "La liste n'a pas pu être lue :"),
        h("ul", { class: "erreurs" }, ...r.erreurs.slice(0, 8).map(m => h("li", null, m))));
      return;
    }
    etat.essai = r.liste;
    resultat.replaceChildren(h("p", { class: "ok" },
      "Liste lisible : " + pluriel(r.resume.personnes, "propriétaire") + ", " + pluriel(r.resume.sacs, "sac") + ", " + pluriel(r.resume.objets, "objet") + "."));
    enregistrer.hidden = false;
  }

  enregistrer.addEventListener("click", async () => {
    if (!etat.essai) return;
    if (etat.liste && !confirm("Remplacer la liste actuelle par celle-ci ?")) return;
    enregistrer.disabled = true;
    try {
      const { doc, setDoc, serverTimestamp } = etat.F;
      await setDoc(doc(etat.db, "vision", "valises"), { ...etat.essai, majLe: serverTimestamp() });
      etat.essai = null;
      location.hash = "";
    } catch (e) {
      resultat.replaceChildren(h("p", { class: "ko" }, "Enregistrement impossible (" + (e.code || e.name) + "). Vérifie la connexion et réessaie."));
      enregistrer.disabled = false;
    }
  });

  return [
    h("div", { class: "barre" }, lienRetour("Retour", "#")),
    h("h1", null, "Importer la liste"),
    h("p", { class: "second sous-titre" }, etat.liste
      ? "La liste collée remplacera la liste actuelle, pour les deux téléphones."
      : "À faire une seule fois : la liste sera ensuite partagée entre les téléphones."),
    zone,
    h("button", { type: "button", class: "bouton secondaire", onclick: verifier }, "Vérifier"),
    resultat,
    enregistrer
  ];
}

/* ---------- Version et mise à jour (mêmes règles que le tableau de bord) ---------- */
let chargee = null;
async function lireVersion() {
  const r = await fetch("../version.json", { cache: "no-store" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return (await r.json()).version;
}
async function initVersion() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("../sw.js", { updateViaCache: "none" }).catch(() => {});
  }
  try { chargee = await lireVersion(); etat.version = "Version " + chargee; }
  catch (e) { etat.version = "Version inconnue (hors connexion)"; }
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState !== "visible") return;
    try { const v = await lireVersion(); if (chargee && v !== chargee) location.reload(); }
    catch (e) { /* hors connexion : on réessaiera */ }
  });
}

afficher();
initVersion();
demarrer();
