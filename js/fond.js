// Fond de l'écran : la météo quand elle est marquée (grand soleil, couvert, pluie, orage, neige,
// brouillard), la saison les jours ordinaires (variable, partiellement nuageux, bruine).
// Décors dessinés et immobiles (pas d'animation : ménage les appareils anciens).

// Code météo (OMS) + date 'AAAA-MM-JJ' → nom d'ambiance (pur, testé sous Node).
export function ambiance(code, date) {
  if (code === 0) return "soleil";
  if (code === 3) return "couvert";
  if ([45, 48].includes(code)) return "brouillard";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "pluie";
  if ([95, 96, 99].includes(code)) return "orage";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "neige";
  return saison(date);   // 1, 2, bruine, inconnu
}

export function saison(date) {
  const md = (date || "").slice(5, 10);
  if (md >= "12-21" || md < "03-21") return "hiver";
  if (md < "06-21") return "printemps";
  if (md < "09-22") return "ete";
  return "automne";
}

/* ---------- Décors (SVG, repère 1000 × 700, recadré pour couvrir l'écran) ---------- */
// Pseudo-hasard déterministe : mêmes positions à chaque affichage.
const alea = graine => () => ((graine = (graine * 16807) % 2147483647) / 2147483647);
const svg = c => `<svg viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" aria-hidden="true">${c}</svg>`;

function nuages(n, opacite, graine) {
  const r = alea(graine); let s = "";
  for (let i = 0; i < n; i++) {
    const x = r() * 1000, y = 40 + r() * 220, l = 160 + r() * 220;
    s += `<g opacity="${opacite}" fill="#fff"><ellipse cx="${x}" cy="${y}" rx="${l / 2}" ry="${l / 6}"/><ellipse cx="${x - l / 6}" cy="${y - l / 9}" rx="${l / 4}" ry="${l / 7}"/><ellipse cx="${x + l / 7}" cy="${y - l / 8}" rx="${l / 5}" ry="${l / 6}"/></g>`;
  }
  return s;
}
function pluie(n, couleur, graine) {
  const r = alea(graine); let s = `<g stroke="${couleur}" stroke-width="1.6" stroke-linecap="round">`;
  for (let i = 0; i < n; i++) { const x = r() * 1050, y = r() * 700; s += `<line x1="${x}" y1="${y}" x2="${x - 9}" y2="${y + 26}"/>`; }
  return s + "</g>";
}
function flocons(n, graine) {
  const r = alea(graine); let s = `<g stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".9">`;
  for (let i = 0; i < n; i++) {
    const x = r() * 1000, y = r() * 700, t = 5 + r() * 7;
    s += `<g transform="translate(${x} ${y}) rotate(${r() * 60})"><line x1="${-t}" y1="0" x2="${t}" y2="0"/><line x1="${-t / 2}" y1="${-t * .87}" x2="${t / 2}" y2="${t * .87}"/><line x1="${-t / 2}" y1="${t * .87}" x2="${t / 2}" y2="${-t * .87}"/></g>`;
  }
  return s + "</g>";
}
function feuilles(graine) {
  const r = alea(graine), couleurs = ["#C8662B", "#D99A2B", "#A8461F", "#E0B04A"]; let s = "";
  const coins = [[0, 0], [1000, 0], [0, 700], [1000, 700]];
  for (let i = 0; i < 14; i++) {
    const [cx, cy] = coins[i % 4], x = cx + (cx ? -1 : 1) * r() * 220, y = cy + (cy ? -1 : 1) * r() * 180;
    s += `<path transform="translate(${x} ${y}) rotate(${r() * 360}) scale(${.8 + r() * .7})" d="M0 -18 C 12 -10, 12 10, 0 18 C -12 10, -12 -10, 0 -18 Z M0 -18 L0 22" fill="${couleurs[i % 4]}" stroke="${couleurs[i % 4]}" stroke-width="1.2" opacity=".55"/>`;
  }
  return s;
}
function fleurs(graine) {
  const r = alea(graine), couleurs = ["#F4A7C0", "#F7D46B", "#B9A6F2", "#F7B38A"]; let s = "";
  const coins = [[0, 700], [1000, 700], [0, 0], [1000, 0]];
  for (let i = 0; i < 12; i++) {
    const [cx, cy] = coins[i % 4], x = cx + (cx ? -1 : 1) * r() * 200, y = cy + (cy ? -1 : 1) * r() * 160, t = 7 + r() * 6, c = couleurs[i % 4];
    let p = "";
    for (let k = 0; k < 5; k++) { const a = k * 72 * Math.PI / 180; p += `<circle cx="${Math.cos(a) * t}" cy="${Math.sin(a) * t}" r="${t * .7}" fill="${c}"/>`; }
    s += `<g transform="translate(${x} ${y})" opacity=".55">${p}<circle r="${t * .45}" fill="#F7E07A"/></g>`;
  }
  return s;
}
function givre() {
  let s = `<g stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".7">`;
  const branche = (x, y, a, l, n) => {
    if (n === 0 || l < 6) return;
    const x2 = x + Math.cos(a) * l, y2 = y + Math.sin(a) * l;
    s += `<line x1="${x}" y1="${y}" x2="${x2}" y2="${y2}"/>`;
    branche(x2, y2, a - .5, l * .62, n - 1); branche(x2, y2, a + .5, l * .62, n - 1); branche(x2, y2, a, l * .7, n - 1);
  };
  for (const [x, y, a] of [[0, 0, .7], [1000, 0, 2.45], [0, 700, -.7], [1000, 700, -2.45]]) branche(x, y, a, 70, 4);
  return s + "</g>";
}

