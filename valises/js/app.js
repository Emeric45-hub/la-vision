// Valises — coquille de l'app : connexion au compte famille, lecture en direct de la liste
// principale et des départs, navigation, écrans. Firebase est chargé à part : si son
// chargement échoue, la page reste affichée et le dit.
import {
  preparerImport, personnesTriees, sacsDe, objetsDe, compter, pluriel,
  objetsDuDepart, sacsDuDepart, proprietairesDuDepart, avancement, voisins,
  sacsProposes, nouveauDepart, periode, departsTries,
  listeDuDepart, retiresDuSac, sacsAbsents, creerObjet, creerSac, aBasculer,
  modelesTries, modeleDe, modeleDeMemeNom, partantsDuModele
} from "./modele.js";
import { picto, ICONES } from "./icones.js";
import { balayable, appuiLong, tiroir } from "./gestes.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
// Même projet que le tableau de bord : tout vit sous le document protégé « vision/valises ».
const FIREBASE = {
  apiKey: "AIzaSyC7sZDCVP-r34T33L6nEwWzibsrXnxletA",
  authDomain: "diversif-bebe.firebaseapp.com",
  projectId: "diversif-bebe"
};

const $ = id => document.getElementById(id);
// lue : liste et départs ont été lus sur le serveur au moins une fois (un cache vide ne vaut pas « rien »).
const etat = {
  F: null, db: null, auth: null, lue: false, liste: null, departs: {},
  personne: null,      // propriétaire affiché dans la liste principale
  choix: {},           // propriétaire affiché, par départ
  mode: "personne",    // écran du départ : par personne ou par sac
  brouillon: null,     // saisie en cours d'un nouveau départ
  retiresOuverts: {},  // section « Retirés » dépliée, par sac
  saisie: null,        // ligne « nouvel objet » ouverte dans un sac d'un départ
  tiroir: null,        // départ ou modèle dont le bouton « Supprimer » est découvert, à l'accueil
  essai: null, version: ""
};

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
const heure = () => new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

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
    if (!user) { etat.liste = null; etat.departs = {}; etat.lue = false; sync("Non connecté"); afficher(true); return; }
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

/* ---------- Données ---------- */
const refListe = () => etat.F.doc(etat.db, "vision", "valises");
const refDeparts = () => etat.F.collection(etat.db, "vision", "valises", "departs");
const refDepart = id => etat.F.doc(etat.db, "vision", "valises", "departs", id);

let arrets = [];
async function charger() {
  sync("Lecture…");
  const { getDocFromServer, getDocsFromServer, onSnapshot } = etat.F;
  try {
    // Première lecture forcée sur le serveur : un cache vide ne doit jamais passer pour « rien ».
    const [liste, departs] = await Promise.all([getDocFromServer(refListe()), getDocsFromServer(refDeparts())]);
    recevoirListe(liste);
    recevoirDeparts(departs);
  } catch (e) {
    sync("Serveur injoignable (" + (e.code || e.name) + ") : rien n'est affiché plutôt qu'un faux vide.", "ko");
    return;
  }
  etat.lue = true;
  afficher(true);
  // Ensuite, mises à jour en direct : l'autre téléphone, et nos propres écritures dès qu'elles partent.
  arrets.forEach(f => f());
  const perdu = () => sync("Mises à jour en direct interrompues : recharge la page.", "ko");
  arrets = [
    onSnapshot(refListe(), s => { if (s.metadata.fromCache && !s.exists()) return; recevoirListe(s); rafraichir(); }, perdu),
    onSnapshot(refDeparts(), s => { if (s.metadata.fromCache && s.empty) return; recevoirDeparts(s); rafraichir(); }, perdu)
  ];
}

function recevoirListe(snap) {
  const d = snap.exists() ? snap.data() : null;
  etat.liste = d && d.personnes && d.sacs ? { personnes: d.personnes, sacs: d.sacs, objets: d.objets || {} } : null;
  sync("À jour à " + heure(), "ok");
}
function recevoirDeparts(snap) {
  const departs = {};
  snap.forEach(d => { departs[d.id] = d.data(); });
  etat.departs = departs;
  sync("À jour à " + heure(), "ok");
}

async function ecrire(action, quoi) {
  try { await action(); }
  catch (e) { sync(quoi + " non enregistré (" + (e.code || e.name) + "). Vérifie la connexion.", "ko"); }
}

const majDepart = (idDepart, champs) => ecrire(() => etat.F.updateDoc(refDepart(idDepart), champs), "Changement");
const identifiant = prefixe => prefixe + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function cocher(idDepart, idObjet, valeur) {
  majDepart(idDepart, { ["coches." + idObjet]: valeur ? true : etat.F.deleteField() });
}

function basculer(idDepart, ids, valeur) {
  const champs = {};
  ids.forEach(i => { champs["coches." + i] = valeur ? true : etat.F.deleteField(); });
  majDepart(idDepart, champs);
}

function retirerObjet(idDepart, o) {
  majDepart(idDepart, { ["retires." + o.id]: true, ["coches." + o.id]: etat.F.deleteField() });
  annonce("« " + o.nom + " » retiré de ce départ", () => remettreObjet(idDepart, o.id, o.coche));
}

function remettreObjet(idDepart, idObjet, coche) {
  const champs = { ["retires." + idObjet]: etat.F.deleteField() };
  if (coche) champs["coches." + idObjet] = true;
  majDepart(idDepart, champs);
}

