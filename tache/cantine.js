// Menus de la cantine : lecture du texte de la page du prestataire (fonctions pures, testées
// sous Node). La page affiche plusieurs semaines ; chacune commence par « Semaine du JJ/MM/AAAA
// au … », puis les jours (« lundi » … « vendredi ») suivis de leurs plats, une ligne par plat.

const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'];
// Lignes de la page qui ne sont pas des plats (navigation, mentions légales, labels).
const HORS_MENU = /^(❮|❯|imprimer|cliquer sur|papillote|label rouge|appellation|agriculture biologique|semaine du)/i;

const decaler = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// Texte de la page → { 'AAAA-MM-JJ': ['plat', …] } (jours sans plat omis).
export function lireMenus(texte) {
  const res = {};
  const lignes = String(texte || '').split('\n').map(l => l.trim()).filter(Boolean);
  let lundi = null, jour = null;
  for (const l of lignes) {
    const s = /^semaine du (\d{2})\/(\d{2})\/(\d{4})/i.exec(l);
    if (s) { lundi = `${s[3]}-${s[2]}-${s[1]}`; jour = null; continue; }
    if (!lundi) continue;
    const i = JOURS.indexOf(l.toLowerCase());
    if (i >= 0) { jour = decaler(lundi, i); continue; }
    if (HORS_MENU.test(l) || l.length > 120) { jour = null; continue; }
    if (jour) (res[jour] = res[jour] || []).push(l);
  }
  return res;
}

// Alternative végétarienne servie à côté d'un plat avec viande ou poisson : retirée de la ligne de
// l'enfant (qui prend l'option avec viande). Un jour entièrement végétarien est gardé tel quel.
const VEGE = /nuggets? de bl[ée]|v[ée]g[ée]ta|\bsoja\b|tofu|falafel|(steak|pan[ée]|galette) de (bl[ée]|l[ée]gumes|c[ée]r[ée]ales)/i;
const VIANDE = /poulet|dinde|volaille|b(œ|oe)uf|veau|porc|jambon|lardon|saucisse|chipolata|merguez|knack|agneau|canard|lapin|steak hach|viande hach|hachis|bolognaise|poisson|colin|cabillaud|merlu|\blieu\b|hoki|saumon|thon|sardine|maquereau|calamar|\bmoules?\b|crevette|escalope|aiguillette|r[ôo]ti|cordon|bourguignon|blanquette|tajine|chili con carne/i;
export function pourEnfant(plats) {
  const liste = plats || [];
  return liste.some(p => VIANDE.test(p) && !VEGE.test(p)) ? liste.filter(p => !VEGE.test(p)) : liste;
}
