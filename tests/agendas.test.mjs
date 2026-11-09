// Tests de la lecture des agendas, sur des agendas fictifs (aucune donnée réelle).
// Hors CI : ICALJS=/chemin/vers/ical.js/lib/ical/module.js node tests/agendas.test.mjs
import assert from 'node:assert/strict';
import { construireJours, empreinte } from '../tache/agendas.mjs';
import { feries, paques } from '../tache/feries.mjs';

const ICAL = (await import(process.env.ICALJS || new URL('../tache/node_modules/ical.js/dist/ical.js', import.meta.url))).default;

const TZ = `BEGIN:VTIMEZONE
TZID:Europe/Paris
BEGIN:DAYLIGHT
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
TZNAME:CEST
DTSTART:19700329T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
TZNAME:CET
DTSTART:19701025T030000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
END:VTIMEZONE`;
const cal = (...evs) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//FR', TZ, ...evs, 'END:VCALENDAR'].join('\r\n');
const ev = lignes => ['BEGIN:VEVENT', ...lignes, 'END:VEVENT'].join('\r\n');

const texteA = cal(
  // simple, heure de Paris
  ev(['UID:a1', 'SUMMARY:Rendez-vous', 'DTSTART;TZID=Europe/Paris:20300110T180000', 'DTEND;TZID=Europe/Paris:20300110T190000', 'LOCATION:Cabinet', 'DESCRIPTION:Apporter le carnet']),
  // journée entière
  ev(['UID:a2', 'SUMMARY:Congé', 'DTSTART;VALUE=DATE:20300111', 'DTEND;VALUE=DATE:20300112']),
  // série hebdomadaire, une date supprimée, une occurrence déplacée
  ev(['UID:a3', 'SUMMARY:Réunion', 'DTSTART;TZID=Europe/Paris:20300107T083000', 'DTEND;TZID=Europe/Paris:20300107T090000', 'RRULE:FREQ=WEEKLY;COUNT=4', 'EXDATE;TZID=Europe/Paris:20300114T083000']),
  ev(['UID:a3', 'SUMMARY:Réunion déplacée', 'RECURRENCE-ID;TZID=Europe/Paris:20300121T083000', 'DTSTART;TZID=Europe/Paris:20300121T100000', 'DTEND;TZID=Europe/Paris:20300121T110000']),
  // annulé
  ev(['UID:a4', 'SUMMARY:Annulé', 'STATUS:CANCELLED', 'DTSTART;TZID=Europe/Paris:20300112T100000', 'DTEND;TZID=Europe/Paris:20300112T110000']),
  // après le passage à l'heure d'été (dernier dimanche de mars 2030 = 31), écrit en UTC
  ev(['UID:a5', 'SUMMARY:Été', 'DTSTART:20300401T080000Z', 'DTEND:20300401T090000Z'])
);
const texteB = cal(
  // 24 h à cheval sur deux jours
  ev(['UID:b1', 'SUMMARY:Garde', 'DTSTART;TZID=Europe/Paris:20300110T083000', 'DTEND;TZID=Europe/Paris:20300111T083000']),
  // finit pile à minuit : n'occupe pas le lendemain
  ev(['UID:b2', 'SUMMARY:Soirée', 'DTSTART;TZID=Europe/Paris:20300115T200000', 'DTEND;TZID=Europe/Paris:20300116T000000'])
);
const texteVacances = cal(ev(['UID:v1', 'SUMMARY:Vacances fictives', 'DTSTART;VALUE=DATE:20300209', 'DTEND;VALUE=DATE:20300225']));

const J = construireJours(ICAL, { texteA, texteB, texteVacances }, '2030-01-03', '2030-04-10');
const titres = j => J[j].A.map(e => e.titre);

assert.deepEqual(J['2030-01-10'].A, [{ titre: 'Rendez-vous', journee: false, lieu: 'Cabinet', notes: 'Apporter le carnet', debut: '2030-01-10T18:00', fin: '2030-01-10T19:00' }]);
assert.deepEqual(J['2030-01-11'].A.map(e => [e.titre, e.journee, e.debut, e.fin]), [['Congé', true, '2030-01-11', '2030-01-11']]);
assert.deepEqual(titres('2030-01-07'), ['Réunion']);
assert.deepEqual(titres('2030-01-14'), []);                                     // date supprimée
assert.deepEqual(J['2030-01-21'].A.map(e => [e.titre, e.debut]), [['Réunion déplacée', '2030-01-21T10:00']]);
assert.deepEqual(titres('2030-01-28'), ['Réunion']);
assert.deepEqual(titres('2030-02-04'), []);                                     // COUNT=4 épuisé
assert.deepEqual(titres('2030-01-12'), []);                                     // annulé
assert.deepEqual(J['2030-04-01'].A.map(e => e.debut), ['2030-04-01T10:00']);    // UTC+2 en été
assert.deepEqual(J['2030-01-10'].B.map(e => e.titre), ['Garde']);
assert.deepEqual(J['2030-01-11'].B.map(e => [e.debut, e.fin]), [['2030-01-10T08:30', '2030-01-11T08:30']]);
assert.deepEqual(J['2030-01-16'].B, []);                                         // minuit exclu
assert.equal(J['2030-02-09'].vacances, 'Vacances fictives');
assert.equal(J['2030-02-24'].vacances, 'Vacances fictives');
assert.equal(J['2030-02-25'].vacances, null);                                    // fin exclusive
assert.equal(J['2030-04-10'] !== undefined && J['2030-04-11'] === undefined, true);

// Jours fériés
assert.equal(paques(2027).toISOString().slice(0, 10), '2027-03-28');
assert.equal(paques(2030).toISOString().slice(0, 10), '2030-04-21');
assert.equal(feries(2027)['2027-05-06'], 'Ascension');
assert.equal(feries(2027)['2027-05-17'], 'Lundi de Pentecôte');
assert.equal(Object.keys(feries(2027)).length, 11);
assert.equal(construireJours(ICAL, { texteA, texteB }, '2030-04-20', '2030-04-23')['2030-04-22'].ferie, 'Lundi de Pâques');

// Calendrier commun et abonnements : fusionnés dans C, triés, avec leur source
const texteC = cal(ev(['UID:c1', 'SUMMARY:Spectacle', 'DTSTART;TZID=Europe/Paris:20300110T170000', 'DTEND;TZID=Europe/Paris:20300110T180000']));
const abonnes = { '2030-01-10': [{ titre: 'Soldes', journee: true, debut: '2030-01-10', fin: '2030-01-10', lieu: null, notes: null, source: 'soldes' }] };
const JC = construireJours(ICAL, { texteA, texteB, texteC, abonnes }, '2030-01-09', '2030-01-11');
assert.deepEqual(JC['2030-01-10'].C.map(e => [e.titre, e.source]), [['Soldes', 'soldes'], ['Spectacle', 'commun']]);
assert.deepEqual(JC['2030-01-09'].C, []);
assert.deepEqual(J['2030-01-10'].C, []);

// Empreinte indépendante de l'ordre des clés
assert.equal(empreinte({ a: 1, b: [1, { c: 2, d: 3 }] }), empreinte({ b: [1, { d: 3, c: 2 }], a: 1 }));

console.log(`agendas : ${Object.keys(J).length} jours construits, tous les contrôles passent`);
