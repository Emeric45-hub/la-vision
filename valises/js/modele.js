// Valises — modèle de la liste principale (fonctions pures, testées sur données fictives).
//
// Liste enregistrée (un seul document) :
//   personnes : { cle: { nom, initiale, couleur, ordre, commun } }
//   sacs      : { id:  { nom, icone, proprio, ordre, office, apart } }
//   objets    : { id:  { nom, sac, ordre, pour? } }
// « commun » : propriétaire partagé, présent à chaque départ.
// « office » : sac proposé d'office à la création d'un départ.
// « apart »  : faux sac regroupant les objets transportés hors sac.
// « pour »   : objet nominatif, masqué quand cette personne ne part pas.

const CLE = /^[a-z0-9][a-z0-9-]{0,23}$/;
const COULEUR = /^#[0-9a-fA-F]{6}$/;
const texte = v => (typeof v === "string" ? v.trim() : "");

// Texte collé par l'utilisateur → liste prête à enregistrer, ou liste d'erreurs lisibles.
export function preparerImport(source) {
  let brut;
  try { brut = JSON.parse(source); }
  catch (e) { return { ok: false, erreurs: ["Le texte collé n'est pas complet ou a été modifié (JSON illisible)."] }; }
  const erreurs = [];
  if (!brut || typeof brut !== "object" || !Array.isArray(brut.personnes) || !Array.isArray(brut.sacs)) {
    return { ok: false, erreurs: ["Il manque la liste des personnes ou celle des sacs."] };
  }

  const personnes = {};
  let communs = 0;
  brut.personnes.forEach((p, i) => {
    const cle = texte(p && p.cle), nom = texte(p && p.nom);
    const lieu = "Personne " + (i + 1);
    if (!CLE.test(cle)) return erreurs.push(lieu + " : clé absente ou invalide.");
    if (personnes[cle]) return erreurs.push(lieu + " : clé « " + cle + " » déjà utilisée.");
    if (!nom) return erreurs.push(lieu + " : nom manquant.");
    if (!COULEUR.test(texte(p.couleur))) return erreurs.push(lieu + " : couleur invalide (attendu #RRGGBB).");
    if (p.commun === true) communs++;
    personnes[cle] = {
      nom, initiale: texte(p.initiale) || nom.charAt(0).toUpperCase(),
      couleur: texte(p.couleur).toUpperCase(), ordre: i, commun: p.commun === true
    };
  });
  if (!Object.keys(personnes).length) erreurs.push("Aucune personne valide.");
  if (communs > 1) erreurs.push("Un seul propriétaire commun est permis.");

  const sacs = {}, objets = {};
  let nObjets = 0;
  brut.sacs.forEach((s, i) => {
    const nom = texte(s && s.nom), proprio = texte(s && s.proprio);
    const lieu = "Sac " + (i + 1) + (nom ? " (" + nom + ")" : "");
    if (!nom) return erreurs.push(lieu + " : nom manquant.");
    if (!personnes[proprio]) return erreurs.push(lieu + " : propriétaire inconnu.");
    if (!Array.isArray(s.objets)) return erreurs.push(lieu + " : liste d'objets manquante.");
    const id = "s" + (i + 1);
    sacs[id] = {
      nom, proprio, ordre: i, icone: texte(s.icone) || "sac",
      office: s.office !== false, apart: s.apart === true
    };
    s.objets.forEach((o, j) => {
      const nomObjet = texte(typeof o === "string" ? o : o && o.nom);
      const pour = typeof o === "string" ? "" : texte(o && o.pour);
      if (!nomObjet) return erreurs.push(lieu + " : objet " + (j + 1) + " sans nom.");
      if (pour && (!personnes[pour] || personnes[pour].commun)) {
        return erreurs.push(lieu + " : objet « " + nomObjet + " » attribué à une personne inconnue.");
      }
      const objet = { nom: nomObjet, sac: id, ordre: j };
      if (pour) objet.pour = pour;
      objets["o" + (++nObjets)] = objet;
    });
  });
  if (!Object.keys(sacs).length) erreurs.push("Aucun sac valide.");

  if (erreurs.length) return { ok: false, erreurs };
  const liste = { personnes, sacs, objets };
  return { ok: true, liste, resume: compter(liste) };
}

