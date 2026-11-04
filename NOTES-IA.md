# Notes de passation : Geogrid 3D

Projet d'école (cours Angular, IIM). Décision de Thomas du 2026-11-03 : **pas d'intégration dans le vrai Geogrid**, c'est un projet d'école seulement. Dépôt : branche `3dmap`, dossier `3d/`. Repo public séparé : `TomaTV/geogrid-3d` (contenu de `3d/` seulement, zéro secret). Brief d'origine : `../3DMAP-GEOGRID.md`. Idées futures : `IDEES-3D.md`.

Ne rien modifier du produit Geogrid. Seule exception : `3d/**` dans les ignores de `eslint.config.mjs`. Commits sans demander le message mais par lot logique, pas un par micro-réglage. Push seulement sur accord. 

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
  - `hide_3d` respecté, parties OSM (`render_min_height`) gardées. Toits générés selon la taille : deux pans ou croupe en tuiles pour les petits immeubles, mansarde en zinc avec lucarnes pour les moyens, terrasse avec acrotère sinon. Un bâtiment coupé par le bord de la tuile reste à toit plat.
  - Cheminées et équipements de toit dans un maillage à part (`details`), masqué au-delà de 1,5 km et en Low power.
  - Voitures : instances 3D par tuile (`cars`), déplacées dans le vertex shader le long des tronçons droits, masquées au-delà de 1,3 km et en Low power. De plus loin, de simples traînées lumineuses la nuit.
  - Hauteur manquante dans OSM (5 m par défaut) : estimée immeuble par immeuble depuis son empreinte (environ 5 à 25 m). Le panneau dit « about ».
  - Arbres procéduraux : parcs en bosquets, forêts denses, alignement le long des rues, avec un raster d'occupation pour éviter immeubles, routes et eau.
