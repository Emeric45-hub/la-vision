// Jours fériés en France métropolitaine, calculés (aucune source externe).
const pad = n => String(n).padStart(2, '0');
const iso = (a, m, j) => `${a}-${pad(m)}-${pad(j)}`;

// Dimanche de Pâques, algorithme grégorien anonyme (Meeus/Jones/Butcher).
export function paques(a) {
  const b = a % 19, c = Math.floor(a / 100), d = a % 100, e = Math.floor(c / 4), f = c % 4;
  const g = Math.floor((c + 8) / 25), h = Math.floor((c - g + 1) / 3);
  const i = (19 * b + c - e - h + 15) % 30, k = Math.floor(d / 4), l = d % 4;
  const m = (32 + 2 * f + 2 * k - i - l) % 7, n = Math.floor((b + 11 * i + 22 * m) / 451);
  const mois = Math.floor((i + m - 7 * n + 114) / 31), jour = ((i + m - 7 * n + 114) % 31) + 1;
  return new Date(Date.UTC(a, mois - 1, jour));
}

const decale = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return iso(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate()); };

// { "AAAA-MM-JJ": "Nom du jour férié" } pour une année
export function feries(a) {
  const p = paques(a);
  return {
    [iso(a, 1, 1)]: "Jour de l'an",
    [decale(p, 1)]: 'Lundi de Pâques',
    [iso(a, 5, 1)]: 'Fête du Travail',
    [iso(a, 5, 8)]: 'Victoire 1945',
    [decale(p, 39)]: 'Ascension',
    [decale(p, 50)]: 'Lundi de Pentecôte',
    [iso(a, 7, 14)]: 'Fête nationale',
    [iso(a, 8, 15)]: 'Assomption',
    [iso(a, 11, 1)]: 'Toussaint',
    [iso(a, 11, 11)]: 'Armistice 1918',
    [iso(a, 12, 25)]: 'Noël'
  };
}
