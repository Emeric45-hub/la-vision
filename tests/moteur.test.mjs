// Tests du moteur de règles sur une famille fictive (aucune donnée réelle).
// Semaine de référence : lundi 7 → vendredi 11 janvier 2030.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { calculerJour, arrondiBas, arrondiHaut } from '../tache/moteur.mjs';

const cfg = JSON.parse(fs.readFileSync(new URL('./config-fictive.json', import.meta.url))).famille;

// Fabriques
const chm = { evenements: [{ titre: 'Bloc opératoire', cls: 'bloc', note: null }] };
const site = { evenements: [{ titre: 'Consultations', cls: 'cs', note: 'Site secondaire' }] };
const sem = titre => ({ evenements: [{ titre, cls: 'off', note: null }] });
const garde = (debut, fin) => ({ titre: 'Astreinte', debut, fin, journee: false });
const jour = (date, { semA = chm, A = [], B = [], VA = [], VB = [], vacances = null, ferie = null, saisie = null, corrige = null } = {}) =>
  calculerJour({ date, sem: semA, agenda: { A, B, vacances, ferie }, agendaVeille: { A: VA, B: VB }, saisieB: saisie, corrige }, cfg);
const travail = (debut, fin) => ({ type: 'travail', debut, fin });
const creneaux = c => c.creneaux.map(x => x.debut + '-' + x.fin);
const resume = r => ({
  depot: r.depot && [r.depot.qui, r.depot.heure], recup: r.recup && [r.recup.qui, r.recup.heure, r.recup.ecole],
  e1: r.e1 && creneaux(r.e1), e2: r.e2 && [r.e2.mode, ...creneaux(r.e2)], points: r.points.length
});

// Arrondis
assert.equal(arrondiBas('07:50'), '07:45');
assert.equal(arrondiHaut('18:20'), '18:30');
assert.equal(arrondiHaut('18:30'), '18:30');

// Week-end : rien
assert.equal(jour('2030-01-12'), null);

// 1. Jour ordinaire : B dépose 1 h avant, récupère 1 h après, arrondis au quart d'heure
assert.deepEqual(resume(jour('2030-01-07', { saisie: travail('08:50', '17:25') })), {
  depot: ['B', '07:45'], recup: ['B', '18:30', false], e1: ['07:45-18:30'], e2: ['ecole', '07:45-08:30', '16:30-18:30'], points: 0 });

// 2. Début tardif : dépôt plafonné à l'entrée de l'école, pas de créneau le matin pour l'aîné
assert.deepEqual(resume(jour('2030-01-07', { saisie: travail('10:00', '17:00') })), {
  depot: ['B', '08:30'], recup: ['B', '18:00', false], e1: ['08:30-18:00'], e2: ['ecole', '16:30-18:00'], points: 0 });

// 3. Fin tôt : récupération à l'école, à la sortie
assert.deepEqual(resume(jour('2030-01-07', { saisie: travail('09:30', '15:00') })), {
  depot: ['B', '08:30'], recup: ['B', '16:30', true], e1: ['08:30-16:30'], e2: ['ecole'], points: 0 });

// 4. Site secondaire : A dépose à 8h30 et récupère à 18h, sauf si B rentre avant
assert.deepEqual(resume(jour('2030-01-08', { semA: site, saisie: travail('08:30', '17:30') })), {
  depot: ['A', '08:30'], recup: ['A', '18:00', false], e1: ['08:30-18:00'], e2: ['ecole', '16:30-18:00'], points: 0 });
assert.deepEqual(resume(jour('2030-01-08', { semA: site, saisie: travail('08:30', '15:45') })), {
  depot: ['A', '08:30'], recup: ['B', '16:45', false], e1: ['08:30-16:45'], e2: ['ecole', '16:30-16:45'], points: 0 });

// 5. Jour de garde de B : B dépose à 7h30, A récupère en rentrant (19h)
assert.deepEqual(resume(jour('2030-01-10', { B: [garde('2030-01-10T08:30', '2030-01-11T08:30')] })), {
  depot: ['B', '07:30'], recup: ['A', '19:00', false], e1: ['07:30-19:00'], e2: ['ecole', '07:30-08:30', '16:30-19:00'], points: 0 });

// 6. Lendemain de garde de B : A dépose à 6h45, B récupère les deux à l'école à 16h30
assert.deepEqual(resume(jour('2030-01-11', { VB: [garde('2030-01-10T08:30', '2030-01-11T08:30')], B: [garde('2030-01-10T08:30', '2030-01-11T08:30')] })), {
  depot: ['A', '06:45'], recup: ['B', '16:30', true], e1: ['06:45-16:30'], e2: ['ecole', '06:45-08:30'], points: 0 });

