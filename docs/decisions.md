# Décisions techniques

Chaque décision est datée. Une décision remplacée reste listée, barrée, avec la date du changement.

## Architecture

- **2026-11-05** — Application web (PWA) sur GitHub Pages, stockage Firestore dans le projet Firebase déjà utilisé par Chez Nounou et Diversif.
- **2026-11-05** — La lecture des agendas, l'application des règles et les briefings tournent dans une tâche GitHub Actions planifiée (toutes les 30 min), pas sur un téléphone.
- **2026-11-05** — Ce qui est déterministe (planning, conflits, heures) est calculé par le code. L'IA ne rédige que le briefing ; l'app fonctionne sans elle.
- **2026-11-05** — Indicateur de fraîcheur par source (vert / orange / rouge), seuils provisoires réglables.
- **2026-11-06** — Raccourcis iOS réservés aux données qui n'existent que chez Apple. Ils écrivent par l'API REST Firestore avec un jeton Firebase Auth (en-tête `Referer` obligatoire : la clé d'API est restreinte par référent HTTP).

## Dépôt public

- **2026-11-07** — Le dépôt reste public (GitHub Pages gratuit l'exige). En conséquence :
  - code générique, sans donnée familiale ;
  - paramètres familiaux dans un document de configuration Firestore protégé ;
  - journaux limités à des comptes ;
  - tests sur données fictives ;
  - noms de lieux des tests de cantine passés en secrets (`CANTINE_COMMUNE`, `CANTINE_ECOLE`, `CANTINE_LOISIRS`).

## Sécurité Firestore

- **2026-11-07** — Deux protections cumulées :
  1. inscriptions désactivées dans Firebase Authentication (plus aucune création de compte depuis un client) ;
  2. règles limitées à l'UID du compte famille, et non à `request.auth != null` (la configuration web étant publique, n'importe qui pourrait sinon créer un compte et lire les données).
- **2026-11-07** — Ordre imposé : changer le mot de passe du compte famille, ajouter la connexion dans Chez Nounou et Diversif, vérifier qu'elles fonctionnent connectées, **puis seulement** fermer les règles. Fermer d'abord rendrait les deux apps silencieusement vides (cache Firestore sans erreur).

## Planning

- **2026-11-07** — Les heures de l'enfant scolarisé chez l'assistante maternelle se déduisent de celles de l'autre enfant et des horaires de l'école ; elles ne sont pas saisies.
- **2026-11-07** — Les horaires de travail du parent B ne sont pas lus d'un agenda : ils sont saisis dans l'app, jour par jour, sans valeur par défaut (« à saisir »).
- **2026-11-07** — Lecteur du semainier Excel repris d'AgendaPro sans changement de logique ; les constantes propres à la personne (initiales, horaires, libellés, lieux, ancre) sont passées en paramètres lus dans la configuration. Équivalence vérifiée sur 400 classeurs aléatoires (0 différence). Import depuis le téléphone dans La Vision ; seuls les jours modifiés sont réécrits ; les jours passés et les jours absents du nouveau fichier ne sont pas touchés. Les retouches manuelles faites dans AgendaPro (stockées sur l'appareil) ne sont pas reprises. Elles sont rares : on corrige dans La Vision.
- **2026-11-07** — Pas d'heures contractuelles dans l'app : seulement les heures prévues (planning) et réelles (pointages).
- **2026-11-07** — Chaque proposition du moteur porte sa justification en clair et, le cas échéant, un point à vérifier. Un créneau peut rester « à confirmer » plutôt que recevoir une heure fausse.

### Schéma Firestore (validé le 2026-11-07)

| Chemin | Écrit par | Contenu |
|---|---|---|
| `vision/config` | App (réglages) | Paramètres familiaux : parents A et B, enfants 1 et 2, école, jours particuliers, sources, semainier |
| `vision/planning/jours/{AAAA-MM-JJ}` | Tâche (`calcule`), app (`corrige`, `saisies.B`, `valide`) | Planning du jour en couches |
| `vision/semainier/jours/{AAAA-MM-JJ}` | App (import) | Événements du semainier pour le parent A |
| `vision/agenda/jours/{AAAA-MM-JJ}` | Tâche | Événements des agendas, vacances scolaires, jours fériés |
| `vision/etat` | Tâche et app | Fraîcheur de chaque source, dernier passage du moteur, erreurs |

