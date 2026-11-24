// Tâche : plats de la semaine. Le Raccourci iOS dépose le dernier PDF du plan repas dans
// vision/repas = { nom, pdf (octets) }. Quand ce PDF change, on lit le tableau de sa page 1
// et on écrit vision/plats = { empreinte, nom, titre, plats: [{ id, jour, repas, proteine,
// temps, pour, page }], faits: [], lecteur } (les plats faits sont cochés depuis l'app ; un nouveau
// PDF repart de zéro ; le même PDF relu par un lecteur plus récent garde ses plats faits). Aucun appel à Claude. Journaux : des comptes seulement.
import { pathToFileURL } from 'node:url';
import { connecter } from './firestore.mjs';
import { empreinte } from './outils.mjs';
import { lirePlan, LECTEUR } from './repas.js';

export async function pagesDuPdf(octets) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: octets, verbosity: 0, isEvalSupported: false }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const t = await (await doc.getPage(i)).getTextContent();
    pages.push(t.items.map(it => ({ x: it.transform[4], y: it.transform[5], s: it.str })));
  }
  return pages;
}

export async function executer() {
  const t0 = Date.now();
  const fs = await connecter(JSON.parse(process.env.FIREBASE_SA));
  const repas = await fs.lire('vision/repas');
  if (!repas || !repas.pdf) { console.log('plan repas : aucun PDF reçu'); return; }
  const emp = empreinte(repas.pdf);
  const actuel = await fs.lire('vision/plats');
  // Même PDF déjà lu par cette version du lecteur : rien à faire.
  const memePdf = !!actuel && actuel.empreinte === emp;
  if (memePdf && actuel.lecteur === LECTEUR) { console.log('plan repas : inchangé'); return; }
  // Même PDF relu par un lecteur plus récent : les plats déjà cochés « faits » sont gardés.
  const faits = memePdf && Array.isArray(actuel.faits) ? actuel.faits : [];
  const octets = new Uint8Array(Buffer.from(repas.pdf, 'base64'));
  const taille = octets.length;   // PDF.js vide le tableau après lecture
  let plan = null;
  let illisible = null;   // le PDF lui-même ne s'ouvre pas (à distinguer d'un tableau non reconnu)
  try { plan = lirePlan(await pagesDuPdf(octets)); } catch (e) { plan = null; illisible = e.name || 'erreur'; }
  const donnees = plan && plan.plats.length
    ? { empreinte: emp, lecteur: LECTEUR, nom: repas.nom || '', titre: plan.titre, plats: plan.plats, faits, lu: new Date().toISOString(), erreur: null }
    : { empreinte: emp, lecteur: LECTEUR, nom: repas.nom || '', titre: '', plats: [], faits: [], lu: new Date().toISOString(), erreur: illisible ? 'PDF illisible' : 'tableau introuvable' };
  await fs.ecrire([{ chemin: 'vision/plats', donnees }]);
  const avecPage = donnees.plats.filter(p => p.page > 1).length;
  console.log(`plan repas : ${memePdf ? 'PDF relu' : 'nouveau PDF'} (${Math.round(taille / 1024)} Ko), ${donnees.plats.length} plats dont ${avecPage} avec leur page de recette${donnees.erreur ? ', ' + donnees.erreur + (illisible ? ' (' + illisible + ')' : '') : ''} ; ${Date.now() - t0} ms`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  executer().catch(e => { console.log('plan repas : échec (' + e.name + ')'); process.exitCode = 1; });
}
