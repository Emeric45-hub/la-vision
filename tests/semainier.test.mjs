// Tests du lecteur de semainier, sur un classeur fictif (aucune donnée réelle).
// Le classeur est simulé : chaque « feuille » est directement son tableau de lignes,
// ce que renverrait XLSX.utils.sheet_to_json(ws, {header: 1}).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lireClasseur } from '../js/semainier.js';

const XLSX = { read: b => b, utils: { sheet_to_json: ws => ws } };

// Configuration fictive partagée avec le test de bout en bout
const P = JSON.parse(fs.readFileSync(new URL('./config-fictive.json', import.meta.url))).semainier;

// Numéro de série Excel d'une date (jours depuis le 30/12/1899)
const serie = (a, m, j) => Math.round((Date.UTC(a, m - 1, j) - Date.UTC(1899, 11, 30)) / 86400000);

// Semaine du lundi 7 au dimanche 13 janvier 2030
const lundi = serie(2030, 1, 7);
const semaine = [
  ['Semaine fictive'],
  [null, ...Array.from({ length: 7 }, (_, i) => lundi + i)],
  //          lun     mar    mer    jeu      ven    sam   dim
  ['BLOC',    'AB',   null,  null,  'AB',    null,  null, null],
  ['S 1',     null,   'AB',  null,  null,    null,  null, null],
  ['ADMIN',   null,   null,  null,  null,    'AB',  null, null],
  ['BLOC',    'AB',   null,  null,  null,    null,  null, null],
  ['S 2',     null,   'AB >', null, null,    null,  null, null],
  ['GARDE',   null,   null,  null,  'AB',    null,  null, null],
  ['AB',      '',     '',    'CA',  'ROBOT', '',    '',   'SITE2']
];
const classeur = { SheetNames: ['Semaine 2', 'Feuil1'], Sheets: { 'Semaine 2': semaine, Feuil1: [] } };

const jours = lireClasseur(XLSX, classeur, P, new Date(2030, 0, 1));
const parDate = Object.fromEntries(jours.map(j => [j.date, j.evenements]));

// Lundi : bloc matin et après-midi → bloc journée
assert.deepEqual(parDate['2030-01-07'].map(e => [e.titre, e.debut, e.fin]), [['Bloc opératoire', '08:30', '15:45']]);
// Mardi : consultation le matin, ligne marquée « > » → à vérifier
assert.deepEqual(parDate['2030-01-08'].map(e => e.titre), ['À vérifier : AB >', 'Consultations', 'Consultations']);
// Mercredi : congés
assert.deepEqual(parDate['2030-01-09'].map(e => [e.titre, e.cls]), [['Congés', 'off']]);
// Jeudi : bloc robot + staff du jeudi + garde
assert.deepEqual(parDate['2030-01-10'].map(e => e.titre), ['Bloc robot', 'Staff du jeudi', 'Garde']);
// Vendredi : ligne « autres »
assert.deepEqual(parDate['2030-01-11'].map(e => [e.titre, e.debut]), [['Administratif', '08:40']]);
// Samedi : rien → pas de jour
assert.equal(parDate['2030-01-12'], undefined);
// Dimanche : site secondaire, semaine courte (ancre) → consultations + bloc
assert.deepEqual(parDate['2030-01-13'].map(e => [e.titre, e.note]), [['Consultations', 'Site secondaire'], ['Bloc opératoire', 'Site secondaire']]);

// Les jours passés sont ignorés
assert.equal(lireClasseur(XLSX, classeur, P, new Date(2030, 0, 10)).length, 3);
// Configuration incomplète → erreur explicite
assert.throws(() => lireClasseur(XLSX, classeur, { initiales: 'AB' }), /incomplète/);
// Rien à partir d'aujourd'hui → erreur explicite
assert.throws(() => lireClasseur(XLSX, classeur, P, new Date(2031, 0, 1)), /Aucune vacation/);

console.log(`semainier : ${jours.length} jours lus, tous les contrôles passent`);
