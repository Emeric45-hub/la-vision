// Tests de la météo de l'accueil, sur des prévisions fictives.
import assert from 'node:assert/strict';
import { conseil, decrire, aHeure, creneaux } from '../js/meteo.js';

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
console.log('météo : tous les scénarios passent');
