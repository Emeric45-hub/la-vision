// Tests du modèle de Valises sur une famille fictive.
import assert from 'node:assert/strict';
import { preparerImport, personnesTriees, sacsDe, objetsDe, compter, pluriel } from '../valises/js/modele.js';

const source = {
  personnes: [
    { cle: 'enfant1', nom: 'Alex', couleur: '#aa3355' },
    { cle: 'adulte1', nom: 'Camille', initiale: 'Ca', couleur: '#2468D6' },
    { cle: 'commun', nom: 'Commun', couleur: '#7A5C48', commun: true }
  ],
  sacs: [
    { proprio: 'enfant1', nom: 'Trousse', icone: 'trousse', objets: ['Brosse', 'Savon'] },
    { proprio: 'adulte1', nom: 'Sac de sport', office: false, objets: ['Gourde'] },
    { proprio: 'commun', nom: 'Papiers', icone: 'papiers', objets: [{ nom: 'Carte fictive', pour: 'enfant1' }, 'Clés'] },
    { proprio: 'commun', nom: 'À part', apart: true, objets: [] }
  ]
};

// Import valide : identifiants, ordre, valeurs par défaut.
const r = preparerImport(JSON.stringify(source));
assert.equal(r.ok, true);
assert.deepEqual(r.resume, { personnes: 3, sacs: 4, objets: 5 });
assert.deepEqual(compter(r.liste), r.resume);
assert.deepEqual(personnesTriees(r.liste).map(p => p.cle), ['enfant1', 'adulte1', 'commun']);
assert.equal(r.liste.personnes.enfant1.initiale, 'A');
assert.equal(r.liste.personnes.enfant1.couleur, '#AA3355');
assert.equal(r.liste.personnes.adulte1.initiale, 'Ca');
assert.equal(r.liste.personnes.commun.commun, true);
assert.equal(r.liste.personnes.enfant1.commun, false);
assert.deepEqual(sacsDe(r.liste, 'commun').map(s => s.nom), ['Papiers', 'À part']);
assert.equal(r.liste.sacs.s1.office, true);
assert.equal(r.liste.sacs.s2.office, false);
assert.equal(r.liste.sacs.s2.icone, 'sac');
assert.equal(r.liste.sacs.s4.apart, true);
assert.deepEqual(objetsDe(r.liste, 's1').map(o => o.nom), ['Brosse', 'Savon']);
const papiers = objetsDe(r.liste, 's3');
assert.equal(papiers[0].pour, 'enfant1');
assert.equal('pour' in papiers[1], false);
assert.deepEqual(objetsDe(r.liste, 's4'), []);

// Texte illisible ou incomplet.
assert.equal(preparerImport('{"personnes": [').ok, false);
assert.equal(preparerImport('{}').ok, false);
assert.equal(preparerImport('null').ok, false);

// Erreurs nommées, sans arrêt à la première.
const faux = structuredClone(source);
faux.personnes[1].couleur = 'bleu';
faux.sacs[0].proprio = 'inconnu';
faux.sacs[2].objets[0].pour = 'commun';
faux.sacs[1].objets.push('');
const e = preparerImport(JSON.stringify(faux));
assert.equal(e.ok, false);
assert.equal(e.erreurs.length, 4);
assert.ok(e.erreurs.some(m => m.includes('couleur')));
assert.ok(e.erreurs.some(m => m.includes('propriétaire inconnu')));

// Clé en double, deux propriétaires communs.
const double = structuredClone(source);
double.personnes[1].cle = 'enfant1';
assert.equal(preparerImport(JSON.stringify(double)).ok, false);
const deuxCommuns = structuredClone(source);
deuxCommuns.personnes[0].commun = true;
assert.equal(preparerImport(JSON.stringify(deuxCommuns)).ok, false);

assert.equal(pluriel(1, 'objet'), '1 objet');
assert.equal(pluriel(0, 'objet'), '0 objet');
assert.equal(pluriel(12, 'sac'), '12 sacs');
console.log('valises : tous les scénarios passent');

