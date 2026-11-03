import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-about',
  imports: [RouterLink],
  template: `
    <section class="mx-auto max-w-2xl px-4 pb-20 sm:px-6">
      <p class="eyebrow">03 · À propos</p>
      <h1 class="display mt-2 text-[44px]">Un projet d'école.</h1>

      <div class="mt-8 space-y-5 text-[15px] leading-relaxed text-white/70">
        <p>
          Geogrid 3D est un projet réalisé pour le cours Angular de l'IIM (Pôle Léonard de Vinci). C'est un prototype :
          il ne remplace pas Geogrid, il explore une idée.
        </p>
        <p>
          <a class="text-accent underline-offset-4 hover:underline" href="https://geogrid.dev" target="_blank" rel="noopener">Geogrid</a>
          mesure la position d'un commerce sur Google Maps, point par point, sur une grille géographique. Ici, le
          résultat est posé sur les immeubles d'une ville en 3D, avec les couleurs de rang de Geogrid.
        </p>
        <p>
          Chaque immeuble prend la couleur des points mesurés autour de lui. Le rang est mesuré aux points, pas aux
          immeubles : les couleurs entre deux points sont interpolées, et s'estompent loin de toute mesure.
        </p>
      </div>

      <h2 class="display mt-12 text-[28px]">Comment ça marche</h2>
      <ul class="mt-4 space-y-3 text-[14px] text-white/65">
        <li><span class="eyebrow mr-2">Données</span>l'API publique de Geogrid, derrière un petit proxy qui garde la clé côté serveur.</li>
        <li><span class="eyebrow mr-2">Mode mock</span>un vrai scan figé, aucun crédit consommé. Le mode live lance un vrai scan.</li>
        <li><span class="eyebrow mr-2">Carte</span>MapLibre GL, bâtiments et parcs d'OpenStreetMap chargés autour de la caméra.</li>
        <li><span class="eyebrow mr-2">Collection</span>les scans sont sauvegardés avec json-server (lecture, modification, suppression).</li>
        <li><span class="eyebrow mr-2">Angular</span>composants standalone, signaux, formulaire réactif, routes chargées à la demande.</li>
      </ul>

      <div class="mt-10 flex gap-3">
        <a routerLink="/" class="btn btn-primary">Voir la 3D</a>
        <a routerLink="/scans" class="btn">Collection</a>
      </div>
    </section>
  `,
})
export class About {}
