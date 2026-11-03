# Notes de passation : Geogrid 3D

Projet d'école (cours Angular, IIM). Décision de Thomas du 2026-11-03 : **pas d'intégration dans le vrai Geogrid**, c'est un projet d'école seulement. Dépôt : branche `3dmap`, dossier `3d/`. Un repo public séparé `TomaTV/geogrid-3d` (contenu de `3d/` seulement, zéro secret, README français avec logo, bannière et captures) reste à créer, à la demande de Thomas. Brief d'origine : `../3DMAP-GEOGRID.md`. Idées futures : `IDEES-3D.md`.

Ne rien modifier du produit Geogrid. Seule exception : `3d/**` dans les ignores de `eslint.config.mjs`. Commits sans demander le message mais par lot logique, pas un par micro-réglage. Push seulement sur accord. Rien de poussé pour le moment (43 commits sur `3dmap`) ; regrouper l'historique avant le repo public seulement si Thomas le demande.

## Lancer

```
cd 3d
npm install
npm run dev     # ng serve :4200, json-server :3001, proxy de clé :3002
```

`db.json` est créé depuis `db.seed.json` au premier `npm run api`. Le mode se choisit dans `src/app/data/scan.ts` (`SCAN_MODE`, mock par défaut). Le live demande `3d/.env` (`GEOGRID_API_KEY`, voir `.env.example`), jamais commité. `?hq` dans l'URL bloque la baisse automatique de qualité. Attention : un test en `?hq` ne voit pas les bugs du mode dégradé (voir Pièges).

## Moteur 3D (`src/lib/`)

Moteur Three.js écrit de zéro, MapLibre et deck.gl ont été retirés. Inspiré de Streets GL (MIT) sans en reprendre le code.

- `scan-map.js` : entrée (`createScanMap`), rendu par le composer, caméra, flux de tuiles, sélection, repères, ombres, arrivée animée, `applyLook()` qui applique les réglages du mode.
- `engine/tile.worker.js` : dans 2 workers, télécharge et décode les tuiles OpenFreeMap, construit toute la géométrie. Le thread principal n'intègre qu'une tuile par image : c'est ce qui évite les gels.
  - Zoom 14 autour de la caméra (bâtiments, routes, eau, verdure, arbres), zoom 11 pour le paysage lointain.
  - Polygones découpés exactement à la tuile, murs de bordure supprimés : pas de doublon entre tuiles.
  - `hide_3d` respecté, parties OSM (`render_min_height`) gardées, toit mansardé procédural quand l'empreinte s'y prête.
  - Hauteur manquante dans OSM (5 m par défaut) : estimée immeuble par immeuble depuis son empreinte (environ 5 à 25 m). Le panneau dit « about ».
  - Arbres procéduraux : parcs en bosquets, forêts denses, alignement le long des rues, avec un raster d'occupation pour éviter immeubles, routes et eau.