const parOrdre = (a, b) => a.ordre - b.ordre;

export function personnesTriees(liste) {
  return Object.entries(liste.personnes || {}).map(([cle, p]) => ({ cle, ...p })).sort(parOrdre);
}

export function sacsDe(liste, clePersonne) {
  return Object.entries(liste.sacs || {})
    .filter(([, s]) => s.proprio === clePersonne)
    .map(([id, s]) => ({ id, ...s })).sort(parOrdre);
}

export function objetsDe(liste, idSac) {
  return Object.entries(liste.objets || {})
    .filter(([, o]) => o.sac === idSac)
    .map(([id, o]) => ({ id, ...o })).sort(parOrdre);
}

export function compter(liste) {
  return {
    personnes: Object.keys(liste.personnes || {}).length,
    sacs: Object.keys(liste.sacs || {}).length,
    objets: Object.keys(liste.objets || {}).length
  };
}

// « 1 objet », « 3 objets ».
export function pluriel(n, mot) {
  return n + " " + mot + (n > 1 ? "s" : "");
}

/* ---------- Départs ----------
   Un départ (document à part) : { nom, destination?, debut?, fin?, personnes: [clé], sacs: [id],
   coches: { idObjet: true }, retires: { idObjet: true }, creeLe }.
   Il ne copie rien de la liste principale : il dit seulement qui part, quels sacs, et l'état des objets. */

const partants = depart => new Set(depart.personnes || []);

function objetVisible(o, id, depart, qui) {
  if (depart.retires && depart.retires[id]) return false;
  return !o.pour || qui.has(o.pour);
}

// Objets à préparer dans un sac pour ce départ (retirés et nominatifs absents exclus).
export function objetsDuDepart(liste, depart, idSac) {
  const qui = partants(depart);
  return objetsDe(liste, idSac)
    .filter(o => objetVisible(o, o.id, depart, qui))
    .map(o => ({ id: o.id, nom: o.nom, coche: !!(depart.coches && depart.coches[o.id]) }));
}

// Sacs du départ, dans l'ordre des propriétaires puis des sacs ; un sac sans objet à préparer est omis.
export function sacsDuDepart(liste, depart, clePersonne) {
  const rang = {};
  personnesTriees(liste).forEach((p, i) => { rang[p.cle] = i; });
  return (depart.sacs || [])
    .filter(id => liste.sacs[id] && (!clePersonne || liste.sacs[id].proprio === clePersonne))
    .map(id => {
      const objets = objetsDuDepart(liste, depart, id);
      const fait = objets.filter(o => o.coche).length;
      // Un sac reste affiché s'il a des objets à préparer, des objets retirés à pouvoir remettre, ou s'il est
      // réellement vide (sac tout neuf) ; il n'est omis que si tout son contenu concerne des absents.
      const garde = objets.length > 0 || retiresDuSac(liste, depart, id).length > 0 || objetsDe(liste, id).length === 0;
      return { id, ...liste.sacs[id], fait, total: objets.length, pret: objets.length > 0 && fait === objets.length, garde };
    })
    .filter(s => s.garde)
    .sort((a, b) => (rang[a.proprio] - rang[b.proprio]) || (a.ordre - b.ordre));
}

// Propriétaires à afficher : ceux qui partent et le propriétaire commun, s'ils ont au moins un sac.
export function proprietairesDuDepart(liste, depart) {
  const qui = partants(depart);
  return personnesTriees(liste)
    .filter(p => p.commun || qui.has(p.cle))
    .map(p => {
      const sacs = sacsDuDepart(liste, depart, p.cle);
      return { ...p, fait: sacs.reduce((n, s) => n + s.fait, 0), total: sacs.reduce((n, s) => n + s.total, 0), sacs: sacs.length };
    })
    .filter(p => p.sacs > 0);
}

export function avancement(liste, depart) {
  const sacs = sacsDuDepart(liste, depart);
  return { fait: sacs.reduce((n, s) => n + s.fait, 0), total: sacs.reduce((n, s) => n + s.total, 0) };
}