// Supprime un départ ou un modèle ; « Annuler » le réécrit tel qu'il était.
function supprimerDepart(id, texte) {
  const d = etat.departs[id];
  if (!d) return;
  ecrire(() => etat.F.deleteDoc(refDepart(id)), "Suppression");
  delete etat.departs[id];
  annonce(texte || "« " + d.nom + " » supprimé", () => ecrire(() => etat.F.setDoc(refDepart(id), d), "Rétablissement"));
}

/* ---------- Annonce brève avec « Annuler », et feuille de saisie ---------- */
let finAnnonce = null;
function annonce(texte, annuler) {
  const el = $("annonce");
  clearTimeout(finAnnonce);
  el.replaceChildren(h("span", null, texte));
  if (annuler) el.append(h("button", { type: "button", onclick: () => { el.hidden = true; annuler(); } }, "Annuler"));
  el.hidden = false;
  finAnnonce = setTimeout(() => { el.hidden = true; }, 6000);
}

// Fenêtre de saisie posée au-dessus de l'écran : elle n'est pas redessinée quand des données arrivent.
function ouvrirFeuille(titre, contenu) {
  const f = $("saisie");
  f.replaceChildren(
    h("div", { class: "feuille-tete" },
      h("h2", null, titre),
      h("button", { type: "button", class: "feuille-fermer", onclick: fermerFeuille }, "Fermer")),
    ...contenu.filter(e => e != null && e !== false));
  $("annonce").hidden = true;
  if (f.showModal) { if (!f.open) f.showModal(); } else f.setAttribute("open", "");
}
function fermerFeuille() {
  const f = $("saisie");
  if (f.close && f.open) f.close(); else f.removeAttribute("open");
}
$("saisie").addEventListener("click", e => { if (e.target === $("saisie")) fermerFeuille(); });

// Interrupteur « Seulement cette fois ».
function interrupteur(texte, sous, coche = true) {
  const boite = h("input", { type: "checkbox", class: "inter-case" });
  boite.checked = coche;   // par défaut un ajout ne vaut que pour ce départ : la liste principale ne grossit pas par oubli
  return { boite, el: h("label", { class: "inter" },
    h("span", { class: "ligne-texte" }, h("span", null, texte), h("span", { class: "ligne-sous" }, sous)), boite) };
}

/* ---------- Navigation (par l'adresse, pour que le geste retour de l'iPhone fonctionne) ---------- */
function route() {
  const [nom, a, b] = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  return { nom: nom || "accueil", a: a || "", b: b || "" };
}

// Chaque entrée de l'historique porte son rang dans l'app : « retour » remonte d'une entrée quand
// il y en a une (comme le balayage depuis le bord), et passer d'un sac au suivant remplace l'entrée.
let rang = (history.state && history.state.rang) || 0;
function aller(cible, remplacer) {
  if (remplacer) history.replaceState({ rang }, "", cible);
  else history.pushState({ rang: ++rang }, "", cible);
  afficher(true);
}
function quitter(cible) {
  if (rang > 0) history.back(); else aller(cible || "#", true);
}
window.addEventListener("popstate", e => { rang = (e.state && e.state.rang) || 0; afficher(true); });
document.addEventListener("click", e => {
  const a = e.target.closest && e.target.closest("a[href^='#']");
  if (!a) return;
  e.preventDefault();
  const cible = a.getAttribute("href");
  if (a.dataset.nav === "retour") quitter(cible);
  else aller(cible, a.dataset.nav === "remplacer");
});

// Les écrans de saisie ne sont pas redessinés quand des données arrivent : on y perdrait le texte tapé.
function rafraichir() {
  const r = route().nom;
  if (r === "import" || r === "nouveau") return;
  afficher(false);
}

// Pose les éléments d'un écran. Si l'un d'eux est déjà à l'écran et contient le champ en cours de frappe,
// il ne bouge pas (le clavier resterait sinon fermé) : on remplace seulement ce qui l'entoure.
function poser(ecran, noeuds) {
  const fixe = noeuds.find(n => n.parentNode === ecran && n.contains(document.activeElement));
  if (!fixe) { ecran.replaceChildren(...noeuds); return; }
  [...ecran.childNodes].forEach(n => { if (n !== fixe) n.remove(); });
  const i = noeuds.indexOf(fixe);
  fixe.before(...noeuds.slice(0, i));
  fixe.after(...noeuds.slice(i + 1));
  garderVisible(fixe);
}

// Fait défiler juste ce qu'il faut pour que l'élément reste au-dessus du clavier.
function garderVisible(el) {
  const vv = window.visualViewport, r = el.getBoundingClientRect();
  const haut = vv ? vv.offsetTop : 0, bas = haut + (vv ? vv.height : window.innerHeight);
  if (r.bottom > bas - 12) window.scrollBy(0, r.bottom - bas + 12);
  else if (r.top < haut + 12) window.scrollBy(0, r.top - haut - 12);
}