Couches d'un jour de planning :
- `calcule` : réécrit par la tâche ; justification et points à vérifier inclus.
- `corrige` : seulement les champs modifiés à la main ; jamais écrasé.
- `saisies.B` : début et fin de travail du parent B ; vide = « à saisir ».
- `valide` : copie de l'affichage au moment où le mois est validé.

**Affichage champ par champ** : `corrige.x`, sinon `valide.x`, sinon `calcule.x`.

**Après validation du mois** : le moteur continue de calculer mais ne modifie plus `valide`. Toute différence entre `calcule` et `valide` devient un point à vérifier sur le jour concerné, avec un bouton « Appliquer ». Un changement appliqué après l'envoi de la grille marque le mois « grille modifiée depuis l'envoi ».

### Tâche planifiée

- **2026-11-07** — Les tâches planifiées tournent dans un dépôt **privé** dédié, `la-vision-tache`, qui ne contient que les déclencheurs et les secrets ; il exécute le code du dossier `tache/` de ce dépôt (branche `main`). Raisons : la désactivation automatique après 60 jours sans activité est décrite pour les dépôts publics ; les journaux deviennent privés. Pas de commit automatique pour maintenir un dépôt « actif ».
- **2026-11-07** — Quota : 2 000 minutes par mois pour les dépôts privés d'un compte gratuit, chaque job arrondi à la minute supérieure, blocage (sans facturation) au-delà. Fréquence des agendas : toutes les 30 min de 4 h à 21 h UTC, toutes les 2 h la nuit (39 passages par jour, ≈ 1 200 min par mois si chaque passage reste sous la minute). Si un passage dépasse la minute : passer à un passage par heure en journée.
- **2026-11-07** — Pour tenir sous la minute : écriture Firestore par l'API REST (compte de service signé localement), une seule dépendance (ical.js), mise en cache.
- **2026-11-07** — Agendas : séries, exceptions et fuseaux lus avec ical.js ; jours fériés calculés (pas de source externe) ; adresse du calendrier scolaire dans la configuration Firestore (`sources.vacances`). Une empreinte par jour, stockée dans `vision/agenda`, évite de relire tous les jours à chaque passage. Si une source est illisible, rien n'est écrit et l'erreur est notée dans `vision/etat.agendas.erreur` ; la dernière lecture réussie (`agendas.lu`) est conservée.
- **2026-11-07** — N'écrit que les documents dont le contenu a changé ; ne recalcule pas les jours passés ; fenêtre de calcul limitée (J-7 à J+60). Le quota gratuit Firestore est partagé avec Chez Nounou et Diversif.

### Moteur de règles (2026-11-08)

