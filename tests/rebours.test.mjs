// Tests du compte à rebours, sur des agendas fictifs.
import assert from 'node:assert/strict';
import { debutsDePeriodes, estVacancesPosees, prochaineAnnuelle, joursAvant } from '../tache/rebours.js';

const fam = { nounou: { conges: 'cong[ée]s assistante' } };
const ev = titre => ({ titre });
const parJour = {
  '2030-01-05': [ev('Vacances')], '2030-01-06': [ev('Vacances')], '2030-01-07': [ev('Vacances')],
  '2030-02-10': [ev('Vacances')], '2030-02-11': [ev('Vacances'), ev('Réunion')],
  '2030-03-01': [ev('Congés assistante')], '2030-03-02': [ev('Vacances scolaires')], '2030-04-01': [ev('CONGÉS')]
};
const r = debutsDePeriodes(parJour, e => estVacancesPosees(e.titre, fam), '2030-01-04');
assert.deepEqual(r, [{ titre: 'Vacances', date: '2030-01-05' }, { titre: 'Vacances', date: '2030-02-10' }, { titre: 'CONGÉS', date: '2030-04-01' }]);
// Période déjà commencée : elle ne compte pas
assert.deepEqual(debutsDePeriodes(parJour, e => estVacancesPosees(e.titre, fam), '2030-01-05').map(x => x.date), ['2030-02-10', '2030-04-01']);
assert.equal(estVacancesPosees('Congé de naissance', fam), true);
assert.equal(estVacancesPosees('Vacances scolaires', fam), false);
assert.equal(prochaineAnnuelle('12-25', '2030-12-24'), '2030-12-25');
assert.equal(prochaineAnnuelle('12-25', '2030-12-26'), '2031-12-25');
assert.equal(prochaineAnnuelle('12-25', '2030-12-25'), '2030-12-25');
assert.equal(joursAvant('2030-12-25', '2030-11-01'), 54);
assert.equal(joursAvant('2031-04-01', '2031-03-01'), 31);   // passage à l'heure d'été sans effet
console.log('compte à rebours : tous les scénarios passent');