function afficher(enHaut) {
  const r = route();
  // Quitter le sac où l'on saisissait un objet enregistre ce qui était tapé, comme un appui sur « Terminé ».
  // À faire avant de lire le départ : l'écriture peut le mettre à jour aussitôt.
  const sa = etat.saisie;
  if (sa && !(r.nom === "depart" && r.a === sa.depart && r.b === sa.sac)) { etat.saisie = null; sa.valider(); }
  const trouve = r.nom === "depart" ? etat.departs[r.a] : null;
  const depart = trouve && !trouve.modele ? trouve : null;
  if (enHaut) etat.tiroir = null;
  let vue;
  if (!etat.lue) vue = [h("h1", null, "Valises")];
  else if (r.nom === "import") vue = vueImport();
  else if (!etat.liste) vue = vueVide();
  else if (r.nom === "liste") vue = vueListe();
  else if (r.nom === "sac" && etat.liste.sacs[r.a]) vue = vueSac(r.a);
  else if (r.nom === "nouveau") vue = vueNouveau(r.a);
  else if (depart && r.b) vue = vueValise(r.a, depart, r.b);
  else if (depart) vue = vueDepart(r.a, depart);
  else vue = vueAccueil();
  poser($("ecran"), vue.filter(e => e != null && e !== false));
  if (enHaut) window.scrollTo(0, 0);
}

/* ---------- Éléments communs ---------- */
const lienRetour = (texte, cible) =>
  h("a", { class: "retour", href: cible, "data-nav": "retour" }, picto("retour", 22, 2.2), h("span", null, texte));

function disque(p, taille) {
  return h("span", { class: "disque" + (taille ? " " + taille : ""), style: { background: p.couleur } }, p.initiale);
}

const NS = "http://www.w3.org/2000/svg";
// Disque entouré d'un anneau d'avancement (fait / total).
function disqueAnneau(p) {
  const tour = 2 * Math.PI * 21;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 48 48"); svg.setAttribute("aria-hidden", "true"); svg.classList.add("anneau");
  const cercle = (classe, extra) => {
    const c = document.createElementNS(NS, "circle");
    c.setAttribute("cx", 24); c.setAttribute("cy", 24); c.setAttribute("r", 21); c.classList.add(classe);
    Object.assign(c.style, extra || {});
    svg.appendChild(c);
  };
  cercle("anneau-piste");
  if (p.fait > 0) cercle("anneau-fait", { stroke: p.couleur, strokeDasharray: (p.fait / p.total) * tour + " " + tour });
  return h("span", { class: "disque-anneau" }, svg, disque(p, "moyen"));
}

function barre(fait, total) {
  const pret = total > 0 && fait === total;
  return h("div", { class: "progres" },
    h("div", { class: "progres-piste" },
      h("div", { class: "progres-fait" + (pret ? " pret" : ""), style: { width: (total ? Math.round((fait / total) * 100) : 0) + "%" } })),
    h("span", { class: "progres-texte" + (pret ? " pret" : "") }, pret ? "Prêt" : fait + " sur " + total));
}

function coche(active) {
  return h("span", { class: "cercle" + (active ? " actif" : "") }, picto("coche", 18, 3));
}

const reglages = () => h("details", { class: "reglages" },
  h("summary", null, "Réglages"),
  h("a", { class: "bouton secondaire", href: "#import" }, "Remplacer la liste"),
  h("button", { type: "button", class: "bouton secondaire", onclick: () => etat.F.signOut(etat.auth) }, "Se déconnecter de cet appareil"),
  h("p", { class: "second petit" }, etat.version));

/* ---------- Accueil ---------- */
function vueVide() {
  return [
    h("h1", null, "Valises"),
    h("div", { class: "carte bloc" },
      h("h2", null, "Aucune liste enregistrée"),
      h("p", { class: "second" }, "Colle le texte de la liste fourni dans le projet pour créer les personnes, les sacs et les objets."),
      h("a", { class: "bouton", href: "#import" }, "Importer la liste"))
  ];
}

function vueAccueil() {
  const liste = etat.liste;
  const departs = departsTries(etat.departs);
  const modeles = modelesTries(etat.departs);
  const total = compter(liste);

  // Balayer vers la gauche découvre « Supprimer » ; rien n'est supprimé avant un toucher sur ce bouton.
  const avecTiroir = (id, el, quoi) => {
    tiroir(el, 104, etat.tiroir === id, o => { etat.tiroir = o ? id : etat.tiroir === id ? null : etat.tiroir; });
    return h("div", { class: "glissiere tiroir" + (quoi === "depart" ? " seule" : "") },
      h("button", { type: "button", class: "glissiere-fond action", "aria-label": "Supprimer " + etat.departs[id].nom,
        onclick: () => { etat.tiroir = null; supprimerDepart(id); afficher(false); } }, "Supprimer"),
      el);
  };

  return [
    h("h1", null, "Valises"),
    departs.length
      ? h("div", { class: "pile" }, ...departs.map(d => {
        const av = avancement(listeDuDepart(liste, d), d);
        const sous = [d.destination, periode(d.debut, d.fin)].filter(Boolean).join(", ");
        return avecTiroir(d.id, h("a", { class: "carte bloc carte-depart", href: "#depart/" + encodeURIComponent(d.id), draggable: "false" },
          h("span", { class: "depart-nom" }, d.nom),
          sous ? h("span", { class: "ligne-sous" }, sous) : null,
          barre(av.fait, av.total)), "depart");
      }))
      : h("p", { class: "second sous-titre" }, "Aucun départ en préparation."),
    h("a", { class: "bouton espace", href: "#nouveau" }, "Nouveau départ"),
    h("a", { class: "bouton secondaire", href: "#liste" }, "Liste principale"),
    h("p", { class: "second petit centre" }, pluriel(total.sacs, "sac") + ", " + pluriel(total.objets, "objet")),
    modeles.length ? h("h2", { class: "titre-section" }, "Modèles") : null,
    modeles.length ? h("div", { class: "carte" }, ...modeles.map(m => avecTiroir(m.id,
      h("a", { class: "ligne-sac", href: "#nouveau/" + encodeURIComponent(m.id), draggable: "false" },
        h("span", { class: "tuile" }, picto("valise")),
        h("span", { class: "ligne-texte" },
          h("span", { class: "ligne-nom" }, m.nom),
          h("span", { class: "ligne-sous" }, pluriel((m.personnes || []).length, "personne") + ", " + pluriel((m.sacs || []).length, "sac"))),
        picto("chevron", 22, 2)), "modele"))) : null,
    departs.length || modeles.length ? h("p", { class: "second petit astuce" },
      "Balaye " + (modeles.length ? "un départ ou un modèle" : "un départ") + " vers la gauche pour le supprimer.") : null,
    reglages()
  ];
}

