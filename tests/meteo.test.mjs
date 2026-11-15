// Tests de la météo de l'accueil, sur des prévisions fictives.
import assert from 'node:assert/strict';
import { notesHabillage, conseil, decrire, aHeure, creneaux, heures as heuresPrevues, jours as joursPrevus, pictoHeure, url } from '../js/meteo.js';

assert.equal(conseil(2, 10), 'manteau, bonnet et gants');
assert.equal(conseil(8, 60), 'manteau + imperméable et bottes');
assert.equal(conseil(15, 0), 'gilet');
assert.equal(conseil(18, 0), 'gilet');
assert.equal(conseil(22, 50), 'tenue légère + imperméable et bottes');
assert.equal(decrire(61).texte, 'pluie');
assert.equal(decrire(0).icone, '☀️');

const heures = [];
for (const d of ['2030-01-10', '2030-01-11']) for (let i = 0; i < 24; i++) heures.push(`${d}T${String(i).padStart(2, '0')}:00`);
const n = heures.length;
const data = { hourly: {
  time: heures,
  temperature_2m: heures.map((_, i) => i % 24),               // température = heure
  apparent_temperature: heures.map((_, i) => (i % 24) - 3),
  precipitation_probability: heures.map((_, i) => i % 24 === 17 ? 80 : 10),
  weather_code: Array(n).fill(3)
} };
assert.deepEqual(aHeure(data.hourly, '2030-01-10T16:30'), { temp: 17, ressenti: 14, pluie: 80, code: 3 });  // moyenne 16h/17h, pluie max
const m = creneaux(data, '2030-01-10', '2030-01-11', '07:10');
assert.deepEqual(m.creneaux.map(x => x.libelle), ['8h', '16h30', 'Demain 8h']);
assert.equal(m.conseil, 'Ce matin : manteau');            // ressenti 5 °C : pas encore bonnet et gants
const a = creneaux(data, '2030-01-10', '2030-01-11', '12:00');
assert.deepEqual(a.creneaux.map(x => x.libelle), ['16h30', 'Demain 8h']);
assert.equal(a.conseil, 'Cet après-midi : gilet + imperméable et bottes');
const s = creneaux(data, '2030-01-10', '2030-01-11', '19:00');
assert.equal(s.conseil, 'Demain matin : manteau');
const famN = { enfants: { e1: { prenom: 'Petit' }, e2: { prenom: 'Grand' } } };
const regle = [{ jours: [2], enfant: 'e2', texte: 'pas de robe (motricité)', jusqua: '12:00', ecole: true }];
assert.deepEqual(notesHabillage(regle, { jourSemaine: 2, heure: '07:10', lieux: { e2: 'ecole' } }, famN), ['Grand : pas de robe (motricité)']);
assert.deepEqual(notesHabillage(regle, { jourSemaine: 2, heure: '12:30', lieux: { e2: 'ecole' } }, famN), []);   // après midi
assert.deepEqual(notesHabillage(regle, { jourSemaine: 2, heure: '07:10', lieux: { e2: 'alae' } }, famN), []);    // vacances
assert.deepEqual(notesHabillage(regle, { jourSemaine: 3, heure: '07:10', lieux: { e2: 'ecole' } }, famN), []);   // autre jour

// Fenêtre de détail : heure par heure à partir de l'heure en cours
const jourJ = { time: ['2030-01-10', '2030-01-11'], sunrise: ['2030-01-10T08:40', '2030-01-11T08:39'], sunset: ['2030-01-10T17:20', '2030-01-11T17:21'],
  temperature_2m_min: [1.4, -0.6], temperature_2m_max: [9.5, 7.4], weather_code: [3, 61], precipitation_probability_max: [20, 85] };
const complet = { ...data, daily: jourJ };
const hp = heuresPrevues(complet, '2030-01-10T15:42', 12);
assert.equal(hp.length, 12);
assert.deepEqual([hp[0].quand, hp[0].heure, hp[0].temp, hp[0].ressenti, hp[0].nuit], ['2030-01-10T15:00', 15, 15, 12, false]);
assert.equal(hp[2].pluie, 80);                              // 17h
assert.equal(hp[3].nuit, true);                             // 18h, après le coucher du soleil
assert.equal(hp[9].jour, '2030-01-11');                     // passe au lendemain
assert.equal(heuresPrevues(complet, '2030-01-10T15:42').length, 33);   // jusqu'au bout des prévisions
assert.deepEqual(heuresPrevues(complet, '2030-02-01T10:00'), []);      // prévision trop ancienne
assert.deepEqual(heuresPrevues({}, '2030-01-10T15:42'), []);
assert.equal(heuresPrevues(data, '2030-01-10T22:10', 3)[0].nuit, false);   // sans lever ni coucher connus
// Pictogrammes de nuit
assert.equal(pictoHeure(0, true), '🌙');
assert.equal(pictoHeure(0, false), '☀️');
assert.equal(pictoHeure(61, true), '🌧️');
// Jour par jour
assert.deepEqual(joursPrevus(complet, '2030-01-10'), [
  { date: '2030-01-10', min: 1, max: 10, code: 3, pluie: 20 }, { date: '2030-01-11', min: -1, max: 7, code: 61, pluie: 85 }]);
assert.deepEqual(joursPrevus(complet, '2030-01-11').map(x => x.date), ['2030-01-11']);          // jours passés écartés
const ancien = { daily: { time: ['2030-01-10'], temperature_2m_min: [1], temperature_2m_max: [9] } };   // ancien format gardé sur l'appareil
assert.deepEqual(joursPrevus(ancien, '2030-01-10'), [{ date: '2030-01-10', min: 1, max: 9, code: null, pluie: null }]);
assert.deepEqual(joursPrevus({}, '2030-01-10'), []);
assert.ok(/forecast_days=7/.test(url(1, 2)) && /precipitation_probability_max/.test(url(1, 2)));

console.log('météo : tous les scénarios passent');
