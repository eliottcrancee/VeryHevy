# 💪 VeryHevy

Carnet d'entraînement personnel, inspiré de Hevy : musculation, cardio, mobilité,
circuit training… tout se note, se coche et se compare.

Application web **100 % locale** (aucun serveur, aucune donnée envoyée), installable
sur téléphone, utilisable hors ligne, avec un thème sombre/clair et une bibliothèque
de **151 exercices en français** extensible à **1 017 exercices**, dont **873 illustrés**,
grâce à l'import depuis une base libre.

---

## Démarrage

```bash
npm install
npm run dev        # http://localhost:5173
```

Build de production puis prévisualisation :

```bash
npm run build
npm run preview
```

> Le premier `npm install` peut nécessiter `npm install-scripts approve esbuild`
> si votre gestionnaire bloque les scripts d'installation.

---

## Ce que fait l'application

### 🏋️ Séance en direct
- Démarrage **à vide**, **depuis un programme**, ou en **piochant des exercices**.
- Saisie tactile optimisée : champ numérique avec boutons **−/+** et pas adaptés
  (2,5 kg en muscu, 5 s en durée, 0,1 km en cardio…).
- Colonnes **dynamiques** selon le type de suivi de l'exercice
  (poids × reps, poids du corps, durée, distance, reps seules…).
- **Validation série par série** avec lancement automatique du **chrono de repos**
  (bip sonore + vibration à la fin, ajustable de ± 15 s).
- Types de série : normale, **échauffement**, **dégradée**, **échec**.
- **Réordonnancement par glisser-déposer**, remplacement d'exercice, **supersets**
  (paires d'exercices enchaînés : lier un 3ᵉ exercice libère automatiquement son
  ancien partenaire), ajout/suppression/duplication de séries, notes par exercice.
- Repère de la **dernière performance** (« Précédent : 80 × 8 ») et **1RM estimé**
  en direct.
- **Poids de corps**, note de séance, chrono global, écran maintenu allumé.

### 📋 Programmes (entraînements préenregistrés)
- 7 programmes prêts à l'emploi : **Push / Pull / Legs**, Full body, Haut du corps
  express, Cardio & mobilité, HIIT.
- Création, duplication, dossiers, couleurs, description.
- Éditeur complet : ordre des exercices, séries cibles, charges/durées, temps de repos.
- **« Enregistrer cette séance comme programme »** en un clic depuis le rapport.

### 📚 Bibliothèque d'exercices
- **151 exercices intégrés en français** couvrant musculation, cardio, mobilité,
  étirements, pliométrie, haltérophilie et strongman.