// Sac précédent et sac suivant, dans l'ordre d'affichage du départ.
export function voisins(liste, depart, idSac) {
  const ids = sacsDuDepart(liste, depart).map(s => s.id);
  const i = ids.indexOf(idSac);
  return { precedent: i > 0 ? ids[i - 1] : null, suivant: i >= 0 && i < ids.length - 1 ? ids[i + 1] : null };
}

// Sacs proposés à la création d'un départ ; « coche » vaut le réglage « proposé d'office ».
export function sacsProposes(liste, clesPersonnes) {
  const qui = new Set(clesPersonnes);
  const rang = {};
  personnesTriees(liste).forEach((p, i) => { rang[p.cle] = i; });
  return Object.entries(liste.sacs || {})
    .filter(([, s]) => liste.personnes[s.proprio] && (liste.personnes[s.proprio].commun || qui.has(s.proprio)))
    .map(([id, s]) => ({ id, ...s, coche: s.office !== false }))
    .sort((a, b) => (rang[a.proprio] - rang[b.proprio]) || (a.ordre - b.ordre));
}

const JOUR = /^\d{4}-\d{2}-\d{2}$/;

// Saisie du formulaire → document du départ, ou message d'erreur.
// Avec un modèle, le départ reprend aussi ce que le modèle avait retiré ou ajouté « seulement cette fois ».
export function nouveauDepart(listePrincipale, saisie, modele) {
  const liste = modele ? listeDuDepart(listePrincipale, modele) : listePrincipale;
  const nom = texte(saisie.nom);
  if (!nom) return { ok: false, erreur: "Donne un nom au départ." };
  const personnes = personnesTriees(liste).filter(p => !p.commun && (saisie.personnes || []).includes(p.cle)).map(p => p.cle);
  if (!personnes.length) return { ok: false, erreur: "Choisis au moins une personne." };
  const permis = new Set(sacsProposes(liste, personnes).map(s => s.id));
  const sacs = (saisie.sacs || []).filter(id => permis.has(id));
  if (!sacs.length) return { ok: false, erreur: "Garde au moins un sac." };
  const depart = { nom, personnes, sacs, coches: {}, retires: {} };
  if (modele) {
    const garde = new Set(sacs);
    depart.retires = garder(modele.retires, id => liste.objets[id]);
    const sacsPonctuels = garder(modele.sacsPonctuels, id => garde.has(id));
    const ponctuels = garder(modele.ponctuels, (id, o) => garde.has(o.sac));
    if (Object.keys(sacsPonctuels).length) depart.sacsPonctuels = sacsPonctuels;
    if (Object.keys(ponctuels).length) depart.ponctuels = ponctuels;
  }
  const destination = texte(saisie.destination);
  if (destination) depart.destination = destination;
  let debut = JOUR.test(saisie.debut || "") ? saisie.debut : "", fin = JOUR.test(saisie.fin || "") ? saisie.fin : "";
  if (debut && fin && fin < debut) [debut, fin] = [fin, debut];
  if (debut) depart.debut = debut;
  if (fin && fin !== debut) depart.fin = fin;
  return { ok: true, depart };
}

// « 28 novembre », « 28 au 29 novembre », « 28 novembre au 2 décembre ».
export function periode(debut, fin) {
  if (!JOUR.test(debut || "")) return "";
  const jour = iso => Number(iso.slice(8));
  const mois = iso => new Date(iso + "T12:00:00Z").toLocaleDateString("fr-FR", { month: "long", timeZone: "UTC" });
  const un = iso => (jour(iso) === 1 ? "1er" : jour(iso)) + " " + mois(iso);
  if (!JOUR.test(fin || "") || fin === debut) return un(debut);
  if (debut.slice(0, 7) === fin.slice(0, 7)) return (jour(debut) === 1 ? "1er" : jour(debut)) + " au " + un(fin);
  return un(debut) + " au " + un(fin);
}

// Départs triés : ceux qui ont une date d'abord (la plus proche en tête), puis par nom.
export function departsTries(departs) {
  return Object.entries(departs || {}).filter(([, d]) => !d.modele).map(([id, d]) => ({ id, ...d }))
    .sort((a, b) => (a.debut || "9999").localeCompare(b.debut || "9999") || a.nom.localeCompare(b.nom, "fr"));
}

