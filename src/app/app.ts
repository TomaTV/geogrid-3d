import { Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <a routerLink="/" class="fixed left-4 top-4 z-40 flex h-[44px] items-center px-1 sm:left-6">
      <img src="logo.svg" alt="" class="h-[24px] w-auto" /><span class="ml-2.5 text-[17px] font-semibold tracking-tight">Geogrid</span><span class="ml-1.5 rounded-md bg-accent/15 px-1.5 py-[1px] text-[13px] font-semibold text-accent">3D</span>
    </a>

    <button class="fixed right-4 top-4 z-50 grid h-[40px] w-[40px] place-items-center rounded-xl border border-white/[0.12] bg-[rgba(10,10,12,0.72)] text-white/80 backdrop-blur-2xl transition hover:border-white/25 hover:text-white sm:right-6"
            (click)="open.set(!open())" [attr.aria-expanded]="open()" [attr.aria-label]="open() ? 'Close menu' : 'Open menu'">
      @if (open()) {
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
      } @else {
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
      }
    </button>

    @if (open()) {
      <div class="fixed inset-0 z-40" (click)="open.set(false)"></div>
      <nav class="fixed right-4 top-[62px] z-50 w-[260px] rounded-2xl border border-white/[0.12] bg-[rgba(10,10,12,0.78)] p-3 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-[40px] sm:right-6">
        <div class="flex flex-col gap-1">
          @for (l of links; track l.path) {
            <a [routerLink]="l.path" routerLinkActive="active-link" [routerLinkActiveOptions]="{ exact: true }" (click)="open.set(false)"
               class="rounded-xl px-3 py-2.5 text-[14px] text-white/60 transition hover:bg-white/[0.04] hover:text-white [&.active-link]:text-accent">{{ l.label }}</a>
          }
          <div class="mx-3 my-2 h-px bg-white/[0.08]"></div>
          <a href="https://geogrid.dev" target="_blank" rel="noopener" class="rounded-xl px-3 py-2.5 text-[14px] text-white/60 transition hover:bg-white/[0.04] hover:text-white">Geogrid.dev</a>
          <a routerLink="/scans/new" (click)="open.set(false)"
             class="mt-1 rounded-xl border border-white/[0.12] bg-gradient-to-br from-white/[0.14] to-white/[0.06] py-2.5 text-center text-[14px] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition hover:from-white/[0.2]">Start Mapping</a>
        </div>
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
  ];
  private url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => (e as NavigationEnd).urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  immersive = () => {
    const u = this.url().split('?')[0];
    return u === '/' || /^\/scans\/(?!new)[^/]+$/.test(u);
  };
}