- Niveaux de détail : zoom 14 complet autour de la cible, zoom 13 en volumes simples au-delà (jusqu'à 18 km, `buildingMid`, sans ombres), zoom 11 pour le sol lointain. La bascule suit `uFocusR`. Seules les tuiles dans le champ de la caméra se chargent ; les autres restent en mémoire dans la limite des budgets, celles de derrière partent en premier. Après l'arrivée animée seulement.
- Coût mesuré : le rendu de près coûte plus cher que le dézoom, c'est le calcul par pixel. D'où la pré-passe de profondeur des immeubles (`buildingPre`, sur les tuiles à moins de 3 km), le sol qui teste la profondeur et le bruit en texture (`uNoise`). Sur la machine de Thomas : 60 FPS verrouillés, 3 à 5 M de triangles, 120 à 200 appels. Le headless annonçait 15 FPS, il ne prédit rien.
- `engine/textures.js` : textures de façades et de sol dessinées une fois au démarrage sur canvas, en tableaux avec mipmaps. L'alpha des façades porte le verre. Aucune image à télécharger.
- Routes en deux passes dans le même maillage : trottoirs (`aRoad.z` négatif) puis chaussée, pour que le bitume recouvre les trottoirs aux carrefours. `aRoad.w` = distance à la fin du tronçon. Marquages effacés près des extrémités, passages piétons aux deux bouts.
- `engine/field.js` : projection locale en mètres et champ de rang, source unique de la couleur et du rang du panneau. Toute la zone du scan reçoit une estimation (poids en inverse de la distance aux points mesurés, un point hors top 20 pèse moins), seul le bord s'estompe. Déformation organique cuite dans la texture 256x256 et appliquée aussi au clic.
- `engine/materials.js` : shaders Lambert (eau en Standard). Fenêtres, façades, toits (`aMeta.x` : 0 mur, 1 terrasse, 2 tuiles, 3 zinc, 4 équipement, 5 acrotère), routes avec marquages et passages piétons, voitures, lampadaires, eau, arbres. Le scan passe par les routes, les fenêtres, le bas des murs ; immeubles entiers avec Building colors. Sol dessiné sans test de profondeur, dans l'ordre (pas de z-fighting).
- `engine/landmarks.js` : tour Eiffel (treillis) et pyramide du Louvre dessinées à la main ; les bâtiments OSM sous la tour sont exclus dans le worker.
- `engine/sky.js` : ciel, soleil, nuages, étoiles et presets Standard, Dusk, Day, Night, plus `livePreset` pour Real time (soleil calculé selon l'heure et le lieu du scan). Voir Réglages par mode.
- `rank-colors.js` : palette exacte de Geogrid. Hors top 20 = gris `#555555`, pas rouge.

Apparition : les immeubles et les arbres poussent en vague depuis le centre du scan, un front lumineux révèle les couleurs. La zone détaillée est un cercle de 2,6 à 5,2 km selon le zoom ; les tuiles sorties largement du cercle sont retirées. Les ombres (carte 3072) couvrent le cercle, ne se recalculent que si la scène ou la cible change et s'effacent entre 1,9 et 3,2 km de distance caméra. Déplacement borné à 150 km de l'origine, zoom trackpad lissé. La recherche d'adresse recrée le moteur avec `options.origin` : la projection n'est juste qu'autour de son origine. Sélection au clic seulement (pas de survol), par lancer de rayon : la distance au commerce part du point touché, avec un arc animé et une pastille.

## App Angular

- `src/app/data/` : `ScanStore` (signal privé `#scans`, lecture seule, `computed`), `ScanSource` (mock ou live).
- `src/app/pages/` : explore (home), collection façon Scan History, wizard en 3 étapes façon Geogrid, détail, à propos.
- `src/app/ui/scan-view.ts` : barre de gauche (zoom, recentrage, Standard, Time, Settings, Building colors), panneau de sélection, légende en bas à gauche, bouton Full scan.
- `server/proxy.mjs` : ajoute le header `Authorization` côté serveur.

## Données

- Fixture : `public/mock/scan-demo-21.json`, scan réel 21x21 (id `baf01975-faaa-441b-a0e7-38ed8495bc49`), « pizzeria », Casa'Mia à Boulogne-Billancourt, rayon 5 km, statut `partial`, 421 nœuds. Rangs : 75 en top 3, 51 en 4-10, 295 absents du top 20. Le sud du scan (rangs 6 à 9) sort du cadre de la vue par défaut.
- `scan.latitude/longitude` = centre demandé. Position du commerce = `grid_data[n].self.lat/lng` (fiche Google trouvée), différente du centre.
- Rang `null` = non mesuré, rang 101 = absent du top 20. Ne pas confondre.
- Un commerce local n'est classé que dans sa commune et ses voisines : un scan de 5 km reste en bonne partie hors top 20. Essai du 2026-11-04 autour d'Asnières (id `968b880b-7a8d-4efd-8321-8897f31a5d4b`) : 85 % de points absents, moins riche que Casa'Mia, écarté.
- Dans Paris, les résultats sont quasi identiques d'un point à l'autre (sondes du 2026-11-04 : salon de thé, librairie, pâtisserie). Ils changent en passant d'une commune à l'autre : une démo variée doit couvrir plusieurs communes. Viser le commerce par `target_cid`, le nom seul peut ne rien trouver.
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

1. Tests de bout en bout : création de scan depuis le wizard, collection, puis mode live. Prévus par Thomas plus tard.
2. Déploiement Vercel sur `3d.geogrid.dev`, fait par Thomas depuis le repo public. `vercel.json` et `api/collection.mjs` lancent json-server en mémoire : écritures perdues au démarrage à froid, et deux instances peuvent diverger. Jamais essayé sur un vrai déploiement. Proxy de clé et mode live pas encore portés sur Vercel (décision de Thomas : plus tard).

Décisions de Thomas : pas de mobile, pas de comparaison de scans. Pas de test headless sans demande : ça fait chauffer son PC. Pour une capture, puppeteer avec `--use-angle=d3d11 --enable-gpu` passe par son GPU : rapide, 2560x1440 avec `deviceScaleFactor: 2`. Le rendu logiciel swiftshader bloque à cette taille. Pour publier une mise à jour : `git subtree split --prefix=3d`, puis push du résultat sur `main` de `TomaTV/geogrid-3d`.

## À vérifier ou à améliorer

- Fluidité et RAM jamais mesurées sur un vrai GPU, surtout au dézoom complet : Thomas juge sur sa machine. Leviers : `MAX_NEAR`, `focusRadius`, taille de la carte d'ombre, `dpr`, bouton Low power.
- Non revus en capture après les derniers réglages : Day et Standard, Building colors en Night, zones de hauteur au dézoom complet, Real time.
- Night peut être trop sombre : fenêtres peu visibles sur la dernière capture.
- La bascule ombres / sans ombres au dézoom peut se remarquer.
- Tour Eiffel jugée un peu cheap par Thomas, acceptée.
- Day avec une vue dézoomée : bande sombre à l'horizon, probablement le plan `land` (sombre) vu au-delà des tuiles avant que le brouillard ne le couvre. Pas corrigé.
- Pas d'occlusion ambiante en post-traitement. `GTAOPass` possible si le GPU suit.
