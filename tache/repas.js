// Plan repas de la semaine : lecture du tableau de la page 1 du PDF (fonctions pures, testées
// sous Node). Entrée : les morceaux de texte de chaque page avec leur position, tels que les
// donne PDF.js ({ x, y, s }, y croissant vers le haut).
//
// La mise en page change d'un PDF à l'autre ; le lecteur ne suppose donc que ceci : la page 1 a un
// tableau dont la ligne d'en-têtes contient « Repas » (ou « Plat »…) et au moins une autre colonne
// connue (Jour, Protéine, Temps, Pour). Les autres colonnes (Source…) sont ignorées. Avec une
// colonne « Jour », chaque jour ouvre une ligne ; sans elle, chaque durée de la colonne « Temps »
// (à défaut chaque protéine) ouvre une ligne, et le plat est nommé « Repas 1 », « Repas 2 »…
// Un plat peut tenir sur plusieurs lignes de texte. La page de la recette de chaque plat est
// cherchée dans la suite du PDF (pageRecette) : sert à ouvrir le PDF à la bonne page.

const SYNONYMES = {
  jour: ['jour', 'jours', 'quand'],
  repas: ['repas', 'plat', 'plats', 'diner', 'diners', 'recette', 'recettes', 'menu'],
  proteine: ['proteine', 'proteines'],
  temps: ['temps', 'duree', 'preparation'],
  pour: ['pour', 'portions', 'personnes', 'pers']
};
const cleEnTete = s => { const n = norme(s); return Object.keys(SYNONYMES).find(k => SYNONYMES[k].includes(n)) || null; };
const FIN = /^(synthèse|conformité|liste des courses|par portion|batch)/i;
const DUREE = /\d\s*(min|h)\b/i;

// Ligne d'en-têtes : la plus haute ligne de la page qui a « Repas » et une autre colonne connue.
function enTetes(p1) {
  const tries = [...p1].sort((a, b) => b.y - a.y || a.x - b.x);
  for (const m of tries) {
    if (cleEnTete(m.s) !== 'repas') continue;
    const ligne = tries.filter(q => Math.abs(q.y - m.y) < 2);
    if (ligne.some(q => { const k = cleEnTete(q.s); return k && k !== 'repas'; })) return ligne;
  }
  return null;
}

export function lirePlan(pages) {
  const p1 = (pages[0] || []).filter(m => m.s && m.s.trim());
  const entete = enTetes(p1);
  if (!entete) return null;
  const yTete = entete[0].y;
  const col = {};
  entete.forEach((m, i) => { const k = cleEnTete(m.s) || '_' + i; if (!(k in col)) col[k] = m.x; });
  const yFin = Math.max(-Infinity, ...p1.filter(m => FIN.test(m.s.trim()) && m.y < yTete).map(m => m.y));
  let corps = p1.filter(m => m.y < yTete - 2 && m.y > yFin + 2);
  const colonne = x => Object.entries(col).reduce((a, [k, cx]) => (cx <= x + 3 && (!a || cx > col[a]) ? k : a), null);

  // Lignes du tableau : { y, jour }
  let lignes;
  if ('jour' in col) {
    lignes = corps.filter(m => colonne(m.x) === 'jour').sort((a, b) => b.y - a.y).map(m => ({ y: m.y, jour: m.s.trim() }));
  } else {
    let reperes = corps.filter(m => colonne(m.x) === 'temps' && DUREE.test(m.s));
    if (!reperes.length) reperes = corps.filter(m => colonne(m.x) === 'proteine');
    reperes.sort((a, b) => b.y - a.y);
    lignes = [];
    for (const m of reperes) {
      const l = lignes[lignes.length - 1];
      if (l && l.y - m.y < 16) continue;            // cellule sur deux lignes de texte : même plat
      lignes.push({ y: m.y, jour: `Repas ${lignes.length + 1}` });
    }
    // Sans colonne « Jour », rien ne borne le tableau vers le bas : on ne garde que le texte proche d'une ligne.
    const ecart = lignes.length > 1 ? Math.min(...lignes.slice(1).map((l, i) => lignes[i].y - l.y)) : 40;
    corps = corps.filter(m => lignes.some(l => Math.abs(l.y - m.y) <= ecart * 0.6));
  }
  if (!lignes.length) return null;

  const plats = lignes.map((l, i) => ({ id: String(i), jour: l.jour, repas: [], proteine: [], temps: [], pour: [] }));
  for (const m of corps) {
    const c = colonne(m.x);
    if (!c || c === 'jour' || !(c in plats[0])) continue;
    // Rattaché à la ligne la plus proche verticalement
    let k = 0;
    lignes.forEach((l, i) => { if (Math.abs(l.y - m.y) < Math.abs(lignes[k].y - m.y)) k = i; });
    plats[k][c].push(m);
  }
  const texte = arr => arr.sort((a, b) => b.y - a.y || a.x - b.x).map(m => m.s.trim()).join(' ').replace(/\s+/g, ' ').replace(/\s+([,.)])/g, '$1').trim();
  const dessus = p1.filter(m => m.y > yTete + 2).sort((a, b) => b.y - a.y).map(m => m.s.trim());
  return {
    titre: dessus.find(t => /semaine du/i.test(t)) || dessus[1] || dessus[0] || '',
    plats: plats.map(p => { const repas = texte(p.repas); return { id: p.id, jour: p.jour, repas, proteine: texte(p.proteine), temps: texte(p.temps), pour: texte(p.pour), page: pageRecette(pages, p.jour, repas) }; })
      .filter(p => p.repas)
  };
}

