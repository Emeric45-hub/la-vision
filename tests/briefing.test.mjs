// Tests du briefing : faits rassemblés, moments, règle de réécriture, secours (famille fictive).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { calculerJour } from '../tache/moteur.js';
import { moment, jourDuPlanning, faitsDuJour, essentiel, doitEcrire, cleMoment, consigne, secours } from '../tache/briefing.js';

const fam = JSON.parse(fs.readFileSync(new URL('./config-fictive.json', import.meta.url))).famille;
const chm = { evenements: [{ titre: 'Bloc opératoire', cls: 'bloc', note: null }] };
const date = '2030-01-08';
const rdv = { titre: 'Dentiste', debut: '2030-01-08T17:00', fin: '2030-01-08T17:30', journee: false, notes: 'Carnet de santé' };
const calc = calculerJour({ date, sem: chm, agenda: { A: [], B: [rdv], vacances: null, ferie: null }, agendaVeille: { A: [], B: [] },
  saisieB: { type: 'travail', debut: '09:00', fin: '17:00' } }, fam);

assert.equal(moment('06:29'), null);
assert.equal(moment('06:30'), 'matin');
assert.equal(moment('17:29'), 'matin');
assert.equal(moment('17:30'), 'soir');

const j = jourDuPlanning({ calcule: calc }, fam);
const f = faitsDuJour(date, j, { A: [], B: [rdv] }, fam);
assert.equal(f.jour, 'mardi');
assert.equal(f.parents.length, 2);
assert.ok(f.depot && f.recup, 'dépôt et récupération présents');
assert.ok(f.evenements.some(e => e.includes('Dentiste') && e.includes('Carnet de santé')));
assert.deepEqual(faitsDuJour(date, null, {}, fam), { date, jour: 'mardi', inconnu: true });

// Correction faite dans l'app : prise en compte
const corr = faitsDuJour(date, jourDuPlanning({ calcule: calc, corrige: { e2: 'maison', note: 'Malade' } }, fam), {}, fam);
assert.ok(corr.enfant2.includes('avec nous'));
assert.equal(corr.note, 'Malade');

// Essentiel : un rappel ou un plat ne change rien ; un changement de planning oui
const faits = { moment: 'matin', date, aujourdhui: f, rappelsDuJour: ['A'], platPrevuCeSoir: 'X' };
const e1 = JSON.stringify(essentiel(faits));
assert.equal(JSON.stringify(essentiel({ ...faits, rappelsDuJour: ['A', 'B'], platPrevuCeSoir: 'Y' })), e1);
assert.notEqual(JSON.stringify(essentiel({ ...faits, aujourdhui: corr })), e1);
// Le soir, un changement de la journée en cours compte aussi
{ const soir = { moment: 'soir', date: faits.date, ceSoir: faits.aujourdhui, demain: null };
  assert.notEqual(JSON.stringify(essentiel({ ...soir, ceSoir: corr })), JSON.stringify(essentiel(soir))); }

// Réécriture
const cle = cleMoment('matin', date), t = Date.parse('2030-01-08T10:00:00Z');
assert.equal(doitEcrire(null, 'e', t, cle), true);
assert.equal(doitEcrire({ cle: cleMoment('soir', '2030-01-07'), essentiel: 'e' }, 'e', t, cle), true);   // nouveau moment
assert.equal(doitEcrire({ cle, essentiel: 'e', le: '2030-01-08T09:30:00Z' }, 'e', t, cle), false);        // rien n'a changé
assert.equal(doitEcrire({ cle, essentiel: 'e', le: '2030-01-08T09:30:00Z' }, 'f', t, cle), false);        // changé, mais < 1 h
assert.equal(doitEcrire({ cle, essentiel: 'e', le: '2030-01-08T08:59:00Z' }, 'f', t, cle), true);         // changé, > 1 h

// Consigne et secours
const c = consigne(faits, fam);
assert.ok(c.includes('70 mots') && c.includes('Dentiste'));
assert.ok(secours(faits).startsWith("Aujourd'hui : "));
assert.ok(secours({ moment: 'soir', demain: f }).startsWith('Demain (mardi) : '));
console.log('briefing : tous les scénarios passent');