// ---------- Départs ----------
import { objetsDuDepart, sacsDuDepart, proprietairesDuDepart, avancement, voisins, sacsProposes, nouveauDepart, periode, departsTries } from '../valises/js/modele.js';

const liste = r.liste; // s1 (enfant1), s2 (adulte1, occasionnel), s3 (commun, 1 objet nominatif enfant1), s4 (commun, vide)

// Sacs proposés : ceux des partants et du commun ; l'occasionnel est décoché.
const prop = sacsProposes(liste, ['adulte1']);
assert.deepEqual(prop.map(s => [s.id, s.coche]), [['s2', false], ['s3', true], ['s4', true]]);
assert.deepEqual(sacsProposes(liste, ['enfant1', 'adulte1']).map(s => s.id), ['s1', 's2', 's3', 's4']);

// Création : validations et nettoyage.
assert.equal(nouveauDepart(liste, { nom: ' ', personnes: ['adulte1'], sacs: ['s2'] }).ok, false);
assert.equal(nouveauDepart(liste, { nom: 'Essai', personnes: [], sacs: ['s2'] }).ok, false);
assert.equal(nouveauDepart(liste, { nom: 'Essai', personnes: ['commun'], sacs: ['s3'] }).ok, false);
assert.equal(nouveauDepart(liste, { nom: 'Essai', personnes: ['adulte1'], sacs: ['s1'] }).ok, false); // sac d'un absent
const cree = nouveauDepart(liste, { nom: ' Essai ', destination: ' Ailleurs ', debut: '2030-03-09', fin: '2030-03-07', personnes: ['adulte1', 'inconnu'], sacs: ['s1', 's2', 's3', 's4'] });
assert.equal(cree.ok, true);
assert.deepEqual(cree.depart, { nom: 'Essai', personnes: ['adulte1'], sacs: ['s2', 's3', 's4'], coches: {}, retires: {}, destination: 'Ailleurs', debut: '2030-03-07', fin: '2030-03-09' });
assert.equal('fin' in nouveauDepart(liste, { nom: 'x', debut: '2030-03-07', fin: '2030-03-07', personnes: ['adulte1'], sacs: ['s2'] }).depart, false);

// Un adulte seul : l'objet nominatif de l'enfant absent est masqué ; le sac commun réellement vide reste affiché.
const seul = { ...cree.depart, coches: { o3: true } }; // o3 = Gourde (s2)
assert.deepEqual(objetsDuDepart(liste, seul, 's3').map(o => o.nom), ['Clés']);
assert.deepEqual(sacsDuDepart(liste, seul).map(s => [s.id, s.fait, s.total, s.pret]), [['s2', 1, 1, true], ['s3', 0, 1, false], ['s4', 0, 0, false]]);
assert.deepEqual(proprietairesDuDepart(liste, seul).map(p => [p.cle, p.fait, p.total]), [['adulte1', 1, 1], ['commun', 0, 1]]);
assert.deepEqual(avancement(liste, seul), { fait: 1, total: 2 });
assert.deepEqual(voisins(liste, seul, 's2'), { precedent: null, suivant: 's3' });
assert.deepEqual(voisins(liste, seul, 's3'), { precedent: 's2', suivant: 's4' });
assert.deepEqual(voisins(liste, seul, 's1'), { precedent: null, suivant: null });

// Toute la famille : l'objet nominatif revient ; un objet retiré disparaît du compte.
const tous = { nom: 'T', personnes: ['enfant1', 'adulte1'], sacs: ['s1', 's3', 'disparu'], coches: { o1: true, o2: true }, retires: { o5: true } };
assert.deepEqual(objetsDuDepart(liste, tous, 's3').map(o => o.nom), ['Carte fictive']);
assert.deepEqual(sacsDuDepart(liste, tous).map(s => [s.id, s.pret]), [['s1', true], ['s3', false]]);
assert.deepEqual(sacsDuDepart(liste, tous, 'commun').map(s => s.id), ['s3']);
assert.deepEqual(avancement(liste, tous), { fait: 2, total: 3 });
assert.deepEqual(proprietairesDuDepart(liste, tous).map(p => p.cle), ['enfant1', 'commun']); // adulte1 n'a aucun sac retenu

