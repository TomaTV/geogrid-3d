import { Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <a routerLink="/" class="fixed left-4 top-4 z-40 flex items-center gap-2 rounded-full border border-white/10 bg-bg/80 py-2 pl-3 pr-3.5 backdrop-blur-xl sm:left-6">
      <img src="logo.svg" alt="Geogrid" class="h-[16px] w-[16px]" />
      <span class="text-[13px] font-semibold tracking-tight">Geogrid</span>
      <span class="font-mono text-[9px] uppercase tracking-[0.14em] text-accent">3D</span>
    </a>

    <nav class="fixed right-4 top-4 z-40 hidden items-center gap-1 rounded-full border border-white/10 bg-bg/80 p-1 backdrop-blur-xl sm:right-6 sm:flex">
      @for (l of links; track l.path) {
        <a [routerLink]="l.path" routerLinkActive="!bg-accent/15 !text-accent" [routerLinkActiveOptions]="{ exact: true }"
           class="rounded-full px-3.5 py-1.5 text-[12px] font-medium text-white/70 transition hover:bg-white/[0.06] hover:text-white">{{ l.label }}</a>
      }
    </nav>

    <button class="fixed right-4 top-4 z-40 grid h-[40px] w-[40px] place-items-center rounded-full border border-white/10 bg-bg/80 backdrop-blur-xl sm:hidden"
            (click)="open.set(!open())" aria-label="Menu">
      <span class="relative block h-[10px] w-[16px]">
        <i class="absolute left-0 top-0 h-[1.5px] w-full bg-white/80 transition" [class.translate-y-[4px]]="open()" [class.rotate-45]="open()"></i>
        <i class="absolute bottom-0 left-0 h-[1.5px] w-full bg-white/80 transition" [class.-translate-y-[4px]]="open()" [class.-rotate-45]="open()"></i>
      </span>
    </button>
    @if (open()) {
      <nav class="fixed right-4 top-[62px] z-40 w-[220px] rounded-2xl border border-white/10 bg-bg/90 p-2 backdrop-blur-2xl sm:hidden">
        @for (l of links; track l.path) {
          <a [routerLink]="l.path" routerLinkActive="!text-accent" [routerLinkActiveOptions]="{ exact: true }" (click)="open.set(false)"
             class="block rounded-xl px-3 py-3 text-[13px] font-medium text-white/75 transition hover:bg-white/[0.05]">{{ l.label }}</a>
        }
      </nav>
    }
    <main [class.pt-20]="!immersive()"><router-outlet /></main>
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
