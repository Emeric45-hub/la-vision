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
