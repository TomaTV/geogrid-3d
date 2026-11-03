# Notes de passation : Geogrid 3D

Projet d'école (cours Angular, IIM). Décision de Thomas du 2026-11-03 : **pas d'intégration dans le vrai Geogrid**, c'est un projet d'école seulement. Dépôt : branche `3dmap`, dossier `3d/`. Un repo public séparé `TomaTV/geogrid-3d` (contenu de `3d/` seulement, zéro secret, README français avec logo, bannière et captures) reste à créer, à la demande de Thomas. Brief d'origine : `../3DMAP-GEOGRID.md`. Idées futures : `IDEES-3D.md`.

Ne rien modifier du produit Geogrid. Seule exception : `3d/**` dans les ignores de `eslint.config.mjs`. Commits fréquents sans demander le message, push seulement sur accord.

## Lancer

```
cd 3d
npm install
npm run dev     # ng serve :4200, json-server :3001, proxy de clé :3002
```

`db.json` est créé depuis `db.seed.json` au premier `npm run api`. Le mode se choisit dans `src/app/data/scan.ts` (`SCAN_MODE`, mock par défaut). Le live demande `3d/.env` (`GEOGRID_API_KEY`, voir `.env.example`), jamais commité. `?hq` dans l'URL bloque la baisse automatique de résolution.

## Moteur 3D (`src/lib/`)

Moteur Three.js écrit de zéro, MapLibre et deck.gl ont été retirés. Inspiré de Streets GL (MIT) sans en reprendre le code.

- `scan-map.js` : entrée (`createScanMap`), rendu, caméra, flux de tuiles, sélection, repères, ombres, arrivée animée.
- `engine/tile.worker.js` : dans 2 workers, télécharge et décode les tuiles OpenFreeMap, construit toute la géométrie. Le thread principal n'intègre qu'une tuile par image : c'est ce qui évite les gels.
  - Zoom 14 autour de la caméra (bâtiments, routes, eau, verdure, arbres), zoom 11 pour le paysage lointain.
  - Polygones découpés exactement à la tuile, murs de bordure supprimés : pas de doublon entre tuiles.
  - `hide_3d` respecté, parties OSM (`render_min_height`) gardées, toit mansardé procédural quand l'empreinte s'y prête.
  - Hauteur manquante dans OSM (5 m par défaut) : remplacée par la médiane de la tuile avec une variation. Le panneau dit « about ».
  - Arbres procéduraux : parcs en bosquets, forêts denses, alignement le long des rues, avec un raster d'occupation pour éviter immeubles, routes et eau.
- `engine/field.js` : projection locale en mètres et champ de rang, source unique de la couleur et du rang du panneau : moyenne gaussienne des points classés, un point hors top 20 ne compte que localement, déformation organique cuite dans la texture 256x256 et appliquée aussi au clic.
- `engine/materials.js` : shaders Lambert (eau en Standard). Le champ est lu par fragment. Fenêtres, façades, zinc, routes, voitures, eau, arbres. La couleur de rang passe par les fenêtres, les toits, les routes et le sol. Sol dessiné sans test de profondeur dans l'ordre (pas de z-fighting).
- `engine/sky.js` : ciel, soleil, nuages, étoiles, préréglages Dusk, Night, Day (lumière, brouillard, exposition, bloom).
- `rank-colors.js` : palette exacte de Geogrid. Hors top 20 = gris `#555555`, pas rouge.

Apparition : les immeubles et les arbres poussent en vague depuis le centre du scan, un front lumineux révèle les couleurs. Les ombres ne se recalculent que si la scène ou la cible change. Sélection par lancer de rayon sur les maillages (point exact sur l'immeuble) : la distance au commerce et au point mesuré part de ce point.

## App Angular

- `src/app/data/` : `ScanStore` (signal privé `#scans`, lecture seule, `computed`), `ScanSource` (mock ou live).
- `src/app/pages/` : explore (home), collection, assistant de scan en 3 étapes, détail, à propos.
- `server/proxy.mjs` : ajoute le header `Authorization` côté serveur.

## Données

- Fixture : `public/mock/scan-wsf-13.json`, scan réel de Web School Factory, statut `partial`, 44 nœuds dispersés. `scan-wsf-7.json` : scan 7x7 complet de secours.
- `scan.latitude/longitude` = centre demandé. Position du commerce = `grid_data[n].self.lat/lng` (fiche Google trouvée), différente du centre.
- Rang `null` = non mesuré, rang 101 = absent du top 20. Ne pas confondre.
- Les mots-clés génériques donnent le même résultat sur 3 km : mauvais pour une démo.
- Sous Git Bash, `curl -d` avec un accent envoie un caractère invalide : passer par `--data-binary @fichier.json`.

## Secret

La clé `gk_live_...` a été collée dans une conversation : à révoquer après la démo. Jamais dans le dépôt.

## À faire ou à vérifier

0. Wizard : reprendre aussi l'étape 3 de Geogrid (taille de grille, rayon, résumé), demandé par Thomas. UI actuelle : Standard par défaut, Time (Real time, Dusk, Day, Night), Settings (Building colors, Shadows, Low power), recentrage. Couleur du scan au sol, routes, fenêtres, immeubles entiers via Building colors.

1. Fluidité jamais mesurée sur un vrai GPU : les tests tournent en rendu logiciel headless. Thomas doit juger sur sa machine. Leviers : `MAX_NEAR`, rayon de `refreshTiles`, taille de la carte d'ombre, `dpr`.
2. Création de scan depuis l'assistant et mode live jamais testés de bout en bout.
3. Mobile 390 px non vérifié avec le nouveau moteur.
4. Pas d'occlusion ambiante en post-traitement (assombrissement simple en bas des murs). `GTAOPass` possible si le GPU suit.
5. Un scan complet avec un mot-clé local donnerait des couleurs plus riches que la fixture partielle.
6. README et repo public de rendu.

## Réglages par mode

Dans `src/lib/engine/sky.js`, chaque preset porte `scan` (présence du scan en mode normal : routes, sol, murs, fenêtres) et `colors` (mix, glow, fenêtres, et surcharges de lumière ou de brouillard quand Building colors est actif). `applyLook()` dans `scan-map.js` les applique. Le champ couvre toute la zone du scan (poids en inverse de la distance), le bord seul s'estompe. Zone chargée : cercle de 3 à 7 km selon le zoom.
