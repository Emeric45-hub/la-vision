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
