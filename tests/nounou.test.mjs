// Tests des calculs du module assistante maternelle, sur des créneaux fictifs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { totalJour, totalSemaine, nonCouverts, verifierCreneau, lundiDe, duree } from '../js/nounou-calcul.js';
import { calculerJour, fusionner, ecoleAvecNounou } from '../tache/moteur.js';

const cfg = JSON.parse(fs.readFileSync(new URL('./config-fictive.json', import.meta.url))).famille;
const S = (child, date, start, end = null) => ({ child, date, start, end });

// Outils
assert.equal(lundiDe('2030-01-10'), '2030-01-07');
assert.equal(lundiDe('2030-01-07'), '2030-01-07');
assert.equal(lundiDe('2030-01-13'), '2030-01-07');
assert.equal(duree(605), '10h05');
assert.equal(duree(45), '45 min');

// Totaux, comme l'app de pointage
const ctx = { jour: '2030-01-10', heure: '17:00', ecole: new Set(['2030-01-10']), sortie: '16:30', ecolier: 'grand' };
const sessions = [
  S('petit', '2030-01-07', '08:00', '18:00'),          // 600
  S('petit', '2030-01-10', '07:30'),                   // en cours : 570 à 17h
  S('grand', '2030-01-10', '07:30', '08:30'),          // 60, puis soir virtuel 16h30 → 17h : 30
  S('grand', '2030-01-09', '09:00')                    // en cours un autre jour : 0
];
assert.equal(totalJour(sessions, '2030-01-10', 'petit', ctx), 570);
assert.equal(totalJour(sessions, '2030-01-10', 'grand', ctx), 90);
assert.equal(totalSemaine(sessions, '2030-01-07', 'petit', ctx), 1170);
assert.equal(totalSemaine(sessions, '2030-01-07', 'grand', ctx), 90);
// Soir déjà pointé : plus de temps virtuel ; jour non coché : pas de temps virtuel
assert.equal(totalJour([...sessions, S('grand', '2030-01-10', '16:30', '16:50')], '2030-01-10', 'grand', ctx), 80);
assert.equal(totalJour(sessions, '2030-01-10', 'grand', { ...ctx, ecole: new Set() }), 60);

// Créneaux restant à confirmer : seuls ceux qu'aucun pointage ne recouvre
const prevus = [{ debut: '07:30', fin: '08:30' }, { debut: '16:30', fin: '19:00' }];
assert.deepEqual(nonCouverts(prevus, []), prevus);
assert.deepEqual(nonCouverts(prevus, [S('grand', 'x', '07:35', '08:30')]), [prevus[1]]);
assert.deepEqual(nonCouverts(prevus, [S('grand', 'x', '07:35', '08:30'), S('grand', 'x', '16:30', '18:40')]), []);
assert.deepEqual(nonCouverts(prevus, [S('grand', 'x', '18:00')]), [prevus[0]]);   // en cours
assert.deepEqual(nonCouverts([{ debut: null, fin: '18:00' }], []), []);

// Créneau saisi à la main
const deja = [{ id: 'a', ...S('grand', '2030-01-10', '07:30', '08:35') }, { id: 'b', ...S('grand', '2030-01-10', '16:30') }];
assert.equal(verifierCreneau(deja, { child: 'grand', date: '2030-01-10', start: '09:00', end: '12:00' }), null);
assert.match(verifierCreneau(deja, { child: 'grand', date: '2030-01-10', start: '08:00', end: '09:00' }), /Recouvre/);
assert.match(verifierCreneau(deja, { child: 'grand', date: '2030-01-10', start: '17:00', end: '18:00' }), /Recouvre/);   // créneau en cours
assert.equal(verifierCreneau(deja, { id: 'a', child: 'grand', date: '2030-01-10', start: '07:45', end: '08:35' }), null); // lui-même
assert.equal(verifierCreneau(deja, { child: 'petit', date: '2030-01-10', start: '08:00', end: '09:00' }), null);
assert.match(verifierCreneau(deja, { child: 'grand', date: '2030-01-11', start: '09:00', end: '08:00' }), /suivre/);
assert.match(verifierCreneau(deja, { child: 'grand', date: '2030-01-11', start: '', end: '08:00' }), /manquante/);

// Jour d'école avec nounou après l'école (règle d'écriture de « schooldays »)
const chm = { evenements: [{ titre: 'Bloc opératoire', cls: 'bloc', note: null }] };
const jour = (date, B = [], saisie = null, VB = []) => {
  const calc = calculerJour({ date, sem: chm, agenda: { A: [], B, vacances: null, ferie: null }, agendaVeille: { A: [], B: VB }, saisieB: saisie }, cfg);
  return [calc, fusionner(calc, null, null, cfg)];
};
const garde = { titre: 'Astreinte', debut: '2030-01-10T08:30', fin: '2030-01-11T08:30', journee: false };
assert.equal(ecoleAvecNounou(...jour('2030-01-07', [], { type: 'travail', debut: '08:50', fin: '17:25' }), cfg), true);   // nounou 16h30 → 18h30
assert.equal(ecoleAvecNounou(...jour('2030-01-07', [], { type: 'travail', debut: '09:30', fin: '15:00' }), cfg), false);  // récupéré à la sortie
assert.equal(ecoleAvecNounou(...jour('2030-01-11', [garde], null, [garde]), cfg), false);                               // matin seulement
assert.equal(ecoleAvecNounou(...jour('2030-01-09', [], { type: 'travail', debut: '08:50', fin: '17:25' }), cfg), false);  // mercredi
assert.equal(ecoleAvecNounou(null, null, cfg), false);

// Tâche planifiée : coche le jour d'école seulement si la case est vide
const { cocherEcole } = await import('../tache/nounou.mjs');
const [calcOk] = jour('2030-01-07', [], { type: 'travail', debut: '08:50', fin: '17:25' });
const faux = (docs) => ({
  ecrits: [],
  async lire(c) { return docs[c] ?? null; },
  async lireLot(cs) { return Object.fromEntries(cs.map(c => [c, docs[c] ?? null])); },
  async ecrire(e) { this.ecrits.push(...e); }
});
const base = { 'vision/config': { famille: cfg }, 'vision/planning/jours/2030-01-07': { calcule: calcOk } };
const log = console.log; console.log = () => {};
let f = faux(base); await cocherEcole(f, '2030-01-07');
assert.deepEqual(f.ecrits, [{ chemin: 'nounou/journal-fictif/schooldays/2030-01-07', donnees: { school: true }, siAbsent: true }]);
f = faux({ ...base, 'nounou/journal-fictif/schooldays/2030-01-07': { school: false } }); await cocherEcole(f, '2030-01-07');
assert.equal(f.ecrits.length, 0);
f = faux({ ...base, 'vision/planning/jours/2030-01-07': { calcule: calcOk, corrige: { e2: 'maison' } } }); await cocherEcole(f, '2030-01-07');
assert.equal(f.ecrits.length, 0);
f = faux(base); await cocherEcole(f, '2030-01-12');
assert.equal(f.ecrits.length, 0);
console.log = log;

console.log('nounou : tous les scénarios passent');
