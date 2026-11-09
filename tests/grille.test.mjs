// Tests du texte de la grille mensuelle, sur une famille fictive.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lignesJour, semaines } from '../js/grille.js';
import { calculerJour, fusionner } from '../tache/moteur.js';

const cfg = JSON.parse(fs.readFileSync(new URL('./config-fictive.json', import.meta.url))).famille;
const chm = { evenements: [{ titre: 'Bloc opératoire', cls: 'bloc', note: null }] };
const travail = (debut, fin) => ({ type: 'travail', debut, fin });
const jour = (date, { B = [], VB = [], saisie = null, corrige = null, ferie = null, semA = chm } = {}) => {
  const calc = calculerJour({ date, sem: semA, agenda: { A: [], B, vacances: null, ferie }, agendaVeille: { A: [], B: VB }, saisieB: saisie, corrige }, cfg);
  return { calc, aff: fusionner(calc, corrige, null, cfg) };
};
const I = cfg.B.initiale, IA = cfg.A.initiale;

// Jour ordinaire : dépôt et récupération avec initiales, créneaux de l'aîné
assert.deepEqual(lignesJour(jour('2030-01-07', { saisie: travail('08:50', '17:25') }), cfg),
  { l1: `7h45 (${I}) - 18h30 (${I})`, l2: '7h45 - 8h30 / 16h30 - 18h30', note: '' });
// Garde de B : dépôt B 7h30, récupération A 19h
const g = { titre: 'Astreinte', debut: '2030-01-10T08:30', fin: '2030-01-11T08:30', journee: false };
assert.deepEqual(lignesJour(jour('2030-01-10', { B: [g] }), cfg),
  { l1: `7h30 (${I}) - 19h (${IA})`, l2: '7h30 - 8h30 / 16h30 - 19h', note: '' });
// Mercredi : seulement le petit (l'aîné à l'ALAE, sans nounou)
const mer = lignesJour(jour('2030-01-09', { saisie: travail('09:00', '17:00') }), cfg);
assert.equal(mer.l2, '');
// Petit avec nous : « - » ; note reprise
assert.equal(lignesJour(jour('2030-01-07', { saisie: travail('08:50', '17:25'), corrige: { e1: false, e2: 'maison' } }), cfg).l1, '-');
assert.equal(lignesJour(jour('2030-01-07', { saisie: travail('08:50', '17:25'), corrige: { note: 'Vaccin 10h' } }), cfg).note, 'Vaccin 10h');
// Horaires inconnus : « ? »
assert.match(lignesJour(jour('2030-01-07'), cfg).l1, /\?/);
// Férié
assert.deepEqual(lignesJour(jour('2030-01-01', { ferie: 'Jour de l\'an' }), cfg), { l1: '-', l2: '', note: 'Jour de l\'an' });
// Jour sans planning
assert.deepEqual(lignesJour(undefined, cfg), { l1: '', l2: '', note: '' });

// Semaines du mois : lundi → vendredi, jours hors du mois marqués
const s = semaines('2026-09');
assert.equal(s.length, 5);
assert.deepEqual(s[0].map(x => x.num), [31, 1, 2, 3, 4]);
assert.equal(s[0][0].dansMois, false);
assert.deepEqual(s[4].map(x => x.num), [28, 29, 30, 1, 2]);
assert.equal(semaines('2026-11').length, 5);          // commence un dimanche : première semaine = 2 nov.
assert.equal(semaines('2026-11')[0][0].d, '2026-11-02');
assert.equal(semaines('2027-02')[0][0].d, '2027-02-01');

console.log('grille : tous les scénarios passent');

// Texte de l'accueil : situation des parents et fil du jour
const { personnes, filDuJour } = await import('../js/texte-jour.js');
const jt = jour('2030-01-10', { B: [g] });
assert.deepEqual(personnes(jt.calc, cfg).map(p => p.texte), ['Au travail' + (cfg.A.chm && cfg.A.chm.retour ? ', retour ' + cfg.A.chm.retour.replace(':00', 'h').replace(':', 'h') : ''), 'Garde (24 h)']);
const agendaJour = {
  A: [{ titre: 'Réunion', journee: false, debut: '2030-01-10T14:00', fin: '2030-01-10T15:00', notes: 'Apporter le dossier' }],
  B: [{ titre: 'Astreinte', journee: true, debut: '2030-01-10', fin: '2030-01-10' }],
  C: [{ titre: 'Soldes', journee: true, debut: '2030-01-10', fin: '2030-01-10', source: 'soldes' }]
};
const fil = filDuJour(agendaJour, jt, cfg);
assert.deepEqual(fil.map(x => [x.heure, x.titre]), [[null, 'Soldes'], ['07:30', `${cfg.B.prenom} dépose`], ['14:00', 'Réunion'], ['19:00', `${cfg.A.prenom} récupère`]]);
assert.equal(fil[2].notes, 'Apporter le dossier');
console.log('texte de l\'accueil : tous les scénarios passent');
// Congé de plusieurs jours saisi avec des heures : omis du fil (déjà sur la ligne du parent)
const fil2 = filDuJour({ A: [{ titre: 'Congé de naissance', journee: false, debut: '2030-01-08T00:00', fin: '2030-01-20T00:00' },
  { titre: 'Anniversaire', journee: false, debut: '2030-01-10T00:00', fin: '2030-01-11T00:00' }] }, null, cfg, '2030-01-10');
assert.deepEqual(fil2.map(x => [x.heure, x.titre]), [[null, 'Anniversaire']]);
console.log('fil du jour : journées à heures traitées');