// Dates et tri.
assert.equal(periode('2030-11-28', '2030-11-29'), '28 au 29 novembre');
assert.equal(periode('2030-11-28', ''), '28 novembre');
assert.equal(periode('2030-11-28', '2030-12-02'), '28 novembre au 2 décembre');
assert.equal(periode('2030-11-01', '2030-11-03'), '1er au 3 novembre');
assert.equal(periode('', '2030-11-03'), '');
assert.deepEqual(departsTries({ a: { nom: 'Zèbre' }, b: { nom: 'Été', debut: '2030-07-01' }, c: { nom: 'Avril', debut: '2030-04-01' }, d: { nom: 'Abri' } }).map(d => d.id), ['c', 'b', 'd', 'a']);
console.log('valises, départs : tous les scénarios passent');

// ---------- Gestes dans un départ ----------
import { listeDuDepart, retiresDuSac, sacsAbsents, creerObjet, creerSac, aBasculer } from '../valises/js/modele.js';

// Un sac dont tout le contenu concerne un absent est omis ; il revient si la personne part.
const nominatif = preparerImport(JSON.stringify({
  personnes: source.personnes,
  sacs: [{ proprio: 'commun', nom: 'Documents', objets: [{ nom: 'Carte fictive', pour: 'enfant1' }] }, { proprio: 'adulte1', nom: 'Sac', objets: ['Gourde'] }]
})).liste;
assert.deepEqual(sacsDuDepart(nominatif, { personnes: ['adulte1'], sacs: ['s1', 's2'] }).map(s => s.id), ['s2']);
assert.deepEqual(sacsDuDepart(nominatif, { personnes: ['enfant1', 'adulte1'], sacs: ['s1', 's2'] }).map(s => s.id), ['s2', 's1']);

// Retirer tous les objets d'un sac ne le fait pas disparaître : on doit pouvoir les remettre.
const vide = { nom: 'V', personnes: ['enfant1'], sacs: ['s1'], coches: {}, retires: { o1: true, o2: true } };
assert.deepEqual(sacsDuDepart(liste, vide).map(s => [s.id, s.total, s.pret]), [['s1', 0, false]]);
assert.deepEqual(retiresDuSac(liste, vide, 's1').map(o => o.nom), ['Brosse', 'Savon']);
assert.deepEqual(retiresDuSac(liste, tous, 's3').map(o => o.id), ['o5']);
assert.deepEqual(proprietairesDuDepart(liste, vide).map(p => [p.cle, p.total]), [['enfant1', 0]]);

// Sacs qu'on peut encore ajouter.
assert.deepEqual(sacsAbsents(liste, seul).map(s => s.id), []);
assert.deepEqual(sacsAbsents(liste, { personnes: ['adulte1'], sacs: ['s3'] }).map(s => s.id), ['s2', 's4']);

// Création d'un objet et d'un sac.
assert.equal(creerObjet(liste, 's1', '  ', 'x').ok, false);
assert.equal(creerObjet(liste, 'inconnu', 'Peigne', 'x').ok, false);
assert.deepEqual(creerObjet(liste, 's1', ' Peigne ', 'oX'), { ok: true, id: 'oX', objet: { nom: 'Peigne', sac: 's1', ordre: 2 } });
assert.equal(creerObjet(liste, 's4', 'Ballon', 'oY').objet.ordre, 0);
assert.equal(creerSac(liste, { nom: '', proprio: 'adulte1' }, 'x').ok, false);
assert.equal(creerSac(liste, { nom: 'Sac', proprio: 'personne' }, 'x').ok, false);
assert.deepEqual(creerSac(liste, { nom: ' Glacière ', proprio: 'commun', icone: 'repas' }, 'sX'),
  { ok: true, id: 'sX', sac: { nom: 'Glacière', proprio: 'commun', icone: 'repas', ordre: 4, office: true, apart: false } });

