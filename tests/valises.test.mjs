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

// Un adulte seul : l'objet nominatif de l'enfant absent est masqué, le sac commun vide est omis.
const seul = { ...cree.depart, coches: { o3: true } }; // o3 = Gourde (s2)
assert.deepEqual(objetsDuDepart(liste, seul, 's3').map(o => o.nom), ['Clés']);
assert.deepEqual(sacsDuDepart(liste, seul).map(s => [s.id, s.fait, s.total, s.pret]), [['s2', 1, 1, true], ['s3', 0, 1, false]]);
assert.deepEqual(proprietairesDuDepart(liste, seul).map(p => [p.cle, p.fait, p.total]), [['adulte1', 1, 1], ['commun', 0, 1]]);
assert.deepEqual(avancement(liste, seul), { fait: 1, total: 2 });
assert.deepEqual(voisins(liste, seul, 's2'), { precedent: null, suivant: 's3' });
assert.deepEqual(voisins(liste, seul, 's3'), { precedent: 's2', suivant: null });
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