- **Import depuis internet** de la base libre
  [`free-exercise-db`](https://github.com/yuhonas/free-exercise-db) (domaine public) :
  **876 exercices supplémentaires avec photos et instructions**, en un bouton
  (mode « compléter » avec détection de doublons ou mode « remplacer »).
- Import de fichiers JSON (format VeryHevy ou free-exercise-db), export de la bibliothèque.
- Création/édition d'exercices personnalisés : type de suivi, muscles principaux et
  secondaires, matériel, niveau, conseils, instructions, images.
- Recherche plein texte (nom, nom anglais, muscle, matériel) et filtres par catégorie,
  muscle, matériel, favoris, perso, présence de photos.

### 📈 Logbook & rapports
- **Rapport par séance** : durée, volume, séries, répétitions, comparaison automatique
  avec la séance précédente du même programme, **nouveaux records détectés**,
  répartition des séries par muscle, détail de chaque série, notes et note sur 5 étoiles.
- **Historique** groupé par mois, recherche dans les noms, notes et exercices,
  filtres par période.
- **Fiche exercice** : records personnels (charge max, 1RM estimé, reps max, durée,
  distance), courbe de progression, historique complet séance par séance.
- **Statistiques** : régularité sur 12 semaines (heatmap), volume hebdomadaire,
  répartition par type d'effort, séries par groupe musculaire, exercices les plus
  travaillés, meilleures charges, suivi du poids de corps.
- **Calendrier** mensuel avec détail jour par jour.

### ⚙️ Réglages
- Thème **sombre / clair / auto** et **10 couleurs d'accent**.
- Unités **kg/lb** et **km/mi**.
- Repos par défaut, séries par défaut, objectif hebdomadaire, premier jour de semaine,
  colonne RPE optionnelle.
- **Sauvegarde/restauration JSON** complète, réinitialisation.

---

## Guide d'utilisation express

1. **Accueil** → *S'entraîner*.
2. Choisissez **« Depuis un programme »** (ex. *Push — Pectoraux / Épaules / Triceps*)
   ou partez d'une séance vide.
3. Renseignez les charges/reps, cochez chaque série terminée : le **chrono de repos**
   se lance tout seul.
4. Pendant la séance : glissez les cartes pour changer l'ordre, `⋯` pour remplacer un
   exercice, créer un **superset**, ajouter une note.
5. **Terminer la séance** → le **rapport** s'affiche avec vos records.
6. Onglet **Exercices** → *Importer* → **« Compléter ma bibliothèque »** pour récupérer
   les 876 exercices illustrés supplémentaires (noms d'origine de la base, en anglais).

---

## Architecture

```
src/
├─ types.ts                 # modèle métier (Exercise, Workout, Routine, Settings…)
├─ store/store.ts           # store Zustand + persistance IndexedDB (idb-keyval)
├─ lib/
│  ├─ seed.ts               # 151 exercices FR + 7 programmes types
│  ├─ importers.ts          # import free-exercise-db / JSON, fusion sans doublon
│  ├─ calc.ts               # volume, 1RM (Epley), records, séries, statistiques
│  └─ utils.ts              # unités, dates, formats, teintes, bip audio
├─ components/
│  ├─ ui.tsx                # design system (Button, Modal, NumberField, Menu…)
│  ├─ AppShell.tsx           # navigation desktop/mobile + chrono de repos global
│  ├─ ExercisePicker.tsx     # sélecteur d'exercices avec filtres
│  ├─ ExerciseFormModal.tsx  # création / édition d'exercice
│  └─ WorkoutLogger.tsx      # tableau de séries + carte d'exercice
├─ pages/                   # Home, ActiveWorkout, Routines, RoutineEditor,
│                           # Exercises, ExerciseDetail, History, WorkoutReport,
│                           # Stats, Calendar, Settings
└─ hooks/app.ts             # thème, wake lock, interval
```

### Modèle de données (extrait)

```ts
Exercise  { id, name, category, tracking, primaryMuscles[], equipment, images[], … }
Workout   { id, name, startedAt, finishedAt, status, exercises[], notes, rating }
WorkoutExercise { id, exerciseId, sets[], restSeconds, notes, supersetId }
WorkoutSet      { id, type, weight?, reps?, duration?, distance?, rpe?, completed }
Routine   { id, name, folder, color, exercises[], timesPerformed }
```

`tracking` détermine les colonnes saisies : `weight_reps`, `bodyweight_reps`,
`weight_duration`, `reps_duration`, `distance_duration`, `duration`, `reps_only`,
`weight_distance`.

### Persistance
Tout l'état est sérialisé dans **IndexedDB** (clé `veryhevy-store`) via le middleware
`persist` de Zustand : rechargement instantané, fonctionnement hors ligne, aucune
limite de quota pratique. Un service worker met en cache l'application (PWA installable).

---

## Tests

Deux scripts d'intégration pilotent **Microsoft Edge en mode headless** (via
`puppeteer-core`, aucun Chromium à télécharger) sur le build de production :

```bash
npm run build
npm run test:smoke     # parcours complet + captures dans ./screenshots
npm run test:audit     # mise en page : débordements, cibles tactiles, contrastes WCAG
npm run test:regress   # non-régression : barres fixes, calendrier, unités kg/lb
npm run test:all       # les trois
```

- **`test:smoke`** vérifie : chargement, liste des programmes, démarrage d'une séance,
  saisie de charges (persistance contrôlée en base), validation de séries, rapport,
  réouverture et ajout d'exercice, historique, bibliothèque, fiche exercice, stats,
  calendrier, réglages, **import des 876 exercices depuis internet**, création d'un
  exercice personnalisé, thème clair, vue desktop, manifeste PWA et service worker.
  Il échoue à la moindre erreur console.
- **`test:audit`** mesure, en thème sombre **et** clair : dépassements horizontaux,
  cibles tactiles < 28 px, contrastes de texte sous le seuil WCAG AA, superposition de
  barres fixes, **éléments interactifs recouverts**, et **fin de page masquée par une
  barre fixe** (contrôle effectué après défilement en bas). Il parcourt les routes
  dépendant de données (éditeur de programme, fiche exercice), l'écran de séance en
  cours, puis ces mêmes écrans **pendant qu'une séance est active** — le cas qui avait
  laissé passer un bandeau recouvrant la navigation mobile.
- **`test:regress`** verrouille les comportements corrigés : bouton d'action de
  l'éditeur de programme réellement cliquable (`elementFromPoint`), bandeau de séance
  empilé au-dessus de la navigation sans chevauchement, libellés de jour du calendrier
  alignés sur les dates réelles, conversion d'unités kg/lb dans les deux sens
  (saisie en livres → stockage en kg → réaffichage), invariant des supersets
  (lier un 3ᵉ exercice ne laisse aucun identifiant orphelin, délier libère les deux
  membres), nettoyage des supersets orphelins hérités, et chrono de repos qui ne
  recouvre pas la barre « Terminer la séance ».
- **`test:pages`** sert le build sous un sous-chemin (comme sur GitHub Pages) :
  chargement sans 404, navigation, manifeste, portée du service worker et
  fonctionnement **hors ligne serveur coupé**.

Les trois scripts renvoient un code de sortie non nul en cas de problème.

État actuel : **0 erreur console, 0 problème de mise en page**.

---

## Déploiement sur GitHub Pages

Le build est déjà configuré pour un hébergement en **sous-chemin** (`base: './'`
dans `vite.config.ts`), avec un `HashRouter` : aucune configuration serveur n'est
nécessaire et les liens profonds fonctionnent.

```bash
npm run build
npm run test:pages   # vérifie le fonctionnement en sous-chemin + hors ligne
```

`test:pages` sert le build sous un préfixe fictif et contrôle le chargement, la
navigation, le manifeste, la portée du service worker et le **redémarrage hors
ligne serveur coupé**.

### Publication automatique

Le workflow `.github/workflows/deploy.yml` construit et publie le site à chaque
`push` sur `main`.

**À faire une seule fois** : activer Pages dans *Settings → Pages → Source :
« GitHub Actions »*. Le `GITHUB_TOKEN` du workflow ne peut pas créer le site
lui-même (erreur `Resource not accessible by integration`), c'est une restriction
de GitHub.

```bash
# création du dépôt + premier envoi
gh repo create VeryHevy --public --source=. --push

# activation de Pages (une fois) — nécessite un jeton avec le scope « repo »
gh api -X POST repos/<compte>/VeryHevy/pages -f build_type=workflow
```

L'application est alors disponible sur `https://<compte>.github.io/VeryHevy/`.
Le workflow se relance à chaque `push` ; il peut aussi être déclenché à la main
depuis l'onglet *Actions* (`workflow_dispatch`).

> Le service worker précache l'intégralité du build (fichiers hachés compris,
injectés dans `dist/sw.js` par `vite.config.ts`). Sans cette étape, une première
visite suivie d'une perte de réseau affichait un écran blanc : les assets
n'étaient jamais mis en cache.