// Ajouts « seulement cette fois » : vus dans le départ, absents de la liste principale.
const ponctuel = { nom: 'P', personnes: ['enfant1'], sacs: ['s1', 'sP'], coches: { oP: true },
  ponctuels: { oP: { nom: 'Lampe', sac: 's1', ordre: 99 }, oQ: { nom: 'Jeu', sac: 'sP', ordre: 0 } },
  sacsPonctuels: { sP: { nom: 'Sac en plus', proprio: 'enfant1', icone: 'sac', ordre: 50, office: true, apart: false } } };
const L = listeDuDepart(liste, ponctuel);
assert.deepEqual(objetsDuDepart(L, ponctuel, 's1').map(o => [o.nom, o.coche]), [['Brosse', false], ['Savon', false], ['Lampe', true]]);
assert.deepEqual(sacsDuDepart(L, ponctuel).map(s => s.nom), ['Trousse', 'Sac en plus']);
assert.equal('oP' in liste.objets, false);
assert.deepEqual(avancement(L, ponctuel), { fait: 1, total: 4 });

// Tout cocher, tout décocher.
assert.deepEqual(aBasculer(L, ponctuel, 's1', true), ['o1', 'o2']);
assert.deepEqual(aBasculer(L, ponctuel, 's1', false), ['oP']);
console.log('valises, gestes : tous les scénarios passent');

// ---------- Modèles ----------
const { modeleDe, modelesTries, modeleDeMemeNom, partantsDuModele, departsTries: tries, nouveauDepart: creerDepart } = await import('../valises/js/modele.js');
assert.equal(modeleDe(ponctuel, '  ').ok, false);
const m = modeleDe({ ...ponctuel, retires: { o2: true }, destination: 'Ailleurs', debut: '2031-01-02' }, ' Week-end type ').modele;
assert.deepEqual(Object.keys(m).sort(), ['modele', 'nom', 'personnes', 'ponctuels', 'retires', 'sacs', 'sacsPonctuels']);
assert.equal(m.nom, 'Week-end type');
assert.equal('coches' in m, false);

// Un modèle n'est pas un départ en cours.
const rangement = { d1: { nom: 'Vrai départ', personnes: ['enfant1'], sacs: ['s1'] }, m1: m };
assert.deepEqual(tries(rangement).map(d => d.id), ['d1']);
assert.deepEqual(modelesTries(rangement).map(d => d.id), ['m1']);
assert.equal(modeleDeMemeNom(rangement, 'week-end TYPE'), 'm1');
assert.equal(modeleDeMemeNom(rangement, 'Autre'), null);
assert.deepEqual(partantsDuModele(liste, { personnes: ['inconnu', 'enfant1'] }), ['enfant1']);

// Départ créé d'après le modèle : mêmes retraits, mêmes ajouts, aucune coche.
const refait = creerDepart(liste, { nom: 'Février', personnes: ['enfant1'], sacs: ['s1', 'sP'] }, m).depart;
assert.deepEqual(refait.sacs, ['s1', 'sP']);
assert.deepEqual(refait.coches, {});
assert.deepEqual(refait.retires, { o2: true });
assert.deepEqual(Object.keys(refait.ponctuels).sort(), ['oP', 'oQ']);
assert.deepEqual(objetsDuDepart(listeDuDepart(liste, refait), refait, 's1').map(o => o.nom), ['Brosse', 'Lampe']);
// Un sac ponctuel décoché à la création n'emporte ni le sac ni ses objets.
const sansSac = creerDepart(liste, { nom: 'Mars', personnes: ['enfant1'], sacs: ['s1'] }, m).depart;
assert.equal('sacsPonctuels' in sansSac, false);
assert.deepEqual(Object.keys(sansSac.ponctuels), ['oP']);
// Sans modèle, rien ne change.
assert.deepEqual(Object.keys(creerDepart(liste, { nom: 'Avril', personnes: ['enfant1'], sacs: ['s1'] }).depart).sort(), ['coches', 'nom', 'personnes', 'retires', 'sacs']);
console.log('valises, modèles : tous les scénarios passent');

