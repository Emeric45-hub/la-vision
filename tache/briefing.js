// Briefing : faits du jour rassemblés par le code (fonctions pures, testées sous Node), mis en
// phrases par Claude. Claude ne calcule rien ; sans lui, un texte de secours est construit ici.
//
// Deux moments : « matin » (de 6h30 à 17h29, la journée en cours) et « soir » (à partir de 17h30 :
// la soirée et le lendemain). Avant 6h30, le briefing de la veille au soir reste affiché.
import { fusionner, affiche } from './moteur.js';
import { personnes, filDuJour, ligneE2 } from '../js/texte-jour.js';

export const MATIN = '06:30', SOIR = '17:30';
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const h = x => x ? affiche(x) : '?';
const nomJour = d => JOURS[new Date(d + 'T12:00:00Z').getUTCDay()];

export function moment(heure) {
  if (heure < MATIN) return null;
  return heure < SOIR ? 'matin' : 'soir';
}

// Jour affiché à partir du document de planning (calcul de la tâche + corrections de l'app).
export function jourDuPlanning(p, fam) {
  if (!p || !p.calcule) return null;
  return { calc: p.calcule, aff: fusionner(p.calcule, p.corrige, p.valide, fam) };
}

// Faits d'un jour : situation des parents, enfants, dépôt et récupération, événements avec notes.
export function faitsDuJour(date, j, agendaJour, fam) {
  const f = { date, jour: nomJour(date) };
  if (!j || !j.calc) return { ...f, inconnu: true };
  if (j.calc.ferie) f.ferie = j.calc.ferie;
  f.parents = personnes(j.calc, fam).map(p => `${p.qui} : ${p.texte}`);
  const a = j.aff || {}, qui = q => q === 'A' ? fam.A.prenom : q === 'B' ? fam.B.prenom : '?';
  if (a.e1) f.enfant1 = `${fam.enfants.e1.prenom} chez la nounou`;
  else if (!j.calc.ferie) f.enfant1 = `${fam.enfants.e1.prenom} avec nous`;
  if (!j.calc.ferie && a.e2 !== undefined) f.enfant2 = ligneE2(a, fam);
  if (a.e1 && a.depot) f.depot = `${qui(a.depot.qui)} dépose à ${h(a.depot.heure)}`;
  if (a.e1 && a.recup) f.recup = `${qui(a.recup.qui)} récupère à ${h(a.recup.heure)}`;
  if (a.note) f.note = a.note;
  f.evenements = filDuJour(agendaJour, j, fam, date).filter(x => !x.planning && !x.source)
    .map(x => [x.heure ? h(x.heure) : 'journée', (x.qui ? x.qui + ' : ' : '') + x.titre, x.lieu ? 'lieu : ' + x.lieu : '', x.notes ? 'notes : ' + x.notes : '']
      .filter(Boolean).join(' · '));
  return f;
}

// Ce qui, en changeant, justifie de réécrire le briefing (les rappels, courses, post-it et plats
// cochés n'en font pas partie). Le soir, la journée en cours (« ceSoir ») compte aussi.
export const essentiel = faits => ({ m: faits.moment, d: faits.date, j: [faits.aujourdhui || faits.ceSoir, faits.demain].map(x => x && {
  parents: x.parents, e1: x.enfant1, e2: x.enfant2, depot: x.depot, recup: x.recup, note: x.note, ev: x.evenements, ferie: x.ferie
}) });

// Écrire ? Nouveau moment ou nouveau jour : oui. Même moment : si l'essentiel a changé, au plus
// une fois par heure.
export function doitEcrire(actuel, faitsCle, maintenant, cle) {
  if (!actuel || actuel.cle !== cle) return true;
  if (actuel.essentiel === faitsCle) return false;
  return !actuel.le || maintenant - new Date(actuel.le) >= 3600e3;
}
export const cleMoment = (m, date) => `${date}:${m}`;

// Consigne et faits envoyés à Claude.
export function consigne(faits, fam) {
  const n1 = fam.enfants.e1.prenom, n2 = fam.enfants.e2.prenom;
  return [
    `Tu écris le briefing ${faits.moment === 'matin' ? 'du matin' : 'du soir'} affiché sur l'écran familial de ${fam.A.prenom} et ${fam.B.prenom}, parents de ${n2} et ${n1}.`,
    faits.moment === 'matin'
      ? 'Il présente la journée qui commence : qui dépose et qui récupère, où sont les filles, les rendez-vous et ce qu\'il ne faut pas oublier, comment les habiller.'
      : 'Il couvre la soirée (plat prévu, rappels encore à faire) puis prépare le lendemain : qui dépose et à quelle heure, rendez-vous, papiers ou affaires à préparer, météo du matin.',
    'Règles : français, ton direct et familial, tu t\'adresses aux parents (« vous »). Au plus 70 mots, en 3 à 5 phrases courtes, sans titre, sans liste, sans émoji. Moins si la journée est calme.',
    'N\'utilise que les faits fournis, sans rien inventer ni déduire au-delà. Garde les heures telles quelles (« 8h30 »). Mets en avant ce qui sort de l\'ordinaire (garde, rendez-vous, notes à ne pas oublier). Ne répète pas ce qui est sans intérêt.',
    'Réponds par le texte du briefing seul.',
    '',
    'Faits :',
    JSON.stringify(faits, null, 1)
  ].join('\n');
}

// Texte de secours, sans IA : les faits principaux mis bout à bout.
export function secours(faits) {
  const j = faits.moment === 'matin' ? faits.aujourdhui : faits.demain;
  if (!j || j.inconnu) return '';
  const l = [];
  if (j.ferie) l.push(`férié (${j.ferie})`);
  for (const k of ['depot', 'recup', 'enfant2']) if (j[k]) l.push(j[k]);
  const t = `${faits.moment === 'matin' ? 'Aujourd\'hui' : `Demain (${j.jour})`} : ${l.join(', ') || 'rien de particulier'}.`;
  const ev = (j.evenements || []).length ? ` ${j.evenements.length} événement${j.evenements.length > 1 ? 's' : ''} au programme.` : '';
  const m = faits.meteo && faits.meteo.conseil ? ` ${faits.meteo.conseil}.` : '';
  return (t + ev + m).trim();
}
