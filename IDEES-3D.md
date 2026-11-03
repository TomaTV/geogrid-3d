# Idées 3D que Geogrid ne fait pas

Idées gardées pour le wizard de scan de Geogrid (`src/components/dashboard/ScanWizard.jsx`) et la page de détail. Rien de tout cela n'est codé.

## 1. Export vidéo en orbite

Un bouton qui enregistre un tour de caméra autour de la zone du scan (10 à 15 secondes, MP4) pour l'envoyer à un client d'agence. Le rendu 3D sert alors de livrable, ce que la carte 2D ne peut pas offrir. Dans le wizard : case « Générer le tour 3D » à la fin du scan.

## 2. Comparaison de deux scans dans le temps

Superposer deux scans du même commerce et du même mot-clé. La hauteur de chaque immeuble monte quand le rang s'améliore et baisse quand il se dégrade, la couleur indique le sens. Dans le wizard : lancer un scan en choisissant un scan précédent comme référence (le champ `diff_from_scan_id` existe déjà côté API).

## 3. Lecture par rue et par quartier

Cliquer une rue pour obtenir le rang moyen sur ses immeubles, et le concurrent qui domine le quartier. Utile pour décider où concentrer une action locale. Nécessite de calculer le rang par bâtiment côté serveur.

## Réutilisation du wizard de Geogrid

Le formulaire « New scan » de l'app Angular reprend les mêmes champs que le wizard (adresse, mot-clé, commerce, grille). Une intégration dans Geogrid passerait par `src/hooks/useScanWizard.js` et un import dynamique client de MapLibre, comme Leaflet.