// ---------- Édition de la liste principale ----------
const { deplacerObjet, deplacerSac, personnesPour, modifierObjet, modifierSac, contenuDuSac } = await import('../valises/js/modele.js');
// Ordre : un cran vers le bas, puis les bords.
assert.deepEqual(deplacerObjet(liste, 'o1', 1), { o1: 1, o2: 0 });
assert.deepEqual(deplacerObjet(liste, 'o1', -1), {});
assert.deepEqual(deplacerObjet(liste, 'o2', 1), {});
assert.deepEqual(deplacerObjet(liste, 'inconnu', 1), {});
// Ordres hérités avec trous et doublons : tout est renuméroté.
const trous = { personnes: liste.personnes, sacs: { a: { proprio: 'enfant1', ordre: 0 } },
  objets: { x: { sac: 'a', ordre: 5 }, y: { sac: 'a', ordre: 5 }, z: { sac: 'a', ordre: 40 } } };
assert.deepEqual(deplacerObjet(trous, 'z', -1), { x: 0, z: 1, y: 2 });
// Sacs : seulement parmi ceux du même propriétaire.
assert.deepEqual(deplacerSac(liste, 's3', 1), { s3: 1, s4: 0 });
assert.deepEqual(deplacerSac(liste, 's1', 1), {});

// « Seulement si untel part » : dans un sac commun uniquement.
assert.deepEqual(personnesPour(liste, 's3').map(p => p.cle), ['enfant1', 'adulte1']);
assert.deepEqual(personnesPour(liste, 's1'), []);
assert.deepEqual(modifierObjet(liste, 'o5', { nom: ' Clefs ', pour: 'adulte1' }), { ok: true, champs: { nom: 'Clefs', pour: 'adulte1' } });
assert.deepEqual(modifierObjet(liste, 'o1', { nom: 'Brosse', pour: 'adulte1' }).champs, { nom: 'Brosse', pour: null });
assert.deepEqual(modifierObjet(liste, 'o5', { nom: 'Clés', pour: 'commun' }).champs.pour, null);
assert.equal(modifierObjet(liste, 'o1', { nom: ' ' }).ok, false);
assert.equal(modifierObjet(liste, 'inconnu', { nom: 'X' }).ok, false);

// Sac : nom, pictogramme, occasionnel ; changer de propriétaire le range à la fin chez l'autre.
assert.deepEqual(modifierSac(liste, 's2', { nom: ' Sport ', icone: 'sacados', office: true }),
  { ok: true, champs: { nom: 'Sport', icone: 'sacados', office: true }, sansPour: [] });
assert.equal(modifierSac(liste, 's2', { nom: 'Sport', office: false }).champs.office, false);
const donne = modifierSac(liste, 's3', { nom: 'Papiers', proprio: 'enfant1' });
assert.deepEqual([donne.champs.proprio, donne.champs.ordre, donne.sansPour], ['enfant1', 1, ['o4']]);
assert.equal(modifierSac(liste, 's1', { nom: '' }).ok, false);
assert.equal(modifierSac(liste, 's1', { nom: 'T', proprio: 'personne' }).ok, false);

// Suppression d'un sac : le sac et ses objets, de quoi tout rétablir.
const contenu = contenuDuSac(liste, 's3');
assert.deepEqual(Object.keys(contenu.objets), ['o4', 'o5']);
assert.equal(contenu.sac.nom, 'Papiers');
assert.equal('id' in contenu.objets.o4, false);
assert.equal(contenuDuSac(liste, 'inconnu'), null);
// Un départ qui citait un sac supprimé continue de fonctionner sans lui.
const apres = { ...liste, sacs: { ...liste.sacs }, objets: { ...liste.objets } };
delete apres.sacs.s1; delete apres.objets.o1; delete apres.objets.o2;
assert.deepEqual(sacsDuDepart(apres, { personnes: ['enfant1'], sacs: ['s1', 's3'], coches: { o1: true } }).map(s => s.id), ['s3']);
console.log('valises, édition : tous les scénarios passent');
