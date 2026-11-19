// Valises — coquille de l'app : connexion au compte famille, lecture en direct de la liste
// principale et des départs, navigation, écrans. Firebase est chargé à part : si son
// chargement échoue, la page reste affichée et le dit.
import {
  preparerImport, personnesTriees, sacsDe, objetsDe, compter, pluriel,
  objetsDuDepart, sacsDuDepart, proprietairesDuDepart, avancement, voisins,
  sacsProposes, nouveauDepart, periode, departsTries
} from "./modele.js";
import { picto } from "./icones.js";

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

function cocher(idDepart, idObjet, valeur) {
  const { updateDoc, deleteField } = etat.F;
  ecrire(() => updateDoc(refDepart(idDepart), { ["coches." + idObjet]: valeur ? true : deleteField() }), "Changement");
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

function afficher(enHaut) {
  const r = route();
  const depart = r.nom === "depart" ? etat.departs[r.a] : null;
  let vue;
  if (!etat.lue) vue = [h("h1", null, "Valises")];
  else if (r.nom === "import") vue = vueImport();
  else if (!etat.liste) vue = vueVide();
  else if (r.nom === "liste") vue = vueListe();
  else if (r.nom === "sac" && etat.liste.sacs[r.a]) vue = vueSac(r.a);
  else if (r.nom === "nouveau") vue = vueNouveau();
  else if (depart && r.b) vue = vueValise(r.a, depart, r.b);
  else if (depart) vue = vueDepart(r.a, depart);
  else vue = vueAccueil();
  $("ecran").replaceChildren(...vue);
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
  const total = compter(liste);
  return [
    h("h1", null, "Valises"),
    departs.length
      ? h("div", { class: "pile" }, ...departs.map(d => {
        const av = avancement(liste, d);
        const sous = [d.destination, periode(d.debut, d.fin)].filter(Boolean).join(", ");
        return h("a", { class: "carte bloc carte-depart", href: "#depart/" + encodeURIComponent(d.id) },
          h("span", { class: "depart-nom" }, d.nom),
          sous ? h("span", { class: "ligne-sous" }, sous) : null,
          barre(av.fait, av.total));
      }))
      : h("p", { class: "second sous-titre" }, "Aucun départ en préparation."),
    h("a", { class: "bouton espace", href: "#nouveau" }, "Nouveau départ"),
    h("a", { class: "bouton secondaire", href: "#liste" }, "Liste principale"),
    h("p", { class: "second petit centre" }, pluriel(total.sacs, "sac") + ", " + pluriel(total.objets, "objet")),
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
function vueNouveau() {
  const liste = etat.liste;
  const personnes = personnesTriees(liste).filter(p => !p.commun);
  if (!etat.brouillon) {
    etat.brouillon = { nom: "", destination: "", debut: "", fin: "", personnes: new Set(personnes.map(p => p.cle)), bascules: {}, ouvert: false };
  }
  const b = etat.brouillon;
  const proposes = sacsProposes(liste, [...b.personnes]).map(s => ({ ...s, coche: s.id in b.bascules ? b.bascules[s.id] : s.coche }));
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
      }, coche(s.coche), h("span", { class: "coche-nom" }, s.nom))))
    ]);

  async function creer(e) {
    const r = nouveauDepart(liste, { nom: b.nom, destination: b.destination, debut: b.debut, fin: b.fin, personnes: [...b.personnes], sacs: retenus });
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
  const liste = etat.liste;
  const props = proprietairesDuDepart(liste, depart);
  const av = avancement(liste, depart);
  const sous = [depart.destination, periode(depart.debut, depart.fin)].filter(Boolean).join(", ");
  const lien = s => "#depart/" + encodeURIComponent(id) + "/" + encodeURIComponent(s.id);

  const ligne = (s, detail) => h("a", { class: "ligne-sac", href: lien(s) },
    h("span", { class: "tuile" + (s.pret ? " pret" : "") }, s.pret ? picto("coche", 26, 2.6) : picto(s.icone)),
    h("span", { class: "ligne-texte" },
      h("span", { class: "ligne-nom" }, s.nom),
      h("span", { class: "ligne-sous" + (s.pret ? " pret" : "") },
        detail ? detail + ", " + (s.pret ? "prêt" : s.fait + " sur " + s.total) : (s.pret ? "Prêt" : s.fait + " sur " + s.total))),
    picto("chevron", 22, 2));
  const majuscule = t => t.charAt(0).toUpperCase() + t.slice(1);

  const bascule = h("div", { class: "bascule", role: "group", "aria-label": "Présentation" },
    ...[["personne", "Par personne"], ["sac", "Par sac"]].map(([m, texte]) => h("button", {
      type: "button", "aria-pressed": String(etat.mode === m), onclick: () => { etat.mode = m; afficher(false); }
    }, texte)));

  let corps;
  if (!props.length) {
    corps = [h("p", { class: "second sous-titre" }, "Ce départ ne contient plus aucun objet à préparer.")];
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

  function supprimer() {
    if (!confirm("Supprimer ce départ ? Les objets cochés seront oubliés, la liste principale ne change pas.")) return;
    ecrire(() => etat.F.deleteDoc(refDepart(id)), "Suppression");
    delete etat.departs[id];
    quitter("#");
  }

  return [
    h("div", { class: "barre" }, lienRetour("Départs", "#")),
    h("h1", null, depart.nom),
    sous ? h("p", { class: "second sous-titre" }, majuscule(sous)) : null,
    barre(av.fait, av.total),
    bascule,
    ...corps,
    h("button", { type: "button", class: "lien-discret", onclick: supprimer }, "Supprimer ce départ")
  ];
}

/* ---------- Mode valise : un sac à la fois ---------- */
function vueValise(id, depart, idSac) {
  const liste = etat.liste;
  const sac = sacsDuDepart(liste, depart).find(s => s.id === idSac);
  if (!sac) return vueDepart(id, depart);
  const proprio = liste.personnes[sac.proprio];
  const objets = objetsDuDepart(liste, depart, idSac);
  const v = voisins(liste, depart, idSac);
  const base = "#depart/" + encodeURIComponent(id);
  const vers = s => base + "/" + encodeURIComponent(s);

  return [
    h("div", { class: "barre" },
      lienRetour(depart.nom, base),
      h("span", { class: "puce" }, disque(proprio, "petit"), h("span", null, proprio.nom))),
    h("h1", null, sac.nom),
    barre(sac.fait, sac.total),
    h("div", { class: "carte espace" }, ...objets.map(o => h("button", {
      type: "button", class: "ligne-coche", "aria-pressed": String(o.coche),
      onclick: () => cocher(id, o.id, !o.coche)
    }, coche(o.coche), h("span", { class: "coche-nom" }, o.nom)))),
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