// 7. Soir de garde de A : B fait tout ; lendemain de garde de A : B dépose, A récupère à 18h
const gA = { titre: 'Astreinte A', debut: '2030-01-10T18:00', fin: '2030-01-11T08:00', journee: false };
assert.deepEqual(resume(jour('2030-01-10', { A: [gA], semA: { evenements: [...chm.evenements, { titre: 'Garde', cls: 'garde' }] }, saisie: travail('09:00', '19:00') })), {
  depot: ['B', '08:00'], recup: ['B', '20:00', false], e1: ['08:00-20:00'], e2: ['ecole', '08:00-08:30', '16:30-20:00'], points: 1 }); // après la fermeture, A indisponible
assert.deepEqual(resume(jour('2030-01-11', { VA: [gA], A: [gA], semA: chm, saisie: travail('09:00', '17:00') })), {
  depot: ['B', '08:00'], recup: ['A', '18:00', false], e1: ['08:00-18:00'], e2: ['ecole', '08:00-08:30', '16:30-18:00'], points: 0 });

// 8. B finit après la fermeture : A récupère en rentrant
assert.deepEqual(resume(jour('2030-01-07', { saisie: travail('09:00', '18:30') })).recup, ['A', '19:00', false]);

// 9. Mercredi scolaire : le parent à la maison dépose et récupère, 9h–13h ; l'aîné à l'accueil de loisirs
assert.deepEqual(resume(jour('2030-01-09', { semA: sem('Non travaillé (90 %)') })), {
  depot: ['A', '09:00'], recup: ['A', '13:00', false], e1: ['09:00-13:00'], e2: ['alae'], points: 0 });
assert.deepEqual(resume(jour('2030-01-09')).depot, ['B', '09:00']);
assert.equal(resume(jour('2030-01-09', { saisie: travail('09:00', '18:00') })).points, 1);   // les deux travaillent ?

// 10. B en repos : horaires du petit à saisir, l'aîné à l'école sans périscolaire
const repos = jour('2030-01-07', { saisie: { type: 'repos' } });
assert.deepEqual(resume(repos), { depot: ['B', null], recup: ['B', null, false], e1: [], e2: ['ecole'], points: 1 });
assert.equal(repos.e1.aConfirmer, true);

// 11. B en congé : personne chez l'assistante maternelle
assert.deepEqual(resume(jour('2030-01-07', { saisie: { type: 'conge' } })), { depot: null, recup: null, e1: null, e2: ['ecole'], points: 0 });

// 12. Horaires de B non saisis : à confirmer, un point
const vide = jour('2030-01-07');
assert.deepEqual(resume(vide), { depot: ['B', null], recup: ['B', null, false], e1: [], e2: ['ecole'], points: 1 });
assert.equal(vide.depot.aConfirmer, true);

// 13. A en congé, B travaille : A dépose à 8h30 et récupère à 18h
assert.deepEqual(resume(jour('2030-01-07', { semA: sem('Congés'), saisie: travail('08:00', '19:00') })), {
  depot: ['A', '08:30'], recup: ['A', '18:00', false], e1: ['08:30-18:00'], e2: ['ecole', '16:30-18:00'], points: 0 });

// 14. Férié ; congés de l'assistante maternelle
assert.deepEqual(resume(jour('2030-01-07', { ferie: 'Fête fictive', saisie: travail('08:00', '17:00') })).e1, null);
const conges = jour('2030-01-07', { B: [{ titre: 'Congés assistante', debut: '2030-01-07', fin: '2030-01-07', journee: true }], saisie: travail('08:00', '17:00') });
assert.equal(conges.e1, null);
assert.equal(conges.points.length, 1);

// 15. Vacances : lieu de l'aîné lu dans l'agenda de B ; sans indication, point à vérifier
const alae = { titre: 'ALAE', debut: '2030-02-11', fin: '2030-02-11', journee: true };
assert.deepEqual(resume(jour('2030-02-11', { vacances: 'Vacances', B: [alae], saisie: travail('09:00', '17:00') })), {
  depot: ['B', '08:00'], recup: ['B', '18:00', false], e1: ['08:00-18:00'], e2: ['alae'], points: 0 });
const chezNounou = { titre: 'Grand chez assistante', debut: '2030-02-11', fin: '2030-02-11', journee: true };
assert.deepEqual(resume(jour('2030-02-11', { vacances: 'Vacances', B: [chezNounou], saisie: travail('07:30', '17:00') })).e2, ['nounou', '06:30-18:00']);
assert.equal(resume(jour('2030-02-11', { vacances: 'Vacances', saisie: travail('09:00', '17:00') })).points, 1);
assert.deepEqual(resume(jour('2030-02-11', { vacances: 'Vacances', corrige: { e2: 'centre' }, saisie: travail('09:00', '17:00') })).e2, ['centre']);
// Mercredi pendant les vacances : jour ordinaire
assert.deepEqual(resume(jour('2030-02-13', { vacances: 'Vacances', B: [alae], saisie: travail('09:00', '17:00') })).e1, ['08:00-18:00']);

