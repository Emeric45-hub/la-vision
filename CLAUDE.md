# La Vision — consignes pour Claude

Tableau de bord familial : application web (PWA) publiée par GitHub Pages, données dans Firebase, tâche planifiée GitHub Actions.

## Règle n° 1 : le dépôt est public

Tout ce qui est dans ce dépôt est lisible par n'importe qui : code, historique Git, journaux des workflows, issues, PR.

- **Aucune donnée familiale dans le dépôt** : ni prénoms, ni lieux (ville, école, établissement), ni horaires, ni habitudes, ni noms de listes ou de calendriers. Cela vaut pour le code, les commentaires, les tests, la documentation, les messages de commit et les descriptions de PR.
- **Code générique** : parent A / parent B, enfant 1 / enfant 2, « lieu de travail secondaire », etc. Tout paramètre réel (prénoms, couleurs par enfant, horaires, trajets, jours, règles de garde, coordonnées météo, établissements) vit dans un document de configuration Firestore protégé, lu au démarrage par l'app et par la tâche planifiée.
- **Journaux = comptes seulement** : nombre d'événements, de jours générés, de points à vérifier, durées, codes d'erreur. Jamais un titre d'événement, une heure, un nom ou un contenu de menu.
- **Tests sur données fictives** uniquement.
- **Secrets** : uniquement dans les secrets GitHub ou dans Firestore. Jamais d'adresse iCal, de jeton ou de mot de passe dans un fichier.

Avant chaque commit, vérifier le diff sous cet angle.

## Architecture

| Élément | Rôle |
|---|---|
| PWA (GitHub Pages) | Lecture et écriture directes dans Firestore, connexion par Firebase Auth (e-mail / mot de passe, un compte unique). Météo lue directement (Open-Meteo, sans clé). |
| Firestore (projet partagé avec Chez Nounou et Diversif) | Stockage de tout : configuration, planning, pointages, données publiées par la tâche. |
| Tâches GitHub Actions, déclenchées depuis le dépôt privé `la-vision-tache` (code dans `tache/`) | Lit les agendas (iCal), applique les règles, écrit le planning calculé dans Firestore (compte de service, secret `FIREBASE_SA`), appelle l'API Claude pour les briefings. Ne dépend d'aucun téléphone. |
| Raccourcis iOS | Seulement pour les données qui n'existent que chez Apple (Rappels, calendrier local, anniversaires). Écriture par l'API REST Firestore avec un jeton Firebase Auth. |

Principe : **tout ce qui est déterministe est calculé par le code** (planning, conflits, heures). Claude ne rédige que le briefing. L'app fonctionne sans l'IA.

## Données Firestore

- Chez Nounou : `nounou/{journal}/sessions` = `{child, date: 'YYYY-MM-DD', start: 'HH:MM', end: 'HH:MM'|null}` ; `nounou/{journal}/schooldays/{date}` = `{school: bool}`. La Vision lit et écrit **au même format** pour que les deux apps restent synchronisées.
- Diversif : `journals/{journal}`.
- La Vision : sous `vision/…` (schéma dans `docs/decisions.md` dès qu'il est figé). Le planning d'un jour a deux couches : **calculé** (réécrit à chaque passage de la tâche) et **corrigé** (saisi à la main, jamais écrasé).

Règles de sécurité : accès réservé à l'identifiant (UID) du compte famille ; inscriptions désactivées. Tout nouveau bloc de règles se colle à l'intérieur de `match /databases/{database}/documents { … }`.

## Pile technique

- HTML, CSS et JavaScript sans framework ni étape de compilation (comme Chez Nounou, Diversif et AgendaPro).
- Firebase JS SDK 10.12.2 depuis gstatic, chargé à part pour que la page s'affiche même si Firebase échoue.
- Lecture du semainier Excel : SheetJS 0.18.5 (copie dans `vendor/`), lecteur repris d'AgendaPro **sans modification de logique**.
- API Claude : modèle `claude-sonnet-5-5`, `max_tokens` 1500, concaténer tous les blocs `type === 'text'` (le premier peut être un bloc de réflexion).
- Workflows : Node 22, `actions/checkout@v5`, `actions/setup-node@v5`.
- Firestore hors connexion renvoie son cache (parfois vide) **sans erreur** : ne jamais afficher un « 0 » sans savoir si la lecture vient du serveur. L'indicateur de fraîcheur couvre ce cas.

## Façon de travailler

- **Une étape à la fois**, puis attendre la validation du propriétaire du dépôt. Dire exactement où cliquer. Prévenir avant une attente longue.
- Circuit : branche → PR → le propriétaire clique « Merge pull request » puis « Confirm merge » → GitHub Pages publie.
- **Ne jamais pousser sur une branche dont la PR est déjà fusionnée** : nouvelle branche, nouvelle PR.
- **À chaque PR qui touche l'app, incrémenter `version.json`** (`AAAA-MM-JJ.n`) : c'est ce qui déclenche le rechargement automatique sur les appareils, et le numéro affiché en bas de l'écran permet de vérifier la version. Chaque fichier de l'app est chargé avec `?v=<version>` (carte d'import dans `index.html`) : **tout nouveau module JS doit être ajouté à la liste `MODULES` de `index.html`**.
- Commits : `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit …`.
- Création de PR : `gh api repos/Emeric45-hub/la-vision/pulls -X POST …` (GraphQL indisponible dans la session).
- Lancer un workflow sur une branche : `gh api -X POST repos/Emeric45-hub/la-vision/actions/workflows/<fichier>.yml/dispatches -f ref=<branche>`.
- Le réseau de la session n'atteint ni Google, ni Firebase, ni Open-Meteo : tout ce qui doit les joindre se teste par un workflow ou sur l'appareil.

## Documents

- `docs/decisions.md` : décisions techniques, datées.
- `docs/plan.md` : lots et étapes, avec leur état.
- `docs/reprise.md` : où on en est, pour reprendre une session.

Le cahier des charges fonctionnel complet (règles familiales comprises) n'est **pas** dans ce dépôt.