---

## Notes techniques

- **Design system** : Tailwind CSS v4 avec jetons CSS (`--accent-user`, `--surface`,
  `--tint-a/b`…) échangés à chaud. La couleur d'accent choisie par l'utilisateur est
  automatiquement assombrie pour les fonds de boutons pleins afin de garantir un
  contraste ≥ 4.5:1, et les libellés de catégorie sont teintés selon le thème.
- **Barres inférieures fixes** : `AppShell` mesure la hauteur réelle de la pile
  navigation + bandeau « séance en cours » et la publie dans la variable CSS
  `--bottom-stack` ; chaque page dotée d'une barre d'action fixe publie la sienne dans
  `--bottom-bar` via le hook `useBottomBar`. La marge basse du contenu, le chrono de
  repos et les toasts s'appuient sur la somme des deux : les barres s'empilent sans
  jamais se recouvrir, quel que soit l'écran.
- **Supersets** : un `supersetId` est partagé par **exactement deux** exercices. Au
  chargement, `bootstrap()` retire les identifiants orphelins hérités d'anciennes
  données, pour qu'aucun exercice ne soit affiché comme « en superset » sans
  partenaire.
- **Unités** : le poids est **toujours stocké en kilogrammes** (unité canonique) et la
  distance en mètres. La conversion vers `lb` / `mi` est faite à l'affichage et à la
  saisie via `kgToDisplay` / `displayToKg` et `metersToDisplay` / `displayToMeters`,
  utilisés par `formatWeight`, `formatVolume` et `kgToInput`.
- **Navigation** : `HashRouter` (aucune configuration serveur requise, compatible
  ouverture depuis un simple fichier).
- **Hors ligne** : le service worker sert les navigations en « réseau d'abord » (pour
  récupérer immédiatement une nouvelle version) et les autres ressources en « cache
  d'abord avec revalidation », avec repli sur le cache sans réseau.
- **Pas de backend** : pour synchroniser entre appareils, utilisez *Réglages →
  Sauvegarder* puis *Restaurer* sur l'autre appareil.
- **Accès de debug** : `window.__veryhevy` expose le store complet depuis la console.

## Licence des données

La base d'exercices importable provient de
[`yuhonas/free-exercise-db`](https://github.com/yuhonas/free-exercise-db),
publiée dans le domaine public.

## Pistes d'évolution

- Synchronisation multi-appareils (Supabase / PocketBase).
- Minuteur de repos avec notification système (`Notification API`).
- Calculateur de disques, échauffements automatiques, RPE/RIR avancé.
- Import CSV d'autres applications (Strong, Hevy, FitNotes).
- Graphiques de volume par groupe musculaire semaine par semaine.