/* ---------- Gestes dans un départ ----------
   Ajouts « seulement cette fois » : le départ porte ses propres objets (`ponctuels`) et sacs
   (`sacsPonctuels`), au même format que la liste principale. Les écrans d'un départ travaillent
   sur la liste principale complétée par ces ajouts. */
export function listeDuDepart(liste, depart) {
  return {
    personnes: liste.personnes,
    sacs: { ...liste.sacs, ...(depart.sacsPonctuels || {}) },
    objets: { ...liste.objets, ...(depart.ponctuels || {}) }
  };
}

// Objets retirés de ce départ dans un sac (ceux qu'on peut remettre).
export function retiresDuSac(liste, depart, idSac) {
  const qui = partants(depart);
  return objetsDe(liste, idSac)
    .filter(o => depart.retires && depart.retires[o.id] && (!o.pour || qui.has(o.pour)))
    .map(o => ({ id: o.id, nom: o.nom }));
}

// Sacs existants qu'on pourrait encore ajouter à ce départ (ceux des partants et du commun).
export function sacsAbsents(liste, depart) {
  const pris = new Set(depart.sacs || []);
  return sacsProposes(liste, depart.personnes || []).filter(s => !pris.has(s.id));
}

const suivant = (table, filtre) => Object.values(table || {}).filter(filtre).reduce((m, x) => Math.max(m, x.ordre + 1), 0);

// Nouvel objet à la fin d'un sac. `id` est fourni par l'appelant (identifiant unique).
export function creerObjet(liste, idSac, nom, id) {
  const propre = texte(nom);
  if (!propre) return { ok: false, erreur: "Donne un nom à l'objet." };
  if (!liste.sacs[idSac]) return { ok: false, erreur: "Ce sac n'existe plus." };
  return { ok: true, id, objet: { nom: propre, sac: idSac, ordre: suivant(liste.objets, o => o.sac === idSac) } };
}

// Nouveau sac à la fin de ceux de son propriétaire.
export function creerSac(liste, saisie, id) {
  const nom = texte(saisie.nom);
  if (!nom) return { ok: false, erreur: "Donne un nom au sac." };
  if (!liste.personnes[saisie.proprio]) return { ok: false, erreur: "Choisis à qui est ce sac." };
  return {
    ok: true, id,
    sac: { nom, proprio: saisie.proprio, icone: texte(saisie.icone) || "sac", ordre: suivant(liste.sacs, x => x.proprio === saisie.proprio), office: true, apart: false }
  };
}

// Tout cocher (ou tout décocher) un sac : liste des objets dont l'état doit changer.
export function aBasculer(liste, depart, idSac, cocher) {
  return objetsDuDepart(liste, depart, idSac).filter(o => o.coche !== cocher).map(o => o.id);
}

/* ---------- Modèles ---------- */
// Un modèle est rangé avec les départs, marqué `modele: true` : qui part, quels sacs, ce qui a été retiré
// ou ajouté. Il ne retient aucune coche, et un objet ajouté plus tard à la liste principale y apparaît.

const garder = (table, test) => Object.fromEntries(Object.entries(table || {}).filter(([id, v]) => test(id, v)));

export function modelesTries(departs) {
  return Object.entries(departs || {}).filter(([, d]) => d.modele).map(([id, d]) => ({ id, ...d }))
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}

export function modeleDe(depart, nom) {
  const propre = texte(nom);
  if (!propre) return { ok: false, erreur: "Donne un nom au modèle." };
  const modele = { modele: true, nom: propre, personnes: [...(depart.personnes || [])], sacs: [...(depart.sacs || [])], retires: { ...(depart.retires || {}) } };
  if (depart.sacsPonctuels && Object.keys(depart.sacsPonctuels).length) modele.sacsPonctuels = { ...depart.sacsPonctuels };
  if (depart.ponctuels && Object.keys(depart.ponctuels).length) modele.ponctuels = { ...depart.ponctuels };
  return { ok: true, modele };
}

