// Météo de l'accueil (Open-Meteo, sans clé) : calculs purs, testés sous Node.
export const SEUILS = { bonnet: 5, manteau: 12, gilet: 18, pluie: 50 };

// Codes météo de l'OMS → [description, pictogramme]
const CODES = [
  [[0], "soleil", "☀️"], [[1], "plutôt dégagé", "🌤️"], [[2], "nuageux", "⛅"], [[3], "couvert", "☁️"],
  [[45, 48], "brouillard", "🌫️"], [[51, 53, 55, 56, 57], "bruine", "🌦️"], [[61, 63, 65, 66, 67, 80, 81, 82], "pluie", "🌧️"],
  [[71, 73, 75, 77, 85, 86], "neige", "🌨️"], [[95, 96, 99], "orage", "⛈️"]
];
export function decrire(code) {
  const c = CODES.find(([l]) => l.includes(code));
  return c ? { texte: c[1], icone: c[2] } : { texte: "?", icone: "·" };
}

// Conseil d'habillage à partir de la température ressentie et du risque de pluie.
export function conseil(ressenti, pluie, s = SEUILS) {
  const l = [];
  if (ressenti < s.bonnet) l.push("manteau, bonnet et gants");
  else if (ressenti < s.manteau) l.push("manteau");
  else if (ressenti <= s.gilet) l.push("gilet");
  else l.push("tenue légère");
  if (pluie >= s.pluie) l.push("imperméable et bottes");
  return l.join(" + ");
}

// Valeurs d'une heure donnée ('AAAA-MM-JJTHH:MM', heure ronde ou demi-heure : moyenne des deux heures).
export function aHeure(h, quand) {
  const i0 = h.time.indexOf(quand.slice(0, 13) + ":00");
  if (i0 < 0) return null;
  const demi = quand.slice(14, 16) === "30" && i0 + 1 < h.time.length;
  const v = k => demi ? (h[k][i0] + h[k][i0 + 1]) / 2 : h[k][i0];
  return {
    temp: Math.round(v("temperature_2m")), ressenti: Math.round(v("apparent_temperature")),
    pluie: Math.round(Math.max(h.precipitation_probability[i0], demi ? h.precipitation_probability[i0 + 1] : 0)),
    code: h.weather_code[i0]
  };
}

// Créneaux affichés selon l'heure : ce matin 8h (avant 9h), sortie d'école 16h30 (avant 17h), demain 8h.
// Le conseil porte sur la prochaine sortie : ce matin, sinon cet après-midi, sinon demain matin.
export function creneaux(data, jour, demain, heure, s = SEUILS) {
  const h = data.hourly, res = [];
  if (heure < "09:00") res.push({ cle: "matin", libelle: "8h", ...aHeure(h, `${jour}T08:00`) });
  if (heure < "17:00") res.push({ cle: "sortie", libelle: "16h30", ...aHeure(h, `${jour}T16:30`) });
  res.push({ cle: "demain", libelle: "Demain 8h", ...aHeure(h, `${demain}T08:00`) });
  const p = res.find(x => x.temp !== undefined);
  const quand = !p ? null : p.cle === "matin" ? "Ce matin" : p.cle === "sortie" ? "Cet après-midi" : "Demain matin";
  return { creneaux: res.filter(x => x.temp !== undefined), conseil: p ? `${quand} : ${conseil(p.ressenti, p.pluie, s)}` : null };
}

export const JOURS_PREVUS = 7;
export function url(lat, lon) {
  return "https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lon +
    "&current=temperature_2m,apparent_temperature,weather_code" +
    "&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code" +
    "&daily=sunrise,sunset,temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max" +
    "&timezone=Europe%2FParis&forecast_days=" + JOURS_PREVUS;
}

/* ---------- Fenêtre de détail : heure par heure, puis jour par jour ---------- */

// Pictogramme d'une heure : la nuit, pas de soleil (ciel dégagé → lune, nuages sans soleil).
export function pictoHeure(code, nuit) {
  if (nuit && (code === 0 || code === 1)) return "🌙";
  if (nuit && code === 2) return "☁️";
  return decrire(code).icone;
}

// Nuit à une heure donnée, d'après le lever et le coucher du soleil du jour (inconnu : jour).
function nuitA(daily, quand) {
  const i = daily && daily.time ? daily.time.indexOf(quand.slice(0, 10)) : -1;
  if (i < 0 || !daily.sunrise || !daily.sunset) return false;
  return quand < daily.sunrise[i] || quand >= daily.sunset[i];
}

// Les n prochaines heures à partir de l'heure en cours (quand : 'AAAA-MM-JJTHH:MM', heure de Paris).
// Chaque heure : { quand, jour, heure (0-23), temp, ressenti, pluie, code, nuit }.
export function heures(data, quand, n = 48) {
  const h = data && data.hourly;
  if (!h || !h.time) return [];
  const debut = quand.slice(0, 13) + ":00";
  const i0 = h.time.findIndex(t => t >= debut);
  if (i0 < 0) return [];
  const res = [];
  for (let i = i0; i < h.time.length && res.length < n; i++) {
    if (h.temperature_2m[i] == null) continue;
    res.push({
      quand: h.time[i], jour: h.time[i].slice(0, 10), heure: Number(h.time[i].slice(11, 13)),
      temp: Math.round(h.temperature_2m[i]), ressenti: Math.round(h.apparent_temperature[i]),
      pluie: Math.round(h.precipitation_probability[i] || 0), code: h.weather_code[i],
      nuit: nuitA(data.daily, h.time[i])
    });
  }
  return res;
}

// Les jours à venir à partir d'aujourd'hui : { date, min, max, code, pluie } (code et pluie à null
// si la prévision gardée sur l'appareil est d'un ancien format).
export function jours(data, aujourdhui, n = JOURS_PREVUS) {
  const d = data && data.daily;
  if (!d || !d.time) return [];
  return d.time.map((date, i) => ({
    date,
    min: d.temperature_2m_min[i] == null ? null : Math.round(d.temperature_2m_min[i]),
    max: d.temperature_2m_max[i] == null ? null : Math.round(d.temperature_2m_max[i]),
    code: d.weather_code && d.weather_code[i] != null ? d.weather_code[i] : null,
    pluie: d.precipitation_probability_max && d.precipitation_probability_max[i] != null ? Math.round(d.precipitation_probability_max[i]) : null
  })).filter(x => x.date >= aujourdhui && x.max != null).slice(0, n);
}

// Notes d'habillage récurrentes (famille.habillage = [{ jours: [1..7, 0 = dimanche], enfant: "e1" | "e2",
// texte, jusqua: "HH:MM", ecole: true }]). ecole : seulement si l'enfant est à l'école ce jour-là
// (ni vacances, ni férié). Renvoie les textes à afficher, préfixés du prénom.
export function notesHabillage(regles, { jourSemaine, heure, lieux }, fam) {
  return (regles || []).filter(r =>
    (r.jours || []).includes(jourSemaine) &&
    (!r.jusqua || heure < r.jusqua) &&
    (!r.ecole || lieux[r.enfant] === "ecole")
  ).map(r => `${(fam.enfants[r.enfant] || {}).prenom || ""} : ${r.texte}`.replace(/^ : /, ""));
}
