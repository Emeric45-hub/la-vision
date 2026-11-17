// Plan repas de la semaine : lecture du tableau de la page 1 du PDF (fonctions pures, testées
// sous Node). Entrée : les morceaux de texte de chaque page avec leur position, tels que les
// donne PDF.js ({ x, y, s }, y croissant vers le haut). Le tableau a pour en-têtes
// « Jour · Repas · Protéine · Temps · Pour » ; une ligne commence par le jour dans la première
// colonne ; un plat peut tenir sur deux lignes. La page de la recette de chaque plat est cherchée
// dans la suite du PDF (pageRecette) : sert à ouvrir le PDF à la bonne page.

const EN_TETES = ['jour', 'repas', 'protéine', 'temps', 'pour'];
const FIN = /^(synthèse|conformité|liste des courses)/i;

export function lirePlan(pages) {
  const p1 = (pages[0] || []).filter(m => m.s && m.s.trim());
  const entete = p1.filter(m => EN_TETES.includes(m.s.trim().toLowerCase()));
  if (entete.length < 4) return null;
  const yTete = entete[0].y;
  const col = Object.fromEntries(entete.map(m => [m.s.trim().toLowerCase(), m.x]));
  const yFin = Math.max(-Infinity, ...p1.filter(m => FIN.test(m.s.trim()) && m.y < yTete).map(m => m.y));
  const corps = p1.filter(m => m.y < yTete - 2 && m.y > yFin + 2);
  const colonne = x => Object.entries(col).reduce((a, [k, cx]) => (cx <= x + 3 && (!a || cx > col[a]) ? k : a), null);
  const lignes = corps.filter(m => colonne(m.x) === 'jour').sort((a, b) => b.y - a.y);
  if (!lignes.length) return null;
  const plats = lignes.map((l, i) => ({ id: String(i), jour: l.s.trim(), repas: [], proteine: [], temps: [], pour: [] }));
  for (const m of corps) {
    const c = colonne(m.x);
    if (!c || c === 'jour') continue;
    // Rattaché à la ligne dont le jour est le plus proche verticalement
    let k = 0;
    lignes.forEach((l, i) => { if (Math.abs(l.y - m.y) < Math.abs(lignes[k].y - m.y)) k = i; });
    const cle = c === 'protéine' ? 'proteine' : c;
    plats[k][cle].push(m);
  }
  const texte = arr => arr.sort((a, b) => b.y - a.y || a.x - b.x).map(m => m.s.trim()).join(' ').replace(/\s+/g, ' ').trim();
  const titre = p1.filter(m => m.y > yTete).sort((a, b) => b.y - a.y).map(m => m.s.trim());
  return {
    titre: titre[1] || titre[0] || '',
    plats: plats.map(p => ({ id: p.id, jour: p.jour, repas: texte(p.repas), proteine: texte(p.proteine), temps: texte(p.temps), pour: texte(p.pour), page: pageRecette(pages, p.jour, texte(p.repas)) }))
      .filter(p => p.repas)
  };
}

// Version du lecteur : l'augmenter fait relire le PDF déjà reçu (même empreinte) au passage suivant.
export const LECTEUR = 2;

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
//  2. un des segments de la première ligne (séparés par un tiret ou deux-points) est le jour ;
//  3. la première ligne, qui a un séparateur, contient le jour.
export function pageRecette(pages, jour, repas) {
  const j = norme(jour), r = norme(repas);
  const hauts = pages.map((p, i) => i === 0 ? [] : lignesDuHaut(p, 6));
  const SEP = /\s[—–-]\s|\s*:\s*/;
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