// 16. 24 décembre : l'accueil de loisirs ferme à 17h
const veilleNoel = jour('2030-12-24', { vacances: 'Noël', B: [{ ...alae, debut: '2030-12-24', fin: '2030-12-24' }], saisie: travail('09:00', '17:00') });
assert.deepEqual([veilleNoel.recup.heure, veilleNoel.points.length], ['17:00', 0]);   // récupération avancée, plus de point

// 17. Écart entre semainier et agenda pour la garde de A
assert.equal(jour('2030-01-07', { semA: { evenements: [...chm.evenements, { titre: 'Garde', cls: 'garde' }] }, saisie: travail('09:00', '17:00') }).points.length, 1);

// 18. Semainier absent
assert.equal(jour('2030-01-07', { semA: null, saisie: travail('09:00', '17:00') }).points.length, 1);

// 19. Justification toujours présente pour un jour calculé
assert.ok(jour('2030-01-07', { saisie: travail('08:50', '17:25') }).justification.length >= 2);

// 20. Gardes notées sur la journée entière (soir de garde et lendemain lu la veille)
const gJ = (titre, d) => ({ titre, debut: d, fin: d, journee: true });
const semGarde = { evenements: [...chm.evenements, { titre: 'Garde', cls: 'garde' }] };
const soir = jour('2030-01-10', { A: [gJ('Astreinte A', '2030-01-10')], semA: semGarde, saisie: travail('09:00', '17:00') });
assert.deepEqual([soir.recup.qui, soir.points.length], ['B', 0]);
assert.deepEqual(resume(jour('2030-01-11', { VA: [gJ('Astreinte A', '2030-01-10')], saisie: travail('09:00', '17:00') })).recup, ['A', '18:00', false]);
assert.deepEqual(resume(jour('2030-01-11', { VB: [gJ('Astreinte', '2030-01-10')] })).depot, ['A', '06:45']);
// Garde du dimanche : le lundi est un lendemain
assert.deepEqual(resume(jour('2030-01-07', { VA: [gJ('Astreinte A', '2030-01-06')], saisie: travail('09:00', '17:00') })).recup, ['A', '18:00', false]);

// 21. A en congé le jour de garde de B : A dépose et récupère
assert.deepEqual(resume(jour('2030-01-10', { semA: sem('Congé de naissance'), B: [gJ('Astreinte', '2030-01-10')] })), {
  depot: ['A', '08:30'], recup: ['A', '18:00', false], e1: ['08:30-18:00'], e2: ['ecole', '16:30-18:00'], points: 0 });

// 22. Accueil de loisirs fermé avant la récupération : l'assistante maternelle prend le relais
const relais = jour('2030-02-11', { vacances: 'Vacances', B: [{ titre: 'Centre aéré 7h30-18h30', debut: '2030-02-11', fin: '2030-02-11', journee: true }, gJ('Astreinte', '2030-02-11')] });
assert.deepEqual(resume(relais), { depot: ['B', '07:30'], recup: ['A', '19:00', false], e1: ['07:30-19:00'], e2: ['centre', '18:30-19:00'], points: 0 });

// 23. Fermeture anticipée (24/12) : récupération avancée pour les deux enfants
assert.deepEqual(resume(jour('2030-12-24', { vacances: 'Noël', semA: sem('Congés'), B: [{ ...alae, debut: '2030-12-24', fin: '2030-12-24' }] })), {
  depot: ['A', '08:30'], recup: ['A', '17:00', false], e1: ['08:30-17:00'], e2: ['alae'], points: 0 });

// 24. Férié : aucun point, même sans semainier
assert.equal(jour('2030-12-25', { semA: null, ferie: 'Noël' }).points.length, 0);

// 25. Congé de B lu dans son agenda (« Vacances » seul), mais pas « Vacances scolaires »
assert.equal(jour('2030-02-11', { vacances: 'Vacances', B: [gJ('Vacances', '2030-02-11')] }).e1, null);
assert.notEqual(jour('2030-02-11', { vacances: 'Vacances', B: [gJ('Vacances scolaires', '2030-02-11'), alae], saisie: travail('09:00', '17:00') }).e1, null);

// 26. Repos de B lu dans son agenda (« Off … ») : petit à saisir, aîné à l'école sans périscolaire
const off = jour('2030-01-08', { B: [gJ('Off B', '2030-01-08')] });
assert.deepEqual([off.B.statut, off.e1.aConfirmer, off.e2.creneaux.length], ['repos', true, 0]);

console.log('moteur : tous les scénarios passent');
