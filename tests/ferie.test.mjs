// Férié : une garde l'emporte toujours sur le jour férié (famille fictive).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { calculerJour } from '../tache/moteur.js';
import { personnes, etiquettes } from '../js/texte-jour.js';

const fam = JSON.parse(fs.readFileSync(new URL('./config-fictive.json', import.meta.url))).famille;
const d = '2030-11-11';
const g = t => ({ titre: t, debut: d + 'T00:00', fin: '2030-11-12T00:00', journee: true });
const jour = (A, B) => calculerJour({ date: d, sem: null, agenda: { A, B, vacances: null, ferie: 'Armistice' }, agendaVeille: { A: [], B: [] }, saisieB: null }, fam);

const un = jour([g('Astreinte')], []);
assert.deepEqual(etiquettes(un, fam), ['Armistice', 'Garde Alex']);
assert.equal(personnes(un, fam)[0].texte, 'Garde ce soir');
assert.equal(personnes(un, fam)[1].texte, 'Férié');
assert.equal(un.e2.mode, 'maison');                                     // nounou fermée

const deux = jour([g('Astreinte')], [g('Astreinte')]);
assert.deepEqual(deux.points, ['Alex et Bea de garde le même jour']);   // garde des enfants à prévoir
assert.equal(personnes(deux, fam)[1].texte, 'Garde (24 h)');

const aucun = jour([], []);
assert.deepEqual(etiquettes(aucun, fam), ['Armistice']);
assert.deepEqual(aucun.points, []);
console.log('férié : tous les scénarios passent');
