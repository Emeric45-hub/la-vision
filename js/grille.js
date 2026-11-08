// Grille mensuelle pour l'assistante maternelle : une image A4 paysage, dessinée sur un canvas
// pour un rendu identique sur tous les appareils. Disposition reprise du document qu'elle
// recevait jusqu'ici : titre du mois, bandeau des jours, puis pour chaque jour une ligne pour
// l'enfant non scolarisé (dépôt – récupération, initiale du parent) et une ligne pour les
// créneaux de l'enfant scolarisé chez la nounou.
import { affiche } from "../tache/moteur.js";

const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const JOURS = ["LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI"];

const hh = x => x ? affiche(x) : "?";
const plages = cr => (cr || []).map(c => `${hh(c.debut)} - ${hh(c.fin)}`).join(" / ");

// Texte d'un jour (pur, testé sous Node). Renvoie { l1, l2, note } ; l1 vaut « - » sans accueil.
export function lignesJour(j, fam) {
  if (!j || !j.calc || !j.aff) return { l1: "", l2: "", note: "" };
  const c = j.calc, a = j.aff;
  const ini = q => q === "A" ? ` (${fam.A.initiale})` : q === "B" ? ` (${fam.B.initiale})` : "";
  if (c.ferie) return { l1: "-", l2: "", note: c.ferie };
  let l1 = "-";
  if (a.e1) {
    const d = a.depot || {}, r = a.recup || {};
    l1 = `${hh(d.heure)}${ini(d.qui)} - ${hh(r.heure)}${ini(r.qui)}`;
  }
  const l2 = plages(a.creneauxE2);
  return { l1: l1 === "-" && l2 ? "" : l1, l2, note: a.note || "" };
}

// Semaines (lundi → vendredi) couvrant le mois ; les jours hors du mois sont marqués.
export function semaines(mois) {
  const [a, m] = mois.split("-").map(Number);
  const premier = new Date(Date.UTC(a, m - 1, 1));
  const debut = new Date(premier); debut.setUTCDate(1 - ((premier.getUTCDay() + 6) % 7));
  const dernier = new Date(Date.UTC(a, m, 0));
  const res = [];
  for (let l = new Date(debut); l <= dernier; l.setUTCDate(l.getUTCDate() + 7)) {
    const sem = [];
    for (let i = 0; i < 5; i++) {
      const x = new Date(l); x.setUTCDate(l.getUTCDate() + i);
      sem.push({ d: x.toISOString().slice(0, 10), num: x.getUTCDate(), dansMois: x.getUTCMonth() === m - 1 });
    }
    if (sem.some(s => s.dansMois)) res.push(sem);   // semaine dont seul le week-end est dans le mois : ignorée
  }
  return res;
}

const ROUGE = "#E3261F", ENCRE = "#1E2A5A", GRIS = "#D6D6D6", GRIS_TEXTE = "#9A9A9A";
const POLICE = '-apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif';

// Dessine la grille ; jours = { 'YYYY-MM-DD': jour affiché } ; renvoie le canvas.
export function dessiner(canvas, mois, jours, fam) {
  const L = 2400, H = Math.round(L / Math.SQRT2);       // A4 paysage
  canvas.width = L; canvas.height = H;
  const g = canvas.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, L, H);
  const [a, m] = mois.split("-").map(Number);
  const marge = 90;

  g.fillStyle = ROUGE; g.font = `bold 150px ${POLICE}`; g.textBaseline = "alphabetic"; g.textAlign = "left";
  g.fillText(MOIS[m - 1], marge, 210);
  g.fillStyle = "#2B2B2B"; g.font = `300 84px ${POLICE}`;
  g.fillText(String(a), marge, 320);

  const sems = semaines(mois);
  const haut = 380, bandeau = 64, x0 = marge, larg = (L - 2 * marge) / 5;
  g.fillStyle = ROUGE; g.fillRect(x0, haut, L - 2 * marge, bandeau);
  g.fillStyle = "#fff"; g.font = `bold 36px ${POLICE}`; g.textAlign = "center"; g.textBaseline = "middle";
  JOURS.forEach((j, i) => g.fillText(j, x0 + larg * (i + 0.5), haut + bandeau / 2 + 2));

  const y0 = haut + bandeau, hNum = 58;
  const hContenu = Math.min(200, (H - marge - y0) / sems.length - hNum);
  // Une seule taille de texte pour toute la grille : la plus grande qui fait tenir chaque ligne.
  const max = larg - 30;
  let taille = 42;
  const textes = sems.flat().filter(j => j.dansMois).flatMap(j => { const t = lignesJour(jours[j.d], fam); return [t.l1, t.l2]; }).filter(Boolean);
  const tient = t => { g.font = `500 ${t}px ${POLICE}`; return textes.every(x => g.measureText(x).width <= max); };
  while (taille > 20 && !tient(taille)) taille -= 1;
  const ajuster = (txt, t, poids) => {
    do { g.font = `${poids} ${t}px ${POLICE}`; t -= 1; } while (g.measureText(txt).width > max && t > 16);
  };
  sems.forEach((sem, s) => {
    const y = y0 + s * (hNum + hContenu);
    sem.forEach((jr, i) => {
      const x = x0 + i * larg, cx = x + larg / 2;
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillStyle = jr.dansMois ? "#111" : GRIS_TEXTE; g.font = `bold 38px ${POLICE}`;
      g.fillText(String(jr.num), cx, y + hNum / 2 + 2);
      if (!jr.dansMois) return;
      const t = lignesJour(jours[jr.d], fam);
      const lignes = [[t.l1, taille, "500", ENCRE], [t.l2, taille, "500", ENCRE], [t.note, Math.round(taille * 0.78), "italic 400", "#555"]].filter(l => l[0]);
      const pas = Math.round(taille * 1.2), centre = y + hNum + hContenu / 2;
      lignes.forEach(([txt, tl, poids, coul], k) => {
        ajuster(txt, tl, poids);
        g.fillStyle = coul;
        g.fillText(txt, cx, centre + (k - (lignes.length - 1) / 2) * pas);
      });
    });
    // Traits : sous la ligne des numéros, sous la semaine, entre les colonnes
    g.strokeStyle = GRIS; g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x0, y + hNum); g.lineTo(L - marge, y + hNum);
    g.moveTo(x0, y + hNum + hContenu); g.lineTo(L - marge, y + hNum + hContenu);
    for (let i = 0; i <= 5; i++) { g.moveTo(x0 + i * larg, y); g.lineTo(x0 + i * larg, y + hNum + hContenu); }
    g.stroke();
  });
  return canvas;
}
