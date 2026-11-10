// Fraîcheur des sources de l'accueil (pur, testé sous Node).
// Seuils en minutes : de jour, la tâche passe toutes les 30 min (alerte au-delà d'1 h) ;
// la nuit, toutes les 2 h (alerte au-delà de 4 h 30). Le Raccourci de l'iPhone passe toutes les
// 4 h de 6h30 à 20h30 et pas la nuit : sa « nuit » va de 21 h à 7 h (dernier passage à 20h30).
export const SEUILS = {
  agendas: { jour: { orange: 40, rouge: 60 }, nuit: { orange: 150, rouge: 270 } },
  rappels: { jour: { orange: 360, rouge: 24 * 60 }, nuit: { orange: 660, rouge: 24 * 60 }, plageNuit: [21, 7] },
  meteo: { jour: { orange: 90, rouge: 240 }, nuit: { orange: 90, rouge: 240 } }
};
export const estNuit = (heure, plage = [23, 6]) => { const h = Number(heure.slice(0, 2)); return h >= plage[0] || h < plage[1]; };

// lu : date de la dernière lecture réussie (ou null) ; maintenant : Date ; heure : 'HH:MM' à Paris.
export function niveau(source, lu, maintenant, heure) {
  if (!lu) return { niveau: "rouge", minutes: null };
  const minutes = Math.max(0, Math.round((maintenant - lu) / 60000));
  const s = SEUILS[source][estNuit(heure, SEUILS[source].plageNuit) ? "nuit" : "jour"];
  return { niveau: minutes > s.rouge ? "rouge" : minutes > s.orange ? "orange" : "ok", minutes };
}

export function depuis(minutes) {
  if (minutes == null) return "jamais";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return h < 24 ? `${h} h${m ? " " + String(m).padStart(2, "0") : ""}` : `${Math.floor(h / 24)} j`;
}