/* ---------- Liste principale (lecture) ---------- */
function vueListe() {
  const liste = etat.liste;
  const personnes = personnesTriees(liste);
  if (!personnes.some(p => p.cle === etat.personne)) etat.personne = personnes[0] && personnes[0].cle;
  const choisie = personnes.find(p => p.cle === etat.personne);

  const choix = h("div", { class: "personnes", role: "group", "aria-label": "Propriétaire" },
    ...personnes.map(p => h("button", {
      type: "button", class: "personne", "aria-pressed": String(p.cle === etat.personne),
      onclick: () => { etat.personne = p.cle; afficher(false); }
    }, disque(p), h("span", { class: "personne-nom" }, p.nom))));

  const sacs = sacsDe(liste, etat.personne);
  return [
    h("div", { class: "barre" }, lienRetour("Valises", "#")),
    h("h1", null, "Liste principale"),
    choix,
    h("div", { class: "entete-section" },
      h("h2", null, choisie.nom),
      h("span", { class: "second" }, pluriel(sacs.length, "sac"))),
    sacs.length
      ? h("div", { class: "carte" }, ...sacs.map(s => {
        const n = objetsDe(liste, s.id).length;
        return h("a", { class: "ligne-sac", href: "#sac/" + encodeURIComponent(s.id) },
          h("span", { class: "tuile" }, picto(s.icone)),
          h("span", { class: "ligne-texte" },
            h("span", { class: "ligne-nom" }, s.nom),
            h("span", { class: "ligne-sous" }, pluriel(n, "objet") + (s.office ? "" : ", occasionnel"))),
          picto("chevron", 22, 2));
      }))
      : h("p", { class: "second" }, "Aucun sac pour " + choisie.nom + ".")
  ];
}