// Version du lecteur : l'augmenter fait relire le PDF déjà reçu (même empreinte) au passage suivant.
export const LECTEUR = 3;

const norme = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim();
// Les n premières lignes d'une page (morceaux de même hauteur réunis), de haut en bas.
function lignesDuHaut(page, n) {
  const ms = (page || []).filter(m => m.s && m.s.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  const lignes = [];
  for (const m of ms) {
    const l = lignes[lignes.length - 1];
    if (l && Math.abs(l.y - m.y) < 2) l.s += ' ' + m.s.trim(); else { if (lignes.length === n) break; lignes.push({ y: m.y, s: m.s.trim() }); }
  }
  return lignes.map(l => l.s);
}

// Numéro de page (1 = première) de la recette d'un plat, cherchée à partir de la page 2 ; 1 si elle
// n'est pas trouvée. La mise en page du titre varie d'un PDF à l'autre (« Jour — Titre »,
// « Repas 1 — Jour » puis le titre en dessous…), d'où trois essais, du plus sûr au moins sûr :
//  1. le nom du plat commence une des premières lignes de la page ;
//  2. un des segments de la première ligne (séparés par un tiret, un point médian ou deux-points)
//     est le jour (ou « Repas n ») ;
//  3. la première ligne, qui a un séparateur, contient le jour.
export function pageRecette(pages, jour, repas) {
  const j = norme(jour), r = norme(repas);
  const hauts = pages.map((p, i) => i === 0 ? [] : lignesDuHaut(p, 6));
  const SEP = /\s[—–·-]\s|\s*:\s*/;
  if (r.length >= 4) {
    // Le nom doit commencer une ligne (ou suivre le séparateur de la première ligne) : une simple
    // mention dans une phrase (liste des courses, restes) ne compte pas.
    const commence = h => {
      const debuts = h.map((_, k) => h.slice(k).join(' '));
      const apres = (h[0] || '').split(SEP).slice(1).join(' ');
      if (apres) debuts.push([apres, ...h.slice(1)].join(' '));
      return debuts.some(d => (norme(d) + ' ').startsWith(r + ' '));
    };
    const i = hauts.findIndex(h => h.length && commence(h));
    if (i > 0) return i + 1;
  }
  if (!j) return 1;
  const segments = h => (h[0] || '').split(SEP).map(norme);
  let i = hauts.findIndex(h => h.length && segments(h).length > 1 && segments(h).includes(j));
  if (i > 0) return i + 1;
  i = hauts.findIndex(h => h.length && segments(h).length > 1 && (' ' + norme(h[0]) + ' ').includes(' ' + j + ' '));
  return i > 0 ? i + 1 : 1;
}
