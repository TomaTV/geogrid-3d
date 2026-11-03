# Notes de passation : Geogrid 3D

Projet d'école (cours Angular, IIM), prototype d'une vue 3D des scans Geogrid. Dépôt : branche `3dmap` de Geogrid, dossier `3d/`. Un repo public séparé `TomaTV/geogrid-3d` (contenu de `3d/` seulement, zéro secret) est prévu pour le rendu, pas encore créé. Brief d'origine : `../3DMAP-GEOGRID.md`. Idées futures : `IDEES-3D.md`.

Règle de Thomas : ne rien modifier du produit Geogrid. Seule exception actuelle : `3d/**` ajouté aux ignores de `eslint.config.mjs`.

## Lancer

```
cd 3d
npm install
npm run dev     # ng serve :4200, json-server :3001, proxy de clé :3002
```

`db.json` est créé à partir de `db.seed.json` au premier `npm run api`. Le mode se choisit dans `src/app/data/scan.ts` (`SCAN_MODE`, mock par défaut). Le live demande `3d/.env` (`GEOGRID_API_KEY`, voir `.env.example`), jamais commité.

## Architecture

- `src/lib/` : JS sans framework, réutilisable dans Geogrid (React, import dynamique client).
  - `scan-map.js` : carte MapLibre, chargement des tuiles autour de la caméra, survol et clic, lien point-immeuble, soleil.
  - `buildings.js` : télécharge et décode les tuiles vectorielles OpenFreeMap (zoom 14) : bâtiments, parcs, forêts.
  - `building-ranks.js` : estimation du rang par immeuble (noyau gaussien sur les nœuds mesurés, couleur mélangée dans l'espace des couleurs Geogrid), fondu vers le gris neutre loin des mesures.
  - `deck-layers.js` : rendu deck.gl (`MapboxOverlay` non entrelacé) : bâtiments extrudés (`GeoJsonLayer`) avec lumière ambiante et soleil directionnel, arbres en maillages (`SimpleMeshLayer`, sphères sur troncs). MapLibre ne garde que le fond (sol, routes, eau), le ciel, la caméra et les repères.
  - `heat-field.js` : image PNG du champ de rang interpolé (même estimateur que les immeubles), posée au sol dans MapLibre comme couche raster sous les routes. Donne le dégradé continu façon heatmap de Geogrid.
  - `trees.js` : positions d'arbres tirées au hasard dans les parcs et forêts (pas des vrais arbres).
  - `map-style.js` : style sombre, ciel crépusculaire, couches par tuile.
  - `rank-colors.js` : palette exacte de Geogrid (`scan-utils.js` côté produit). Hors top 20 = gris `#555555`, pas rouge.
- `src/app/data/` : `ScanStore` (signal privé `#scans`, vue en lecture seule, `computed`), `ScanSource` (mock ou live), modèles.
- `src/app/pages/`, `src/app/ui/` : pages (explore, collection, nouveau scan, détail, à propos) et composants standalone.
- `server/proxy.mjs` : proxy Node qui ajoute le header `Authorization` côté serveur.

## Données

- Fixture mock : `public/mock/scan-wsf-13.json`, scan réel de Web School Factory, statut `partial`, 44 nœuds dispersés (pas une grille complète). `scan-wsf-7.json` : ancien scan 7x7 complet de secours.
- `scan.latitude/longitude` est le centre demandé du scan. La position du commerce est `grid_data[n].self.lat/lng` (`listingStats` dans `src/lib/scan-engine.js`), propre à la fiche Google trouvée, donc différente du centre. Deux repères sont affichés.
- Rang `null` = non mesuré, rang 101 = absent du top 20 (gris). Ne pas les confondre.
- Les mots-clés génériques (restaurant, bouillon) donnent le même résultat sur tout une zone de 3 km : mauvais pour une démo. Choisir un mot-clé et un commerce locaux.
- Pièges d'encodage : sous Git Bash, `curl -d` avec un accent envoie un caractère invalide (un scan de 169 crédits a été perdu ainsi). Passer le corps par fichier avec `--data-binary @fichier.json`.
- Crédits dépensés pendant le développement : 4 scans live (338 + 169 + environ 59). Compte de la clé : plan enterprise.

## Secret

La clé API `gk_live_...` a été collée dans la conversation. À révoquer après la démo et à régénérer depuis le dashboard de Geogrid. Ne jamais l'écrire dans le dépôt.

## Problèmes connus

1. Le rendu n'est pas encore au niveau de Streets GL. deck.gl est branché (la lumière directionnelle se voit sur les façades) mais les ombres projetées sont désactivées (`_shadow: false` dans `deck-layers.js`) : activées, luma.gl affiche `Binding shadow_uShadowMap0 not found` et rien ne s'ombre. À creuser (plan de sol, versions deck.gl 9.4 et luma.gl 9.4, mode entrelacé). Pas d'occlusion ambiante.
2. Les arbres sont des sphères sur troncs, placées aléatoirement dans les parcs, petites vues de loin. Pas d'arbres d'alignement, pas de vrai modèle d'arbre.
3. Au-delà de 7 km il n'y a plus de bâtiments : la limite est visible malgré la brume.
4. Le scan fixture est partiel : les couleurs se limitent à des bandes autour des 44 nœuds.
5. Le formulaire « New scan » n'a pas le look du wizard de Geogrid (`src/components/dashboard/ScanWizard.jsx`, `src/hooks/useScanWizard.js`).
6. Création de scan depuis le formulaire et mode live jamais testés de bout en bout.
7. La distance affichée est calculée du centre de l'immeuble au point mesuré le plus proche et au commerce (`haversine`, vérifiée). Thomas la juge encore fausse sans avoir précisé la valeur attendue : lui demander laquelle (au commerce, au centre du scan, au point).
8. Un flicker a été signalé. Corrigé en théorie (opacité 1, un immeuble par tuile, rechargement lissé), non revalidé par Thomas.

## Choix du moteur de rendu (recherche du 2026-11-03)

Thomas veut un rendu proche de Streets GL (ciel, soleil, ombres, arbres, forêts).

- **deck.gl sur MapLibre** (`@deck.gl/mapbox`) : couches extrudées avec `LightingEffect`, ombres via `DirectionalLight`/`SunLight` avec l'option expérimentale `_shadow`, plan de sol transparent requis pour recevoir l'ombre. Arbres possibles en `SimpleMeshLayer` ou `ScenegraphLayer`. C'est la voie la plus incrémentale : on garde la caméra, les tuiles et la logique de rang. Piste recommandée à prototyper en premier.
- **CesiumJS** : ciel, atmosphère, soleil et ombres natifs, OSM Buildings en 3D Tiles avec styles par feature. Mais compte Cesium ion (jeton), éclairage PBR imposé sur le tileset, et il faut refaire la logique de couleur par immeuble. Lourd.
- **Streets GL** (MIT, WebGL2, shading différé, SSAO, réflexions, heure configurable) : application complète, pas une librairie. Il faudrait forker son moteur et brancher les rangs dans son pipeline de bâtiments. Dernière mise à jour vers septembre 2024. À garder comme source d'inspiration (éclairage, post-traitement).
- **Photorealistic 3D Tiles de Google** : très beau mais les bâtiments ne se recolorent pas individuellement et la facturation Google est requise.

Sources : docs deck.gl `using-effects`, docs Cesium sur le style des 3D Tiles, dépôt `strandedkitty/streets-gl`.

## Prochaines étapes proposées

1. deck.gl est branché (fait). Reste : faire marcher les ombres, remplacer les sphères par un modèle d'arbre (GLB via `ScenegraphLayer`), ajouter les arbres d'alignement (open data de Paris).
2. Reprendre le look du wizard de Geogrid pour « New scan ».
3. Faire un scan complet d'une grille 13x13 avec un mot-clé local pour une fixture plus riche.
4. Créer le repo public `geogrid-3d` (contenu de `3d/`), README en français avec logo, bannière et captures (390 px et desktop).
5. Tester la création de scan (mock puis live) et la collection de bout en bout.
6. Rien ne doit être poussé sans l'accord de Thomas.