function vueSac(id) {
  const liste = etat.liste;
  const sac = liste.sacs[id];
  const proprio = liste.personnes[sac.proprio];
  const objets = objetsDe(liste, id);
  return [
    h("div", { class: "barre" },
      lienRetour("Liste", "#liste"),
      h("span", { class: "puce" }, disque(proprio, "petit"), h("span", null, proprio.nom))),
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

/* ---------- Nouveau départ ---------- */
function vueNouveau(idModele) {
  const trouve = idModele ? etat.departs[idModele] : null;
  const modele = trouve && trouve.modele ? trouve : null;
  const liste = modele ? listeDuDepart(etat.liste, modele) : etat.liste;
  const personnes = personnesTriees(liste).filter(p => !p.commun);
  if (!etat.brouillon || etat.brouillon.modele !== (modele ? idModele : "")) {
    etat.brouillon = modele
      ? { modele: idModele, nom: modele.nom, destination: "", debut: "", fin: "", personnes: new Set(partantsDuModele(liste, modele)), bascules: {}, ouvert: false }
      : { modele: "", nom: "", destination: "", debut: "", fin: "", personnes: new Set(personnes.map(p => p.cle)), bascules: {}, ouvert: false };
  }
  const b = etat.brouillon;
  const duModele = new Set(modele ? modele.sacs : []);
  const proposes = sacsProposes(liste, [...b.personnes])
    .map(s => ({ ...s, coche: s.id in b.bascules ? b.bascules[s.id] : modele ? duModele.has(s.id) : s.coche }));
  const retenus = proposes.filter(s => s.coche).map(s => s.id);
  const erreur = h("p", { class: "message", role: "alert" });

  const champ = (cle, attributs) => h("input", { ...attributs, value: b[cle], oninput: e => { b[cle] = e.target.value; } });

  const groupes = personnesTriees(liste)
    .map(p => ({ p, sacs: proposes.filter(s => s.proprio === p.cle) }))
    .filter(g => g.sacs.length)
    .flatMap(g => [
      h("div", { class: "groupe" }, disque(g.p, "mini"), h("span", null, g.p.nom)),
      h("div", { class: "carte" }, ...g.sacs.map(s => h("button", {
        type: "button", class: "ligne-coche compacte", "aria-pressed": String(s.coche),
        onclick: () => { b.bascules[s.id] = !s.coche; afficher(false); }
      }, coche(s.coche), h("span", { class: "ligne-texte" },
        h("span", { class: "coche-nom" }, s.nom),
        // Un faux sac « hors sac » ne dit rien par son nom : on montre ce qu'il contient pour les partants.
        s.apart ? h("span", { class: "ligne-sous apercu" }, objetsDuDepart(liste, { personnes: [...b.personnes] }, s.id).map(o => o.nom).join(", ") || "Rien pour ces personnes") : null))))
    ]);

  async function creer(e) {
    const r = nouveauDepart(etat.liste, { nom: b.nom, destination: b.destination, debut: b.debut, fin: b.fin, personnes: [...b.personnes], sacs: retenus }, modele);
    if (!r.ok) { erreur.textContent = r.erreur; erreur.scrollIntoView({ block: "center" }); return; }
    e.target.disabled = true;
    try {
      const { addDoc, serverTimestamp } = etat.F;
      const ref = await addDoc(refDeparts(), { ...r.depart, creeLe: serverTimestamp() });
      etat.brouillon = null;
      etat.departs[ref.id] = r.depart;   // visible tout de suite, avant le retour du serveur
      aller("#depart/" + encodeURIComponent(ref.id), true);
    } catch (err) {
      erreur.textContent = "Création impossible (" + (err.code || err.name) + "). Vérifie la connexion et réessaie.";
      e.target.disabled = false;
    }
  }

  return [
    h("div", { class: "barre" },
      h("a", { class: "retour", href: "#", "data-nav": "retour", onclick: () => { etat.brouillon = null; } }, "Annuler")),
    h("h1", null, "Nouveau départ"),
    modele ? h("p", { class: "second sous-titre" }, "D'après le modèle « " + modele.nom + " ».") : null,
    champ("nom", { type: "text", class: "champ grand", "aria-label": "Nom du départ", placeholder: "Nom du départ", autocomplete: "off", enterkeyhint: "done" }),
    h("details", { class: "optionnel", open: b.ouvert, ontoggle: e => { b.ouvert = e.target.open; } },
      h("summary", null, picto("plus", 20, 2.4), h("span", null, "Destination et dates")),
      h("label", { class: "etiquette" }, "Destination", champ("destination", { type: "text", class: "champ", autocomplete: "off" })),
      h("div", { class: "deux" },
        h("label", { class: "etiquette" }, "Du", champ("debut", { type: "date", class: "champ" })),
        h("label", { class: "etiquette" }, "Au", champ("fin", { type: "date", class: "champ" })))),
    h("h2", { class: "titre-section" }, "Qui part ?"),
    h("div", { class: "personnes" }, ...personnes.map(p => {
      const part = b.personnes.has(p.cle);
      return h("button", {
        type: "button", class: "personne choix" + (part ? "" : " absent"), "aria-pressed": String(part),
        onclick: () => { part ? b.personnes.delete(p.cle) : b.personnes.add(p.cle); afficher(false); }
      }, disque(p), h("span", { class: "personne-nom" }, p.nom));
    })),
    h("div", { class: "entete-section" },
      h("h2", { class: "titre-section sans-marge" }, "Sacs à emporter"),
      h("span", { class: "second" }, retenus.length + " sur " + proposes.length)),
    ...groupes,
    erreur,
    h("div", { class: "reserve" }),
    h("div", { class: "pied" }, h("button", { type: "button", class: "bouton", onclick: creer }, "Créer le départ"))
  ];
}

/* ---------- Écran du départ ---------- */
function vueDepart(id, depart) {
  const liste = listeDuDepart(etat.liste, depart);
  const props = proprietairesDuDepart(liste, depart);
  const av = avancement(liste, depart);
  const sous = [depart.destination, periode(depart.debut, depart.fin)].filter(Boolean).join(", ");
  const lien = s => "#depart/" + encodeURIComponent(id) + "/" + encodeURIComponent(s.id);
  const majuscule = t => t.charAt(0).toUpperCase() + t.slice(1);

  // Appui long : tout cocher (ou tout décocher si le sac est prêt), avec annulation.
  function toutCocher(s) {
    const cocherTout = !s.pret;
    const ids = aBasculer(liste, depart, s.id, cocherTout);
    if (!ids.length) return;
    basculer(id, ids, cocherTout);
    annonce("« " + s.nom + " » : tout est " + (cocherTout ? "coché" : "décoché"), () => basculer(id, ids, !cocherTout));
  }

  // Un faux sac « hors sac » ne dit rien par son nom : tant qu'il n'est pas prêt, sa ligne liste ce qu'il contient.
  const ligne = (s, detail) => {
    const compte = s.total === 0 ? (detail ? "vide" : "Vide") : s.pret ? (detail ? "prêt" : "Prêt") : s.fait + " sur " + s.total;
    const contenu = s.apart && !s.pret && s.total ? " : " + objetsDuDepart(liste, depart, s.id).map(o => o.nom).join(", ") : "";
    const el = h("a", { class: "ligne-sac", href: lien(s), draggable: "false" },
      h("span", { class: "tuile" + (s.pret ? " pret" : "") }, s.pret ? picto("coche", 26, 2.6) : picto(s.icone)),
      h("span", { class: "ligne-texte" },
        h("span", { class: "ligne-nom" }, s.nom),
        h("span", { class: "ligne-sous" + (s.pret ? " pret" : "") + (contenu ? " apercu" : "") }, (detail ? detail + ", " : "") + compte + contenu)),
      picto("chevron", 22, 2));
    appuiLong(el, () => toutCocher(s));
    balayable(el, () => retirerSac(s));
    return h("div", { class: "glissiere" }, h("span", { class: "glissiere-fond", "aria-hidden": "true" }, "Retirer"), el);
  };

  // Balayage vers la gauche : le sac sort de ce départ ; on le retrouve sous « Ajouter un sac ».
  function retirerSac(s) {
    majDepart(id, { sacs: etat.F.arrayRemove(s.id) });
    annonce("« " + s.nom + " » retiré de ce départ", () => majDepart(id, { sacs: etat.F.arrayUnion(s.id) }));
  }

  const bascule = h("div", { class: "bascule", role: "group", "aria-label": "Présentation" },
    ...[["personne", "Par personne"], ["sac", "Par sac"]].map(([m, texte]) => h("button", {
      type: "button", "aria-pressed": String(etat.mode === m), onclick: () => { etat.mode = m; afficher(false); }
    }, texte)));

  let corps;
  if (!props.length) {
    corps = [h("p", { class: "second sous-titre" }, "Ce départ ne contient aucun sac.")];
  } else if (etat.mode === "sac") {
    const sacs = sacsDuDepart(liste, depart).sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
    corps = [h("div", { class: "carte espace" }, ...sacs.map(s => ligne(s, liste.personnes[s.proprio].nom)))];
  } else {
    if (!props.some(p => p.cle === etat.choix[id])) etat.choix[id] = props[0].cle;
    const choisie = props.find(p => p.cle === etat.choix[id]);
    corps = [
      h("div", { class: "personnes", role: "group", "aria-label": "Propriétaire" },
        ...props.map(p => h("button", {
          type: "button", class: "personne", "aria-pressed": String(p.cle === choisie.cle),
          "aria-label": p.nom + ", " + p.fait + " sur " + p.total,
          onclick: () => { etat.choix[id] = p.cle; afficher(false); }
        }, disqueAnneau(p), h("span", { class: "personne-nom" }, p.nom)))),
      h("div", { class: "entete-section" },
        h("h2", null, choisie.nom),
        h("span", { class: "second" }, choisie.fait + " sur " + choisie.total)),
      h("div", { class: "carte" }, ...sacsDuDepart(liste, depart, choisie.cle).map(s => ligne(s, "")))
    ];
  }

  // Avant de repartir : tout décocher sur place, pour refaire le tour des sacs.
  function preparerRetour() {
    const avant = { ...(depart.coches || {}) };
    majDepart(id, { coches: {} });
    annonce("Tout est décoché pour le retour", () => majDepart(id, { coches: avant }));
  }

  return [
    h("div", { class: "barre" }, lienRetour("Départs", "#")),
    h("h1", null, depart.nom),
    sous ? h("p", { class: "second sous-titre" }, majuscule(sous)) : null,
    barre(av.fait, av.total),
    bascule,
    ...corps,
    props.length ? h("p", { class: "second petit astuce" }, "Appui long sur un sac pour tout cocher, balayage vers la gauche pour le retirer.") : null,
    h("button", { type: "button", class: "bouton secondaire espace", onclick: () => feuilleSac(id, depart) }, picto("plus", 20, 2.4), h("span", null, "Ajouter un sac")),
    h("div", { class: "deux fin-depart" },
      h("button", { type: "button", class: "bouton secondaire", disabled: av.fait === 0, onclick: preparerRetour }, "Préparer le retour"),
      h("button", { type: "button", class: "bouton secondaire", onclick: () => feuilleFin(id, depart) }, "Terminer le départ"))
  ];
}

/* ---------- Mode valise : un sac à la fois ---------- */
function vueValise(id, depart, idSac) {
  const liste = listeDuDepart(etat.liste, depart);
  const sac = sacsDuDepart(liste, depart).find(s => s.id === idSac);
  if (!sac) return vueDepart(id, depart);
  const proprio = liste.personnes[sac.proprio];
  const objets = objetsDuDepart(liste, depart, idSac);
  const retires = retiresDuSac(liste, depart, idSac);
  const v = voisins(liste, depart, idSac);
  const base = "#depart/" + encodeURIComponent(id);
  const vers = s => base + "/" + encodeURIComponent(s);

  const lignes = objets.map(o => {
    const bouton = h("button", {
      type: "button", class: "ligne-coche", "aria-pressed": String(o.coche),
      onclick: () => cocher(id, o.id, !o.coche)
    }, coche(o.coche), h("span", { class: "coche-nom" }, o.nom));
    balayable(bouton, () => retirerObjet(id, o));
    return h("div", { class: "glissiere" }, h("span", { class: "glissiere-fond", "aria-hidden": "true" }, "Retirer"), bouton);
  });

  const sa = etat.saisie && etat.saisie.depart === id && etat.saisie.sac === idSac ? etat.saisie : null;
  function ouvrirSaisie() {
    etat.saisie = saisieObjet(id, idSac);
    afficher(false);
    etat.saisie.champ.focus();   // dans le geste même, sinon l'iPhone n'ouvre pas le clavier
  }

  return [
    h("div", { class: "barre" },
      lienRetour(depart.nom, base),
      h("span", { class: "puce" }, disque(proprio, "petit"), h("span", null, proprio.nom))),
    h("h1", null, sac.nom),
    sac.total ? barre(sac.fait, sac.total) : h("p", { class: "second sous-titre" }, "Aucun objet à préparer dans ce sac."),
    lignes.length || !sa ? h("div", { class: "carte espace" + (sa ? " suite" : "") },
      ...lignes,
      sa ? null : h("button", { type: "button", class: "ligne-coche ajout", onclick: ouvrirSaisie },
        h("span", { class: "cercle plus" }, picto("plus", 18, 2.6)), h("span", { class: "coche-nom" }, "Ajouter un objet"))) : null,
    sa ? sa.noeud : null,
    objets.length ? h("p", { class: "second petit astuce" }, "Balaye un objet vers la gauche pour le retirer de ce départ.") : null,
    retires.length ? h("details", { class: "retires", open: !!etat.retiresOuverts[idSac], ontoggle: e => { etat.retiresOuverts[idSac] = e.target.open; } },
      h("summary", null, "Retirés de ce départ (" + retires.length + ")"),
      h("div", { class: "carte" }, ...retires.map(o => h("div", { class: "ligne-retire" },
        h("span", { class: "coche-nom" }, o.nom),
        h("button", { type: "button", class: "petit-bouton", onclick: () => remettreObjet(id, o.id, false) }, "Remettre"))))) : null,
    h("div", { class: "reserve" }),
    h("div", { class: "pied deux" },
      v.precedent
        ? h("a", { class: "bouton secondaire", href: vers(v.precedent), "data-nav": "remplacer" }, picto("retour", 20, 2.2), h("span", null, "Sac précédent"))
        : h("span", null),
      v.suivant
        ? h("a", { class: "bouton", href: vers(v.suivant), "data-nav": "remplacer" }, h("span", null, "Sac suivant"), picto("chevron", 20, 2.2))
        : h("a", { class: "bouton", href: base, "data-nav": "retour" }, "Revenir au départ"))
  ];
}

/* ---------- Ajouter un objet : une ligne de saisie au bout de la liste ---------- */
// La ligne reste ouverte pour saisir plusieurs objets à la suite : « retour » ajoute, une ligne vide ou « Terminé » referme.
function saisieObjet(id, idSac) {
  // Un sac ajouté « seulement cette fois » n'existe pas dans la liste principale : ses objets non plus.
  const depart = etat.departs[id] || {};
  const sacPonctuel = !!(depart.sacsPonctuels && depart.sacsPonctuels[idSac]);
  const champ = h("input", { type: "text", class: "saisie-champ", "aria-label": "Nom de l'objet", placeholder: "Nouvel objet", autocomplete: "off", enterkeyhint: "done" });
  const boite = h("input", { type: "checkbox", class: "inter-case petite", "aria-label": "Seulement cette fois" });
  boite.checked = true;
  const aide = h("p", { class: "saisie-aide" }, "Décoché : l'objet rejoint la liste principale, pour tous les départs.");
  const message = h("p", { class: "message", role: "alert" });
  const dire = () => { aide.hidden = boite.checked; };
  dire();
  boite.addEventListener("change", () => { dire(); champ.focus(); });

  // Ajoute ce qui est tapé. Renvoie false si le nom est refusé (le message dit pourquoi).
  function valider() {
    if (!champ.value.trim()) return true;
    const d = etat.departs[id];
    if (!d) return true;
    const idObjet = identifiant("o");
    const r = creerObjet(listeDuDepart(etat.liste, d), idSac, champ.value, idObjet);
    if (!r.ok) { message.textContent = r.erreur; return false; }
    message.textContent = "";
    champ.value = "";
    if (sacPonctuel || boite.checked) majDepart(id, { ["ponctuels." + idObjet]: { ...r.objet, ordre: Date.now() } });
    else ecrire(() => etat.F.updateDoc(refListe(), { ["objets." + idObjet]: r.objet }), "Objet");
    return true;
  }
  function fermer() {
    if (etat.saisie !== moi) return;
    etat.saisie = null;
    afficher(false);
  }
  const noeud = h("form", {
    class: "saisie-objet",
    onsubmit: e => { e.preventDefault(); if (!champ.value.trim()) fermer(); else if (valider()) champ.focus(); }
  },
    h("div", { class: "saisie-ligne" }, h("span", { class: "cercle pointille", "aria-hidden": "true" }), champ),
    h("div", { class: "saisie-options" },
      sacPonctuel ? h("span", { class: "saisie-texte" }, "Pour ce départ uniquement") : h("label", { class: "saisie-fois" }, boite,
        h("span", { class: "saisie-texte" }, "Seulement cette fois")),
      h("button", { type: "button", class: "petit-bouton", onclick: () => { if (valider()) fermer(); } }, "Terminé")),
    sacPonctuel ? null : aide,
    message);
  const moi = { depart: id, sac: idSac, noeud, champ, valider };
  return moi;
}

/* ---------- Ajouter un sac ---------- */
const PICTOS_SAC = ["sac", "valise", "sacados", "trousse", "bandouliere", "nuit", "repas", "piscine", "papiers", "chaussures", "masque", "apart"];

function feuilleSac(id, depart) {
  const liste = listeDuDepart(etat.liste, depart);
  const absents = sacsAbsents(liste, depart);
  const qui = personnesTriees(liste).filter(p => p.commun || (depart.personnes || []).includes(p.cle));
  const saisie = { proprio: etat.mode === "personne" && qui.some(p => p.cle === etat.choix[id]) ? etat.choix[id] : qui[0].cle, icone: "sac" };
  const nom = h("input", { type: "text", class: "champ", "aria-label": "Nom du sac", placeholder: "Nom du nouveau sac", autocomplete: "off", enterkeyhint: "done" });
  const fois = interrupteur("Seulement cette fois", "Décoché, le sac rejoint la liste principale.");
  const message = h("p", { class: "message", role: "alert" });

  const choixProprio = h("div", { class: "personnes" });
  const choixPicto = h("div", { class: "pictos" });
  function dessiner() {
    choixProprio.replaceChildren(...qui.map(p => h("button", {
      type: "button", class: "personne choix", "aria-pressed": String(p.cle === saisie.proprio),
      onclick: () => { saisie.proprio = p.cle; dessiner(); }
    }, disque(p), h("span", { class: "personne-nom" }, p.nom))));
    choixPicto.replaceChildren(...PICTOS_SAC.filter(n => ICONES[n]).map(n => h("button", {
      type: "button", class: "tuile choix", "aria-pressed": String(n === saisie.icone), "aria-label": "Pictogramme " + n,
      onclick: () => { saisie.icone = n; dessiner(); }
    }, picto(n))));
  }
  dessiner();

  function reprendre(s, ligne) {
    majDepart(id, { sacs: etat.F.arrayUnion(s.id) });
    ligne.remove();
    annonce("« " + s.nom + " » ajouté au départ");
  }

  function creer(e) {
    e.preventDefault();
    const idSac = identifiant("s");
    const r = creerSac(liste, { nom: nom.value, proprio: saisie.proprio, icone: saisie.icone }, idSac);
    if (!r.ok) { message.textContent = r.erreur; return; }
    if (fois.boite.checked) {
      majDepart(id, { ["sacsPonctuels." + idSac]: { ...r.sac, ordre: Date.now() }, sacs: etat.F.arrayUnion(idSac) });
    } else {
      ecrire(() => etat.F.updateDoc(refListe(), { ["sacs." + idSac]: r.sac }), "Sac");
      majDepart(id, { sacs: etat.F.arrayUnion(idSac) });
    }
    etat.choix[id] = saisie.proprio;
    fermerFeuille();
    annonce("« " + r.sac.nom + " » créé. Ouvre-le pour y ajouter des objets.");
  }

  ouvrirFeuille("Ajouter un sac", [
    absents.length ? h("div", { class: "feuille-corps" },
      h("p", { class: "second" }, "Sacs de la liste qui ne sont pas dans ce départ :"),
      h("div", { class: "carte creuse" }, ...absents.map(s => {
        const ligne = h("button", { type: "button", class: "ligne-sac", onclick: () => reprendre(s, ligne) },
          h("span", { class: "tuile" }, picto(s.icone)),
          h("span", { class: "ligne-texte" },
            h("span", { class: "ligne-nom" }, s.nom),
            h("span", { class: "ligne-sous" }, liste.personnes[s.proprio].nom)),
          picto("plus", 22, 2.2));
        return ligne;
      }))) : null,
    h("form", { class: "feuille-corps", onsubmit: creer },
      h("h3", null, "Nouveau sac"),
      nom,
      choixProprio,
      choixPicto,
      fois.el,
      h("button", { type: "submit", class: "bouton" }, "Créer le sac"),
      message)
  ]);
}

/* ---------- Terminer un départ ---------- */
function feuilleFin(id, depart) {
  const garde = interrupteur("Garder comme modèle", "Pour refaire ce départ : mêmes personnes, mêmes sacs, mêmes objets retirés ou ajoutés.", false);
  const nom = h("input", { type: "text", class: "champ", "aria-label": "Nom du modèle", placeholder: "Nom du modèle", autocomplete: "off", enterkeyhint: "done", value: depart.nom });
  const remplace = h("p", { class: "second petit" });
  const zone = h("div", { class: "feuille-corps", hidden: true }, nom, remplace);
  const message = h("p", { class: "message", role: "alert" });
  const dire = () => {
    zone.hidden = !garde.boite.checked;
    remplace.textContent = modeleDeMemeNom(etat.departs, nom.value) ? "Un modèle porte déjà ce nom : il sera remplacé." : "";
  };
  garde.boite.addEventListener("change", dire);
  nom.addEventListener("input", dire);
  dire();

  function terminer(e) {
    e.preventDefault();
    const d = etat.departs[id] || depart;
    let fin = "Départ terminé";
    if (garde.boite.checked) {
      const r = modeleDe(d, nom.value);
      if (!r.ok) { message.textContent = r.erreur; return; }
      const ancien = modeleDeMemeNom(etat.departs, r.modele.nom);
      const { setDoc, addDoc, serverTimestamp } = etat.F;
      const donnees = { ...r.modele, creeLe: serverTimestamp() };
      ecrire(() => ancien ? setDoc(refDepart(ancien), donnees) : addDoc(refDeparts(), donnees), "Modèle");
      fin += ", modèle « " + r.modele.nom + " » enregistré";
    }
    fermerFeuille();
    supprimerDepart(id, fin);
    quitter("#");
  }

  ouvrirFeuille("Terminer « " + depart.nom + " »", [
    h("form", { class: "feuille-corps", onsubmit: terminer },
      h("p", { class: "second" }, "Le départ sera supprimé. La liste principale ne change pas."),
      garde.el,
      zone,
      h("button", { type: "submit", class: "bouton" }, "Terminer le départ"),
      message)
  ]);
}

/* ---------- Import de la liste ---------- */
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
    if (etat.liste && !confirm("Remplacer la liste actuelle par celle-ci ? Les départs en cours pourraient ne plus correspondre.")) return;
    enregistrer.disabled = true;
    try {
      await etat.F.setDoc(refListe(), { ...etat.essai, majLe: etat.F.serverTimestamp() });
      etat.liste = etat.essai; etat.essai = null;
      quitter("#");
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

afficher(true);
initVersion();
demarrer();
