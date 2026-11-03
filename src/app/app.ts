import { Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <a routerLink="/" class="fixed left-4 top-4 z-40 flex h-[44px] items-center px-1 sm:left-6">
      <img src="geogrid3d.svg" alt="Geogrid 3D" class="h-[17px] w-auto drop-shadow-[0_1px_8px_rgba(0,0,0,0.8)]" />
    </a>

    <button class="fixed right-4 top-4 z-50 flex h-[44px] items-center gap-3 px-1 sm:right-6" (click)="open.set(!open())" [attr.aria-expanded]="open()" aria-label="Menu">
      <span class="font-mono text-[11px] uppercase tracking-[0.18em] text-white drop-shadow-[0_1px_8px_rgba(0,0,0,0.8)]">{{ open() ? "Close" : "Menu" }}</span>
      <span class="relative grid h-[14px] w-[18px] place-items-center">
        <i class="absolute h-[1.5px] w-[18px] bg-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)] transition duration-300" [class.rotate-45]="open()" [class.-translate-y-[4px]]="!open()"></i>
        <i class="absolute h-[1.5px] w-[18px] bg-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)] transition duration-300" [class.-rotate-45]="open()" [class.translate-y-[4px]]="!open()"></i>
      </span>
    </button>

    @if (open()) {
      <div class="fixed inset-0 z-40" (click)="open.set(false)"></div>
      <nav class="fixed right-4 top-[64px] z-50 flex flex-col items-end gap-1 sm:right-6">
        @for (l of links; track l.path) {
          <a [routerLink]="l.path" routerLinkActive="active-link" [routerLinkActiveOptions]="{ exact: true }" (click)="open.set(false)"
             class="px-1 py-1.5 text-right text-[22px] font-medium tracking-tight text-white/80 drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)] transition hover:text-white [&.active-link]:text-accent">{{ l.label }}</a>
        }
      </nav>
    }
    <main [class.pt-24]="!immersive()"><router-outlet /></main>
  `,
})
export class App {
  private router = inject(Router);
  open = signal(false);
  links = [
    { path: '/', label: 'Explore' },
    { path: '/scans/new', label: 'New scan' },
    { path: '/scans', label: 'Collection' },
    { path: '/about', label: 'About' },
  ];
  private url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => (e as NavigationEnd).urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  immersive = () => {
    const u = this.url();
    return u === '/' || /^\/scans\/(?!new)[^/]+$/.test(u);
  };
}