const DECORS = {
  soleil: () => svg(`<defs><radialGradient id="h"><stop offset="0" stop-color="#FFF6C8" stop-opacity=".95"/><stop offset=".35" stop-color="#FFE38A" stop-opacity=".55"/><stop offset="1" stop-color="#FFE38A" stop-opacity="0"/></radialGradient></defs><circle cx="880" cy="70" r="320" fill="url(#h)"/><circle cx="880" cy="70" r="55" fill="#FFF3B0"/>`),
  couvert: () => svg(nuages(9, .55, 7)),
  brouillard: () => svg(`<g fill="#fff">${[120, 260, 400, 540].map((y, i) => `<rect x="-50" y="${y}" width="1100" height="70" rx="35" opacity="${.35 - i * .05}"/>`).join("")}</g>`),
  pluie: () => svg(nuages(6, .35, 3) + pluie(140, "rgba(255,255,255,.55)", 11)),
  orage: () => svg(nuages(6, .25, 5) + pluie(150, "rgba(255,255,255,.45)", 13) + `<path d="M840 40 L790 190 L835 190 L795 330 L890 160 L842 160 L880 40 Z" fill="#FFE680" opacity=".9"/>`),
  neige: () => svg(flocons(90, 17)),
  automne: () => svg(feuilles(23)),
  hiver: () => svg(givre()),
  printemps: () => svg(fleurs(29)),
  ete: () => svg(`<defs><radialGradient id="e"><stop offset="0" stop-color="#FFE9B0" stop-opacity=".8"/><stop offset="1" stop-color="#FFE9B0" stop-opacity="0"/></radialGradient></defs><circle cx="900" cy="40" r="420" fill="url(#e)"/>`)
};

// Applique l'ambiance à la page (classe sur <body> pour le dégradé, décor dans un calque fixe).
let actuelle = null;
export function appliquerFond(nom) {
  if (!nom || nom === actuelle || !DECORS[nom]) return;
  actuelle = nom;
  let calque = document.getElementById("fond");
  if (!calque) { calque = document.createElement("div"); calque.id = "fond"; document.body.prepend(calque); }
  calque.innerHTML = DECORS[nom]();
  [...document.body.classList].filter(c => c.startsWith("fond-")).forEach(c => document.body.classList.remove(c));
  document.body.classList.add("fond-" + nom);
}
