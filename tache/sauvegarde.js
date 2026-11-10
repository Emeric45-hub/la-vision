// Sauvegarde : règles (fonctions pures, testées sous Node).
//
// Ce qui est sauvegardé : tout ce qui est saisi à la main et ne peut pas être recalculé
// (configuration, corrections et validations du planning, pointages, post-it, comptes à rebours,
// journaux des autres apps du projet). Ce qui est exclu : ce que la tâche relit ou recalcule à
// chaque passage (agendas, menus, briefing, données du Raccourci) et le PDF du plan repas.
export const EXCLUS = ['vision/agenda', 'vision/semainier', 'vision/repas', 'vision/cantine', 'vision/plats', 'vision/briefing', 'vision/raccourci'];
export const exclu = chemin => EXCLUS.some(x => chemin === x || chemin.startsWith(x + '/'));

// Une sauvegarde par semaine (marge d'une demi-journée pour ne pas glisser d'un passage à l'autre).
export const INTERVALLE_MS = 6.5 * 864e5;
export function aFaire(dernier, maintenant = Date.now()) {
  if (!dernier || !dernier.le) return true;
  const t = new Date(dernier.le).getTime();
  return !Number.isFinite(t) || maintenant - t >= INTERVALLE_MS;
}
