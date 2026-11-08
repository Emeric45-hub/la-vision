// Calcul du planning (couche « calcule » de vision/planning/jours/{date}) à partir de la
// configuration, du semainier, des agendas et des saisies faites dans l'app.
//
// Économie de lectures (quota Firestore partagé) : une clé résume toutes les entrées ; si elle
// n'a pas changé depuis le dernier calcul, rien n'est relu ni écrit. L'app doit mettre à jour
// vision/planning.majLe à chaque saisie ou correction pour que la clé change.
import { calculerJour, jourSemaine } from './moteur.js';
import { empreinte } from './outils.mjs';
import { joursEntre, decaler } from './calendrier.mjs';

export const HORIZON = 60;

// Champs dont l'écart avec le planning validé est signalé
const cleValidee = c => c ? empreinte([c.depot && [c.depot.qui, c.depot.heure], c.recup && [c.recup.qui, c.recup.heure],
  c.e1 && c.e1.creneaux, c.e2 && [c.e2.mode, c.e2.creneaux]]) : null;

export async function executerPlanning(fs, aujourdhui) {
  const t0 = Date.now();
  const base = await fs.lireLot(['vision/config', 'vision/etat', 'vision/agenda', 'vision/planning']);
  const config = base['vision/config'] || {}, etat = base['vision/etat'] || {};
  const index = base['vision/planning'] || {};
  if (!config.famille) { console.log('Planning : configuration familiale absente, rien calculé'); return { ignore: true }; }

  const tousJours = joursEntre(decaler(aujourdhui, -1), decaler(aujourdhui, HORIZON));   // la veille sert aux lendemains de garde
  const jours = tousJours.slice(1).filter(d => ![0, 6].includes(jourSemaine(d)));
  const empreintesAgenda = (base['vision/agenda'] || {}).empreintes || {};
  const cle = empreinte({
    du: aujourdhui,
    agenda: tousJours.map(d => empreintesAgenda[d] || null),
    semainier: etat.semainier ? etat.semainier.importe : null,
    config: config.majLe || null,
    saisies: index.majLe || null
  });
  if (index.cle === cle) { console.log(`Planning : entrées inchangées, aucun calcul (${Date.now() - t0} ms)`); return { inchange: true }; }

  const chemins = [];
  for (const d of tousJours) chemins.push(`vision/agenda/jours/${d}`);
  for (const d of jours) chemins.push(`vision/semainier/jours/${d}`, `vision/planning/jours/${d}`);
  const docs = await fs.lireLot(chemins);

  const ecritures = [];
  let points = 0, aConfirmer = 0;
  for (const d of jours) {
    const ancien = docs[`vision/planning/jours/${d}`] || {};
    const calc = calculerJour({
      date: d,
      sem: docs[`vision/semainier/jours/${d}`],
      agenda: docs[`vision/agenda/jours/${d}`] || undefined,
      agendaVeille: docs[`vision/agenda/jours/${decaler(d, -1)}`] || undefined,
      saisieB: ancien.saisies ? ancien.saisies.B : null,
      corrige: ancien.corrige || null
    }, config.famille);
    if (ancien.valide && ancien.valide.calculeAlors && cleValidee(ancien.valide.calculeAlors) !== cleValidee(calc)) {
      calc.ecartValide = true;
      calc.points.push('Différent du planning validé : une source a changé depuis la validation');
    }
    points += calc.points.length;
    if ((calc.depot && calc.depot.aConfirmer) || (calc.recup && calc.recup.aConfirmer)) aConfirmer++;
    if (empreinte(ancien.calcule || null) !== empreinte(calc)) {
      ecritures.push({ chemin: `vision/planning/jours/${d}`, donnees: { calcule: calc }, champsModifies: ['calcule'] });
    }
  }
  const maintenant = { __horodatage: new Date().toISOString() };
  const bilan = { calcule: maintenant, jours: jours.length, ecrits: ecritures.length, points, aConfirmer, duree_ms: Date.now() - t0 };
  ecritures.push({ chemin: 'vision/planning', donnees: { cle, calculeLe: maintenant }, champsModifies: ['cle', 'calculeLe'] });
  ecritures.push({ chemin: 'vision/etat', donnees: { planning: bilan }, champsModifies: ['planning'] });
  await fs.ecrire(ecritures);
  console.log(`Planning : ${jours.length} jours calculés, ${bilan.ecrits} écrits, ${points} points à vérifier, ${aConfirmer} jours à confirmer ; ${bilan.duree_ms} ms`);
  return bilan;
}