// Identifiant du modèle qui porte déjà ce nom (sans tenir compte des majuscules), pour le remplacer.
export function modeleDeMemeNom(departs, nom) {
  const cherche = texte(nom).toLocaleLowerCase("fr");
  const trouve = modelesTries(departs).find(m => m.nom.toLocaleLowerCase("fr") === cherche);
  return trouve ? trouve.id : null;
}

// Point de départ du formulaire « Nouveau départ » d'après un modèle : les partants qui existent encore.
export function partantsDuModele(liste, modele) {
  return personnesTriees(liste).filter(p => !p.commun && (modele.personnes || []).includes(p.cle)).map(p => p.cle);
}

/* ---------- Édition de la liste principale ---------- */
// Ces fonctions ne modifient rien : elles disent quels champs écrire. `null` veut dire « champ à supprimer ».

// Déplace un élément d'un cran dans une suite triée et renvoie { id: nouvel ordre } pour ceux qui changent.
// On renumérote toute la suite : les ordres hérités peuvent avoir des trous ou des doublons.
function decaler(suite, id, sens) {
  const ids = suite.map(x => x.id);
  const i = ids.indexOf(id), j = i + sens;
  if (i < 0 || j < 0 || j >= ids.length) return {};
  [ids[i], ids[j]] = [ids[j], ids[i]];
  const anciens = Object.fromEntries(suite.map(x => [x.id, x.ordre]));
  return Object.fromEntries(ids.map((x, n) => [x, n]).filter(([x, n]) => anciens[x] !== n));
}

export function deplacerObjet(liste, idObjet, sens) {
  const o = liste.objets[idObjet];
  return o ? decaler(objetsDe(liste, o.sac), idObjet, sens) : {};
}

export function deplacerSac(liste, idSac, sens) {
  const s = liste.sacs[idSac];
  return s ? decaler(sacsDe(liste, s.proprio), idSac, sens) : {};
}

// Un objet ne peut être réservé à une personne (« seulement si elle part ») que dans un sac commun.
export function personnesPour(liste, idSac) {
  const sac = liste.sacs[idSac];
  if (!sac || !liste.personnes[sac.proprio] || !liste.personnes[sac.proprio].commun) return [];
  return personnesTriees(liste).filter(p => !p.commun);
}

export function modifierObjet(liste, idObjet, saisie) {
  const o = liste.objets[idObjet];
  if (!o) return { ok: false, erreur: "Cet objet n'existe plus." };
  const nom = texte(saisie.nom);
  if (!nom) return { ok: false, erreur: "Donne un nom à l'objet." };
  const permis = personnesPour(liste, o.sac).some(p => p.cle === saisie.pour);
  return { ok: true, champs: { nom, pour: permis ? saisie.pour : null } };
}

export function modifierSac(liste, idSac, saisie) {
  const s = liste.sacs[idSac];
  if (!s) return { ok: false, erreur: "Ce sac n'existe plus." };
  const nom = texte(saisie.nom);
  if (!nom) return { ok: false, erreur: "Donne un nom au sac." };
  const proprio = saisie.proprio || s.proprio;
  if (!liste.personnes[proprio]) return { ok: false, erreur: "Choisis à qui est ce sac." };
  const champs = { nom, icone: texte(saisie.icone) || s.icone || "sac", office: saisie.office !== false };
  let sansPour = [];
  if (proprio !== s.proprio) {
    champs.proprio = proprio;
    champs.ordre = suivant(liste.sacs, x => x.proprio === proprio);
    // Chez une personne, « seulement si untel part » n'a plus de sens.
    if (!liste.personnes[proprio].commun) sansPour = objetsDe(liste, idSac).filter(o => o.pour).map(o => o.id);
  }
  return { ok: true, champs, sansPour };
}

// Ce qu'il faut retirer pour supprimer un sac, et de quoi le rétablir à l'identique.
export function contenuDuSac(liste, idSac) {
  const sac = liste.sacs[idSac];
  if (!sac) return null;
  return { sac, objets: Object.fromEntries(objetsDe(liste, idSac).map(({ id, ...o }) => [id, o])) };
}
