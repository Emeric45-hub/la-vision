// Coche « jour d'école » dans l'app de pointage de l'assistante maternelle, pour aujourd'hui,
// quand le planning prévoit l'école et la nounou après l'école. N'écrit jamais sur une valeur
// existante (cochée ou décochée à la main) : l'écriture échoue si le document existe déjà.
import { fusionner, ecoleAvecNounou, jourSemaine } from './moteur.js';

export async function cocherEcole(fs, aujourdhui) {
  if ([0, 6].includes(jourSemaine(aujourdhui))) return { ignore: true };
  const config = (await fs.lire('vision/config')) || {};
  const fam = config.famille, journal = fam && fam.nounou && fam.nounou.journal;
  if (!journal) { console.log('Jour d\'école : journal de pointage non configuré'); return { ignore: true }; }
  const chemin = `nounou/${journal}/schooldays/${aujourdhui}`;
  const docs = await fs.lireLot([`vision/planning/jours/${aujourdhui}`, chemin]);
  if (docs[chemin]) { console.log('Jour d\'école : déjà renseigné'); return { deja: true }; }
  const p = docs[`vision/planning/jours/${aujourdhui}`] || {};
  const aff = fusionner(p.calcule || null, p.corrige, p.valide, fam);
  if (!ecoleAvecNounou(p.calcule, aff, fam)) { console.log('Jour d\'école : rien à cocher'); return { rien: true }; }
  await fs.ecrire([{ chemin, donnees: { school: true }, siAbsent: true }]);
  console.log('Jour d\'école : coché');
  return { coche: true };
}
