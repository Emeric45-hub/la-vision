// Tests de la lecture des données du Raccourci (données fictives).
import assert from 'node:assert/strict';
import { lire, repartir, evenementsDuJour, picto } from '../js/raccourci.js';

const texte = JSON.stringify({
  le: '2030-03-12T10:30:05+01:00',
  rappels: [
    { t: 'Rappel daté ce soir', l: '🏠 Liste A', e: '2030-03-12T20:00:00+01:00', n: '' },
    { t: 'Rappel en retard', l: 'Liste B', e: '2030-03-10T09:00:00+01:00', n: 'note\nsur deux lignes' },
    { t: 'Rappel sans heure', l: 'Liste B', e: '2030-03-12T00:00:00+01:00', n: '' },
    { t: 'Rappel plus tard', l: 'Liste A', e: '2030-03-20T08:00:00+01:00', n: '' },
    { t: 'Rappel sans date', l: 'Liste A', e: '', n: '' },
    { t: 'Récurrent à venir', l: 'Liste C (récurrents)', e: '2030-03-14T20:00:00+01:00', n: '' },
    { t: 'Récurrent du jour', l: 'Liste C (récurrentes)', e: '2030-03-12T07:00:00+01:00', n: '' },
    { t: '', l: 'Liste A', e: '', n: '' }
  ],
  evenements: [
    { t: 'Rendez-vous', d: '2030-03-12T09:15:00+01:00', f: '2030-03-12T10:15:00+01:00', j: 'Non', n: '' },
    { t: 'Sur deux jours', d: '2030-03-11T00:00:00+01:00', f: '2030-03-13T00:00:00+01:00', j: 'Oui', n: '' },
    { t: 'Autre jour', d: '2030-03-14T09:00:00+01:00', f: '2030-03-14T10:00:00+01:00', j: 'Non', n: '' }
  ],
  anniversaires: [{ t: 'Personne fictive (5 ans)', d: '2030-04-01T00:00:00+02:00' }, { t: 'Date illisible', d: '1 avr. 2030 à 00:00' }]
});

const r = lire({ texte });
assert.equal(r.le.toISOString(), '2030-03-12T09:30:05.000Z');
assert.equal(r.rappels.length, 7);
assert.equal(r.rappels.find(x => x.titre === 'Rappel sans heure').heure, null);
assert.equal(r.rappels.find(x => x.titre === 'Rappel sans date').jour, null);
assert.equal(r.rappels.find(x => x.titre === 'Rappel en retard').notes, 'note\nsur deux lignes');
assert.equal(r.anniversaires.length, 1);
assert.equal(r.anniversaires[0].date, '2030-04-01');
assert.equal(r.evenements[1].journee, true);

const { jour, plusTard } = repartir(r.rappels, '2030-03-12');
assert.deepEqual(jour.map(x => x.titre), ['Rappel en retard', 'Récurrent du jour', 'Rappel daté ce soir', 'Rappel sans heure']);
assert.equal(jour[0].retard, true);
assert.deepEqual(repartir(r.rappels, '2030-03-12', 'Liste A').plusTard.map(x => x.titre), ['Récurrent à venir']);   // motif de configuration
assert.deepEqual(plusTard.map(x => x.titre), ['Rappel plus tard', 'Rappel sans date']);

assert.deepEqual(evenementsDuJour(r.evenements, '2030-03-12').map(e => e.titre), ['Rendez-vous', 'Sur deux jours']);
assert.deepEqual(evenementsDuJour(r.evenements, '2030-03-13').map(e => e.titre), []);   // fin à minuit : non couvert
assert.equal(r.evenements[0].debut, '2030-03-12T09:15');

assert.equal(picto('🏠 Liste A'), '🏠');
assert.equal(picto('Liste B'), '');
assert.deepEqual(lire({ texte: '{pas du json' }), { erreur: 'format' });
assert.deepEqual(lire(null), { erreur: 'vide' });
console.log('raccourci : tous les scénarios passent');