Code : `tache/moteur.js` (fonction pure, chargée aussi par l'app), appelé par `tache/planning.mjs` à la suite de la lecture des agendas. Paramètres dans `vision/config.famille` ; tests sur une famille fictive (`tests/moteur.test.mjs`).

- Jours de semaine seulement, fenêtre aujourd'hui → J+60, jours passés jamais recalculés.
- Statut du parent A : semainier (journée au lieu principal, site secondaire, congé, jour non travaillé, repos après garde, formation) ; gardes lues dans son agenda (l'agenda fait foi ; un écart avec le semainier est un point à vérifier).
- Statut du parent B : garde et lendemain de garde lus dans son agenda (garde = événement dont le titre correspond au motif, commençant ce jour) ; sinon saisie dans l'app (travail début–fin, repos, congé), sinon « à saisir ».
- Dépôt, par ordre de priorité : A au site secondaire (sauf lendemain de sa garde) ; lendemain de garde de B → A tôt (ou à l'heure de congé s'il est à la maison) ; garde de B → B à l'heure fixée ; A en congé → A ; sinon B, une heure avant son début (`avantDebut`), arrondi au quart d'heure inférieur, au plus tard à l'entrée de l'école les jours d'école.
- Récupération : lendemain de garde de B → B à la sortie ; garde de B → A à son heure de retour ; lendemain de garde de A → A ; A en congé → A ; A au site secondaire → A, sauf si B rentre avant ; sinon B, une heure après sa fin (`apresFin`), arrondi au quart d'heure supérieur ; au-delà de la fermeture de l'assistante maternelle, A s'il rentre avant, sinon point à vérifier. Un jour d'école, une récupération avant la sortie se fait à l'école, à la sortie.
- Enfant scolarisé un jour d'école : chez l'assistante maternelle du dépôt à l'entrée, puis de la sortie à la récupération ; jamais de périscolaire. B en repos : école sans créneau, horaires du petit « à saisir ».
- Mercredi en période scolaire : le parent à la maison (A s'il ne travaille pas, sinon B) ; petit 9h–13h, aîné à l'accueil de loisirs. Mercredi de vacances : jour ordinaire.
- Vacances : lieu de l'aîné lu dans l'agenda de B (mots configurés, « congés de l'assistante maternelle » testé en premier), sinon choix fait dans l'app (`corrige.e2`), sinon point à vérifier. Pas de plafond d'entrée d'école. Fermeture anticipée par date (`ecole.exceptions`).
- Jours sans assistante maternelle : week-end, férié, congés de l'assistante maternelle (motif dans l'un des deux agendas), B en congé. Si les deux parents travaillent, point à vérifier.
- Économie Firestore : une clé résume les entrées (empreintes des agendas, import du semainier, configuration, `vision/planning.majLe`) ; clé inchangée = ni lecture ni écriture. L'app doit mettre à jour `vision/planning.majLe` à chaque saisie ou correction. Un calcul complet lit environ 140 documents et n'écrit que les jours modifiés (champ `calcule` seul).

Corrections du 2026-11-08, après relecture de novembre et décembre :
- Les gardes peuvent être notées sur la journée entière : une garde est un événement qui **commence** ce jour ; le lendemain de garde se lit dans l'agenda de la veille (le calcul lit aussi la veille de chaque jour et les week-ends).
- A en congé prime sur la garde de B : A dépose et récupère.
- Accueil de loisirs ou centre aéré fermé avant la récupération : l'assistante maternelle va chercher l'aîné (créneau de la fermeture à la récupération), sans point à vérifier.
- Jour à fermeture anticipée (`ecole.exceptions`, ex. 24/12) : les parents finissent plus tôt, récupération avancée à la fermeture pour les deux enfants.
- Jour férié : aucun point à vérifier.
- Congé de B lu dans son agenda (`B.conge`, titre exact, ex. « Vacances » seul ; « Vacances scolaires » ne compte pas). Une saisie dans l'app prime.
- Repos de B lu de même dans son agenda (`B.repos`, ex. « Off … »).
- « Centre aéré » et « accueil de loisirs » désignent la même structure : les deux mots sont configurés vers le même lieu.
- Les exceptions ponctuelles (rendez-vous, arrangement avec l'assistante maternelle) relèvent des corrections manuelles de l'étape 6.
- Rendez-vous et absences : le moteur ne les interprète pas, il les signale. (1) Un événement dont le titre contient le prénom d'un enfant, un jour où cet enfant est confié : point à vérifier avec le titre et l'horaire ; le titre est gardé dans `calcule.notes` pour la grille. (2) Un événement horaire de 12 h ou plus d'un parent, qui n'est ni une garde ni un congé, ni un autre motif reconnu : point « absent ? ». Pas de configuration supplémentaire.

### Écran Planning du mois (2026-11-08)

- Pensé pour l'iPad en paysage et l'ordinateur : grille du lundi au vendredi et panneau du jour ; sous 900 px, le panneau passe sous la grille.
- **Le moteur tourne aussi dans l'app** (`js/planning.js` importe `tache/moteur.js`) : une saisie ou une correction s'affiche immédiatement, sans attendre la tâche. Les jours passés affichent ce qui a été enregistré, sans recalcul. Lecture par mois : agendas (mois + veille), semainier, planning, état du mois (`vision/planning/mois/{AAAA-MM}`).
- Fusion pour l'affichage (`fusionner`) : champ par champ `corrige`, sinon `valide.affiche`, sinon calcul ; champs `depot {qui, heure}`, `recup {qui, heure}`, `e1` (confié ou non), `e2` (lieu), `note`. Créneaux recalculés à partir des heures et lieux affichés quand une couche surcharge le calcul.
- Corrections dans le panneau du jour : enfant 1 confié ou non ; dépôt et récupération (qui et heure, pas de 15 min) ; lieu de l'enfant 2 (école, accueil de loisirs, assistante maternelle, avec nous) ; note (80 caractères). « Annuler les modifications » supprime `corrige`.
- Écran des horaires du parent B : un jour par ligne ; début et fin, « Off », « Vacances » ou « Effacer » ; enregistrement à chaque changement (`saisies.B`) ; gardes et lendemains affichés sans saisie ; repos et congé lus dans son agenda présentés comme tels.
- Validation : enregistre pour chaque jour non passé `valide = { affiche, calculeAlors, le }` et `vision/planning/mois/{AAAA-MM}.valideLe`. Ensuite, l'affichage suit `valide` ; un écart entre le calcul et `calculeAlors` devient un point, avec « Appliquer le nouveau calcul » ; une correction après validation est marquée « modifié depuis la validation » (`corrige.apresValidation`).
- Chaque écriture met à jour `vision/planning.majLe` pour que la tâche recalcule.

## Module assistante maternelle

- **2026-11-07** — La Vision lit et écrit les pointages au format exact de Chez Nounou ; un créneau saisi dans l'une apparaît dans l'autre.
- **2026-11-07** — Geste principal : confirmation le soir, préremplie à partir du planning. Pointage en direct possible.
- **2026-11-07** — Confirmation du soir : avant d'écrire, lire les sessions déjà présentes pour ce jour et cet enfant. S'il y en a, les montrer au lieu d'en créer (pas de doublons).
- **2026-11-07** — `schooldays` : écrits aujourd'hui par Chez Nounou, à la main, à trois endroits (case du jour, formulaire d'ajout de créneau, fiche d'un jour), avec `true` comme `false`. Un jour marqué `true` déclenche dans Chez Nounou la découpe des créneaux autour des heures d'école et, le jour même, un décompte automatique du soir à partir de la sortie d'école tant qu'aucun créneau du soir n'existe. La Vision n'écrit un `schooldays` que s'il est absent, n'écrase jamais une valeur existante, et n'écrit `true` que les jours où le planning prévoit l'école **et** l'assistante maternelle après l'école.
- **2026-11-07** — Grille mensuelle exportée en image ou en PDF, aux couleurs de l'app.

## Technique

- **2026-11-06** — API Claude : `claude-sonnet-5-5`, concaténer tous les blocs `text`.
- **2026-11-07** — Workflows sur Node 22, `actions/checkout@v5` et `actions/setup-node@v5` (les v4 tournent sur Node 20, déprécié).

## 2026-11-08 — Saisie des heures par listes

Le sélecteur natif `<input type="time">` ignore l'attribut `step` dans son menu (Chrome affiche toutes les minutes). Les heures se saisissent donc par deux listes : heures, puis minutes par pas de 5. Choisir l'heure seule met les minutes à 00. Une heure déjà enregistrée hors du pas reste affichée telle quelle.

## 2026-11-08 — Module assistante maternelle (étape 7)

- Créneaux lus et écrits dans `nounou/{journal}/sessions` au format de l'app de pointage ; le journal vient de `famille.nounou.journal` (configuration Firestore). Clés des enfants : `famille.enfants.e1.cle` / `e2.cle`.
- Écoute en temps réel de la semaine en cours (`onSnapshot`, métadonnées incluses) : tant que la lecture n'est pas confirmée par le serveur, les totaux affichent « — » et les boutons sont désactivés.
- Totaux calculés exactement comme l'app de pointage (créneau en cours compté jusqu'à maintenant ; le jour même, soir d'école compté dès la sortie tant qu'aucun créneau du soir n'existe, si le jour est coché « école »).
- Pointage en direct : retiré le 2026-11-09 (l'app est sur l'appareil de la maison ; le pointage en direct se fait dans l'app de pointage, sur le téléphone). À la place : « Ajouter un créneau » (enfant, jour de la semaine en cours, arrivée / départ par pas de 5 min) et correction ou suppression d'un créneau du jour en le touchant. Contrôle : départ après l'arrivée, pas de recouvrement avec un autre créneau du même enfant le même jour. La coupure automatique du créneau du matin est retirée de l'app (créneaux saisis après coup, aucun ne reste ouvert ; l'app de pointage garde sa propre coupure).
- Confirmation : un créneau prévu n'est proposé que si aucun créneau pointé ne le recouvre (aucun doublon). Le soir, à partir de l'heure de récupération prévue (18h à défaut) ; les jours passés de la semaine restés sans pointage sont proposés à part.
- `schooldays` : coché par l'app et par la tâche planifiée (aujourd'hui seulement), uniquement si le document est absent (transaction côté app, précondition `exists: false` côté tâche), et seulement quand `ecoleAvecNounou` est vrai.

## 2026-11-08 — Grille mensuelle pour l'assistante maternelle (étape 8)

- Image PNG A4 paysage (2400 × 1697), dessinée sur un canvas sans bibliothèque. Disposition reprise du document utilisé jusqu'ici : titre du mois en rouge, année dessous, bandeau rouge des jours (lundi → vendredi), numéro du jour puis deux lignes centrées, chacune à la couleur de l'enfant (`famille.enfants.*.couleur`, celles de l'app de pointage) : enfant non scolarisé « dépôt (initiale) - récupération (initiale) », créneaux de l'enfant scolarisé chez la nounou « a - b / c - d ». « - » sans accueil ; note du jour en italique. Une seule taille de texte pour toute la grille. Pas de petits calendriers, pas de total.
- Envoi par le menu Partager (iPad, iPhone) ou téléchargement (Mac). Pas de PDF : la grille part en photo.
- À chaque envoi, le texte de chaque jour est mémorisé dans `vision/planning/mois/{YYYY-MM}.envoi` ; l'écran Planning signale ensuite « grille envoyée le … · n jours modifiés depuis » et marque les jours concernés. `valideLe` et `envoi` s'écrivent en `mergeFields` pour ne pas s'effacer l'un l'autre.

## 2026-11-08 — Mise à jour forcée de l'app

GitHub Pages autorise les navigateurs à garder les fichiers 10 minutes, et l'app posée sur l'écran d'accueil de l'iPad peut rester ouverte des heures. Un service worker (`sw.js`) redemande chaque fichier de l'app au serveur (revalidation, 304 si inchangé) et ne sert la dernière copie que hors connexion ; les autres domaines ne passent pas par lui. `version.json` (incrémenté à chaque PR) est relu sans cache au retour sur l'app et toutes les 30 minutes (dans ce cas seulement après 2 minutes sans interaction) : s'il a changé, la page se recharge. Le numéro est affiché en bas de l'écran.

## 2026-11-08 — Nettoyage de fin de lot 1

Retirés : `tests/faisabilite.mjs`, son workflow, la page `test-ipad/`. Ce dépôt ne porte plus aucun secret ; toutes les tâches tournent depuis `la-vision-tache`. Les documents `vision_test/*` et leur règle Firestore sont supprimés. Les noms des anciens secrets (avec prénoms) restent visibles dans l'historique Git : résidu accepté.

## 2026-11-09 — Version dans l'adresse des fichiers

Constat : après une mise à jour, Safari (iPhone) a affiché le nouveau numéro de version mais exécuté l'ancien code (copie gardée en mémoire malgré le service worker). Désormais `index.html` lit `version.json` sans cache, puis charge la feuille de style et chaque module avec `?v=<version>` (carte d'import générée avant le premier module). Une nouvelle version change donc l'adresse de tous les fichiers. Hors connexion, le service worker sert la dernière copie en ignorant le paramètre.

## 2026-11-09 — Lot 2, étape 1 : squelette de l'accueil

- Onglet « Accueil » (`js/accueil.js`), ouvert au démarrage sur un écran d'au moins 900 px de large ; le module assistante maternelle sur un téléphone.
- Disposition : briefing (2/4), météo, compte à rebours ; quatre colonnes (Aujourd'hui ; Nounou + Ce soir ; Rappels du jour ; À faire) ; bande « Cette semaine ».
- Écran maintenu allumé (`navigator.wakeLock`) tant que l'accueil est affiché.
- Fraîcheur (`js/fraicheur.js`, testé) : écoute de `vision/etat` ; agendas orange au-delà d'1 h, rouge au-delà de 3 h (nuit, 23 h–6 h : 2 h 30 / 4 h 30, la tâche ne passe que toutes les 2 h) ; Rappels (étape 6) orange au-delà de 6 h. Un niveau rouge affiche un bandeau qui nomme la source. Sans confirmation du serveur, l'accueil le dit au lieu d'afficher un faux vide.

## 2026-11-09 — Déclenchement de la tâche et lot 2, étape 2

- La programmation de GitHub sautait la plupart des passages (4 par jour au lieu de ~36). La tâche est désormais lancée par un service de déclenchement extérieur (appel de l'API `workflow_dispatch`), à la même fréquence ; programmation GitHub retirée ; un seul passage à la fois (`concurrency`). Jeton GitHub limité au droit « Actions » du dépôt de la tâche. L'en-tête `X-GitHub-Api-Version: 2022-11-28` est annoncé retiré en mars 2028 : à changer d'ici là.
- Alerte : de jour, bandeau dès que les agendas n'ont pas été lus depuis plus d'1 h (orange au-delà de 40 min) ; la nuit, au-delà de 4 h 30.
- Accueil : barre du haut reprise de la maquette (date, heure, état des sources, « Planning de <mois suivant> » avec son état, réglages, nom de l'app) à la place du titre et des onglets ; disposition à hauteur d'écran sur grand écran. Colonne de droite : Rappels du jour (2/3) + post-it (1/3), « À faire, plus tard » dessous. Bande « Cette semaine » (lundi → dimanche, texte commun avec l'écran Planning, `js/texte-jour.js`) ; toucher un jour ouvre le planning sur ce jour. Le module assistante maternelle s'affiche aussi dans l'accueil (`monterNounou`).

## 2026-11-09 — Confirmation : créneau retiré, « pas allé(e) »

- Dans l'encadré de confirmation, chaque créneau prévu peut être retiré (✕) avant de confirmer ; « Pas allé(e) » indique que l'enfant n'est pas allé chez l'assistante maternelle ce jour-là.
- Une fois confirmée ou marquée « absent », la journée de l'enfant n'est plus proposée : `vision/planning/jours/{date}.nounouFait.{clé enfant}` = `confirme` | `absent`.
- Le jour même, si l'enfant scolarisé n'a pas de créneau du soir après confirmation, « école » est décoché dans l'app de pointage (sinon elle compterait l'enfant chez l'assistante maternelle toute la soirée).
- Accueil : chaque bloc garde sa taille ; ce qui dépasse défile à l'intérieur du bloc (règle permanente pour tous les blocs).

## 2026-11-09 — Lot 2, étape 3 : Aujourd'hui, calendriers supplémentaires, barre commune

- Tâche : calendrier commun facultatif (secret `ICS_C`, `webcal:` accepté) lu à chaque passage ; calendriers abonnés publics (`vision/config.sources.abonnements = [{ nom, url }]`) lus au plus une fois toutes les 20 h, mis en cache dans `vision/agenda/sources/abonnements`. Leurs événements vont dans `jours[date].C` avec leur `source` ; un échec de ces sources est noté dans `vision/etat.agendas.sources` sans bloquer les agendas des parents. Le moteur de règles ne lit pas `C`.
- Accueil, « Aujourd'hui » : situation de chaque parent, statut de l'enfant scolarisé modifiable (École / ALAE / Nounou / Avec nous + note, écrit dans `corrige` du jour), fil du jour (événements datés des agendas, du calendrier commun et des abonnements, dépôt et récupération du planning ; notes des événements affichées). Les événements « journée » des parents qui décrivent déjà leur situation (garde, repos, congé) sont omis.
- Après une correction du jour faite dans l'app, « école » dans l'app de pointage suit la correction (cochée seulement s'il y a nounou après l'école), sauf si un créneau du soir est déjà saisi.
- Grand écran : la barre de l'accueil remplace titre et onglets sur tous les écrans (« ‹ Accueil », nom de l'écran, accès aux autres écrans) ; les onglets restent sur téléphone.
- Défilement dans les blocs : titre fixe, fondu en bas quand il reste à voir ; la position de défilement survit au rafraîchissement.

## 2026-11-09 — Lot 2, étape 4 : météo

- Open-Meteo lu directement par l'app (sans clé), toutes les 30 min, coordonnées dans `vision/config.famille.meteo = { lat, lon, seuils? }` (jamais dans le dépôt). Dernière prévision gardée sur l'appareil (stockage local) en attendant la suivante ; fraîcheur suivie (orange au-delà d'1 h 30).
- Carte : temps actuel et ressenti ; conseil d'habillage pour la prochaine sortie (ce matin avant 9 h, cet après-midi avant 17 h, sinon demain matin) ; créneaux 8 h, 16 h 30 (moyenne des deux heures encadrantes, pluie = maximum) et demain 8 h.
- Conseil fondé sur la température ressentie : < 5 °C manteau, bonnet et gants ; < 12 °C manteau ; ≤ 18 °C gilet ; au-delà tenue légère ; pluie ≥ 50 % imperméable et bottes. Seuils modifiables dans la configuration.
- Lever et coucher du soleil déjà lus (serviront au fond de nuit, lot 4).
- Fil du jour : le nom du calendrier abonné n'est plus affiché.

## 2026-11-09 — Lot 2, étape 5 : compte à rebours

- La tâche repère, sur 400 jours, le premier jour de chaque période de vacances ou congés posés par un parent (titre contenant « congé(s) » ou « vacances », hors « scolaires » et congés de l'assistante maternelle) et de chaque période de vacances scolaires ; écrit `vision/rebours.calcules` seulement s'ils ont changé (`tache/rebours.js`, testé).
- Dans `vision/rebours` aussi : `manuels` = [{ id, titre, date, annuel }] (ajoutés dans l'app) et `choix` (clé de l'événement affiché ; absent = prochaines vacances posées). Noël est ajouté par l'app. Les anniversaires viendront du Raccourci (étape 6) ; d'ici là, ajout à la main avec « chaque année ».
- Carte : nombre de jours, libellé, date, puis les deux autres événements les plus proches ; « Choisir » ouvre la liste, l'ajout et la suppression des événements ajoutés à la main.

## 2026-11-10 — Lot 2, étape 6 (1/2) : envoi du Raccourci iOS

- Un seul Raccourci remplace les trois Raccourcis de test : connexion (une fois), envoi, puis réception (à venir).
- Envoi : document `vision/raccourci`, champ `texte` = JSON `{ le, rappels: [{t,l,e,n}], evenements: [{t,d,f,j,n}], anniversaires: [{t,d}] }`, dates ISO 8601 avec décalage. Construit par des actions « Dictionnaire » (échappement fait par iOS) plutôt qu'un texte à séparateurs.
- App (`js/raccourci.js`) : rappels dont l'échéance est aujourd'hui ou dépassée → « Rappels du jour » ; les autres → « À faire, plus tard ». Événements du calendrier local ajoutés au fil du jour (sans doublon). Anniversaires proposés dans le compte à rebours.
- Fraîcheur : alerte orange au-delà de 6 h de jour ; la « nuit » du Raccourci va de 21 h à 7 h (pas de passage), seuil 11 h ; bandeau rouge au-delà de 24 h.
- Cocher, ajouter et courses : partie réception, étape suivante.
- Correction du 10/11 : « À faire, plus tard » ne montre que les rappels ponctuels. Raccourcis ne transmettant pas la récurrence, les listes de rappels récurrents sont reconnues à leur nom (motif par défaut « récurrent(e)s », remplaçable par `famille.rappels.recurrents`). Un rappel récurrent n'apparaît que dans « Rappels du jour », le jour de son échéance ou en retard.

## 2026-11-10 — Lot 2, étape 6 (2/2) : actions vers le Raccourci

- Collection `vision/raccourci/actions` : `{ type: cocher | creer | courses, t, l, e (AAAA-MM-JJ), le }`. Les quatre champs texte sont toujours présents, vides au besoin : un chemin de clé absent arrête Raccourcis. Les fiches incomplètes sont complétées par l'app. Le Raccourci lit la collection à chaque passage (avant l'envoi), applique chaque action dans Rappels, puis supprime la fiche (DELETE par son nom) : une action ajoutée pendant un passage n'est jamais perdue.
- Cocher : le rappel se raye et reste 3 s (5 s au départ, raccourci le 10/11) ; un second toucher ou « Annuler » le rétablit sans rien écrire. Ensuite la ligne se replie et l'action est enregistrée ; tout rappel ayant une action « cocher » en attente est masqué sur tous les appareils.
- Rappel créé dans l'app : affiché tout de suite (depuis sa fiche) ; le cocher avant le passage supprime simplement la fiche.
- Ajout : fenêtre au centre de l'écran (listes de `famille.rappels.ajout`, date facultative ; sans configuration, pas de bouton). Courses : même fenêtre, qui reste ouverte pour enchaîner les articles. Les blocs restent trop petits pour un formulaire.
- L'accueil ne se reconstruit pas pendant une saisie (champ en cours de frappe).
- Rééquilibrage de l'accueil (10/11) : bande « Cette semaine » plus compacte (dépôt → récupération sur une ligne, avec les initiales), place rendue au module nounou et à « À faire, plus tard ».

## 2026-11-10 — Lot 2, étape 6b : post-it

- Un seul post-it partagé, document `vision/postit` : `{ traits: [{ c, e, g, p: "x,y;…" }], texte, le }`, coordonnées entières 0–1000 (indépendantes de l'écran), gomme = tracé en `destination-out`. Plafond de 30 000 points par sécurité (limite de taille d'un document).
- Dessin au doigt et texte depuis tous les écrans : toucher le post-it ouvre l'éditeur (5 couleurs, 2 épaisseurs, gomme, annuler le dernier trait, tout effacer avec confirmation). Sur téléphone, onglet « Post-it ». Mise à jour en direct (lecture en continu), sans passer par le Raccourci.
- Affichage : heure du dernier enregistrement en petit, pas de nom.

## 2026-11-10 — Lot 2, étape 7 (1/2) : cantine

- `tache/cantine.mjs` lit le site du prestataire une fois par jour (premier passage après 5 h, heure de Paris) avec le Chrome préinstallé sur les machines GitHub, piloté par `playwright-core` (pas de téléchargement de navigateur). Noms de commune et d'établissements dans `vision/config.famille.cantine = { commune, ecole, loisirs, convives }`.
- `vision/cantine = { lu, ecole: { date: [plats] }, loisirs: { … } }`, deux semaines d'historique gardées. Une lecture ratée ne remplace rien et sera retentée au passage suivant.
- Accueil, bloc « Ce soir » : « Ce midi à la cantine » selon le lieu du jour de l'enfant scolarisé (école → école ; ALAE / centre → accueil de loisirs ; ailleurs, rien). Alternative végétarienne retirée par une règle simple quand un plat avec viande ou poisson existe le même jour ; les cas ambigus restent affichés. Pas de « demain midi » (choix du 10/11).
- Plats du soir (étape 7, 2/2) : liste dans l'ordre du PDF du plan repas, sans proposition ; le PDF est envoyé par le Raccourci et lu par la tâche (tableau de la page 1), sans Claude.

## 2026-11-10 — Lot 2, étape 7 (2/2) : plats du soir

- Le Raccourci iOS ajoute à son passage le dernier PDF du plan repas (dossier iCloud partagé, filtré sur le début du nom, le plus récent) : `vision/repas = { nom, pdf (octets) }`. Document à part : l'accueil ne le télécharge qu'à l'ouverture d'une recette.
- `tache/repas.mjs` : quand l'empreinte du PDF change, lecture du tableau de la page 1 avec PDF.js (positions du texte, colonnes Jour · Repas · Protéine · Temps · Pour, plat sur deux lignes rattaché à la ligne du jour la plus proche) et de la première ligne de chaque page de recette (« Jour — Titre ») pour connaître sa page. Écrit `vision/plats = { empreinte, nom, titre, plats, faits: [] }`. Sans Claude. Tableau introuvable : `erreur` et liste vide, signalé dans l'app.
- PDF.js : édition « legacy » (le Safari de l'iPad bloqué en iPadOS 17 échoue avec l'édition courante) ; en cas d'échec, bouton « Ouvrir le PDF » (visionneuse du navigateur).
- Accueil, « Ce soir » : seul le plat prévu (le premier qui reste, dans l'ordre du plan) est affiché, sans proposition ni règle de protéine (choix du 10/11) ; « Autres › » ouvre une fenêtre avec les plats restants et « Rétablir » ; « 🍽 Midi » ouvre le menu de la cantine dans une fenêtre. Variantes d'un même plat séparées par « / » : seule celle avec viande est gardée. Toucher un plat ouvre le PDF dans une grande fenêtre (PDF.js, rendu page par page, ouvert à la page de la recette) avec « On l'a fait ce soir » (ajout à `faits`) ; « Rétablir » annule le dernier.