- `engine/field.js` : projection locale en mètres et champ de rang, source unique de la couleur et du rang du panneau. Toute la zone du scan reçoit une estimation (poids en inverse de la distance aux points mesurés, un point hors top 20 pèse moins), seul le bord s'estompe. Déformation organique cuite dans la texture 256x256 et appliquée aussi au clic.
- `engine/materials.js` : shaders Lambert (eau en Standard). Fenêtres, façades, zinc, routes, voitures, lampadaires, eau, arbres. Le scan passe par les routes, les fenêtres, le bas des murs ; immeubles entiers avec Building colors. Sol dessiné sans test de profondeur, dans l'ordre (pas de z-fighting).
- `engine/landmarks.js` : tour Eiffel (treillis) et pyramide du Louvre dessinées à la main ; les bâtiments OSM sous la tour sont exclus dans le worker.
- `engine/sky.js` : ciel, soleil, nuages, étoiles et presets Standard, Dusk, Day, Night, plus `livePreset` pour Real time (soleil calculé selon l'heure et le lieu du scan). Voir Réglages par mode.
- `rank-colors.js` : palette exacte de Geogrid. Hors top 20 = gris `#555555`, pas rouge.

Apparition : les immeubles et les arbres poussent en vague depuis le centre du scan, un front lumineux révèle les couleurs. La zone chargée est un cercle de 3 à 7 km selon le zoom, jusqu'à 90 tuiles au dézoom complet ; les tuiles sorties largement du cercle sont retirées. Les ombres (carte 3072) couvrent le cercle, ne se recalculent que si la scène ou la cible change et s'effacent entre 1,9 et 3,2 km de distance caméra. Déplacement borné à 25 km du centre, zoom trackpad lissé. Sélection au clic seulement (pas de survol), par lancer de rayon : la distance au commerce part du point touché, avec un arc animé et une pastille.

## App Angular

- `src/app/data/` : `ScanStore` (signal privé `#scans`, lecture seule, `computed`), `ScanSource` (mock ou live).
- `src/app/pages/` : explore (home), collection façon Scan History, wizard en 3 étapes façon Geogrid, détail, à propos.
- `src/app/ui/scan-view.ts` : barre de gauche (zoom, recentrage, Standard, Time, Settings, Building colors), panneau de sélection, légende en bas à gauche, bouton Full scan.
- `server/proxy.mjs` : ajoute le header `Authorization` côté serveur.

## Données

- Fixture : `public/mock/scan-wsf-13.json`, scan réel de Web School Factory, statut `partial`, 44 nœuds dispersés. `scan-wsf-7.json` : scan 7x7 complet de secours.
- `scan.latitude/longitude` = centre demandé. Position du commerce = `grid_data[n].self.lat/lng` (fiche Google trouvée), différente du centre.
- Rang `null` = non mesuré, rang 101 = absent du top 20. Ne pas confondre.
- Les mots-clés génériques donnent le même résultat sur 3 km : mauvais pour une démo.
- Sous Git Bash, `curl -d` avec un accent envoie un caractère invalide : passer par `--data-binary @fichier.json`.

## Secret

La clé `gk_live_...` a été collée dans une conversation : à révoquer après la démo. Jamais dans le dépôt.

## Réglages par mode

Dans `src/lib/engine/sky.js`, chaque preset porte :

- `scan` : présence du scan sans Building colors (routes, sol, murs, fenêtres, toits, façades lointaines) et intensité des lumières de ville (`facade`, `shop`, `winGlow`). Dusk et Day sont à 0 sur le scan : volontairement rien sans Building colors. Real time suit Day ou Dusk selon le soleil, sinon Night.
- `colors` : force de Building colors (`mix`, `glow`, `win`) et surcharges de lumière ou de brouillard quand il est actif.

## Pièges

- Toujours rendre par le composer, même dégradé (seul le bloom se coupe). En rendu direct, three applique le brouillard après la conversion sRGB : il ne raccorde plus avec le ciel et une ligne apparaît à l'horizon. Reproduit et vérifié en mesurant les pixels en Low power.
- Le ciel se fond dans le brouillard en dernier, soleil et nuages compris, sinon la lueur crée une coupure à l'horizon.
- Aucune valeur calculée par tuile dans le rendu : les tuiles sont carrées, le moindre écart dessine des blocs visibles (cas réel avec la médiane des hauteurs).
- Rendu logiciel headless : au dézoom complet, la capture peut bloquer sur les tuiles. Dézoomer de 3 crans au plus dans les tests.
- Après modification d'`angular.json` ou des dépendances : relancer `npm run dev` et vider `.angular/cache` si Vite garde l'ancien bundle.

## À faire (reprise : mercredi 2026-11-04 après-midi)

1. Wizard : ajouter à l'étape 3 ce qui manque par rapport à Geogrid (taille de grille, rayon, résumé), demandé par Thomas.
2. README : le texte est fait, reste logo, bannière, captures 390 px et desktop.
3. Repo public `TomaTV/geogrid-3d` : contenu de `3d/` seulement, push sur accord de Thomas.
4. Tester de bout en bout : création de scan depuis le wizard, collection, mode live.
5. Vérifier en mobile 390 px avec le nouveau moteur.

## À vérifier ou à améliorer

- Fluidité et RAM jamais mesurées sur un vrai GPU, surtout au dézoom complet : Thomas juge sur sa machine. Leviers : `MAX_NEAR`, `focusRadius`, taille de la carte d'ombre, `dpr`, bouton Low power.
- Non revus en capture après les derniers réglages : Day et Standard, Building colors en Night, zones de hauteur au dézoom complet, Real time.
- Night peut être trop sombre : fenêtres peu visibles sur la dernière capture.
- La bascule ombres / sans ombres au dézoom peut se remarquer.
- Tour Eiffel jugée un peu cheap par Thomas, acceptée.
- Un scan complet avec un mot-clé local donnerait des couleurs plus riches que la fixture partielle.
- Pas d'occlusion ambiante en post-traitement. `GTAOPass` possible si le GPU suit.
