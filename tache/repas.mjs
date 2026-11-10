// Tâche : plats de la semaine. Le Raccourci iOS dépose le dernier PDF du plan repas dans
// vision/repas = { nom, pdf (octets) }. Quand ce PDF change, on lit le tableau de sa page 1
// et on écrit vision/plats = { empreinte, nom, titre, plats: [{ id, jour, repas, proteine,
// temps, pour, page }], faits: [] } (les plats faits sont cochés depuis l'app ; un nouveau PDF
// repart de zéro). Aucun appel à Claude. Journaux : des comptes seulement.
import { pathToFileURL } from 'node:url';
import { connecter } from './firestore.mjs';
import { empreinte } from './outils.mjs';
import { lirePlan } from './repas.js';

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
  if (actuel && actuel.empreinte === emp) { console.log('plan repas : inchangé'); return; }
  const octets = new Uint8Array(Buffer.from(repas.pdf, 'base64'));
  let plan = null;
  try { plan = lirePlan(await pagesDuPdf(octets)); } catch (e) { plan = null; }
  const donnees = plan && plan.plats.length
    ? { empreinte: emp, nom: repas.nom || '', titre: plan.titre, plats: plan.plats, faits: [], lu: new Date().toISOString(), erreur: null }
    : { empreinte: emp, nom: repas.nom || '', titre: '', plats: [], faits: [], lu: new Date().toISOString(), erreur: 'tableau introuvable' };
  await fs.ecrire([{ chemin: 'vision/plats', donnees }]);
  console.log(`plan repas : nouveau PDF (${Math.round(octets.length / 1024)} Ko), ${donnees.plats.length} plats${donnees.erreur ? ', tableau introuvable' : ''} ; ${Date.now() - t0} ms`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  executer().catch(e => { console.log('plan repas : échec (' + e.name + ')'); process.exitCode = 1; });
}
