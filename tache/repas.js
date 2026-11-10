// Plan repas de la semaine : lecture du tableau de la page 1 du PDF (fonctions pures, testées
// sous Node). Entrée : les morceaux de texte de chaque page avec leur position, tels que les
// donne PDF.js ({ x, y, s }, y croissant vers le haut). Le tableau a pour en-têtes
// « Jour · Repas · Protéine · Temps · Pour » ; une ligne commence par le jour dans la première
// colonne ; un plat peut tenir sur deux lignes. Chaque page de recette commence par
// « Jour — Titre » : sert à ouvrir le PDF à la bonne page.

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
    plats: plats.map(p => ({ id: p.id, jour: p.jour, repas: texte(p.repas), proteine: texte(p.proteine), temps: texte(p.temps), pour: texte(p.pour), page: pageRecette(pages, p.jour) }))
      .filter(p => p.repas)
  };
}

// Numéro de page (1 = première) de la recette du jour : première ligne « … jour … — … ».
export function pageRecette(pages, jour) {
  const j = jour.toLowerCase();
  for (let i = 1; i < pages.length; i++) {
    const haut = (pages[i] || []).filter(m => m.s && m.s.trim()).sort((a, b) => b.y - a.y);
    if (!haut.length) continue;
    const y0 = haut[0].y;
    const tete = haut.filter(m => Math.abs(m.y - y0) < 2).map(m => m.s).join(' ');
    const avant = tete.split('—')[0].toLowerCase();
    if (tete.includes('—') && avant.includes(j)) return i + 1;
  }
  return 1;
}
