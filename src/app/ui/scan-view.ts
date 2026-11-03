import { Component, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ScanMap } from './scan-map';
import { formatRank, rankColor } from '../../lib/rank-colors.js';

@Component({
  selector: 'app-scan-view',
  imports: [ScanMap],
  template: `
    @if (scan(); as s) {
      <div class="relative h-dvh w-full overflow-hidden">
        <app-scan-map [scan]="s" (nodeSelected)="active.set($event)" (ready)="loading.set(false)" (failed)="fail()" />

        <div class="pointer-events-none absolute left-4 top-[68px] max-w-[300px] sm:left-6">
          <p class="eyebrow">{{ s.keyword }}</p>
          <h1 class="display mt-1 text-[28px] drop-shadow-[0_2px_14px_rgba(0,0,0,0.7)]">{{ s.target_name }}</h1>
          <a [href]="geogridUrl(s.id)" target="_blank" rel="noopener"
             class="pointer-events-auto mt-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-bg/80 px-3.5 py-1.5 text-[12px] font-medium text-white/80 backdrop-blur-xl transition hover:border-accent/40 hover:text-accent">
            Full scan on Geogrid <span aria-hidden="true">&#8599;</span>
          </a>
        </div>

        @if (active(); as a) {
          <aside class="absolute inset-x-3 bottom-3 rounded-2xl border border-white/10 bg-bg/90 p-4 backdrop-blur-2xl sm:inset-x-auto sm:bottom-auto sm:right-6 sm:top-[68px] sm:w-[300px]">
            <p class="eyebrow">{{ a.hover ? 'Under cursor' : 'Selected' }}</p>
            <div class="mt-2 flex items-end justify-between gap-4">
              <div>
                <p class="eyebrow">Nearest measured point</p>
                <p class="display mt-1 text-[40px]" [style.color]="color(a.node.rank)">{{ fmt(a.node.rank) }}</p>
              </div>
              <div class="pb-2 text-right">
                <p class="eyebrow">Distance</p>
                <p class="mt-1 font-mono text-[12px] text-white/70">{{ a.dist }} m</p>
              </div>
            </div>
            @if (a.est !== null) {
              <p class="mt-2 font-mono text-[11px] text-white/45">Estimated here about #{{ a.est }} (interpolated)</p>
            }
            <p class="mt-1 font-mono text-[11px] text-white/45">Building height {{ a.height }} m</p>
            @if (a.node.competitors?.length) {
              <div class="mt-4 border-t border-white/[0.06] pt-3">
                <p class="eyebrow">Ahead of you here</p>
                <ul class="mt-2 space-y-1.5">
                  @for (c of a.node.competitors.slice(0, 3); track c.cid) {
                    <li class="flex items-baseline justify-between gap-3 text-[12.5px]">
                      <span class="truncate">{{ c.name }}</span>
                      <span class="shrink-0 font-mono text-[11px]" [style.color]="color(c.rank)">{{ fmt(c.rank) }}</span>
                    </li>
                  }
                </ul>
              </div>
            }
            <p class="mt-3 text-[11px] leading-snug text-white/30">Rank is measured at the dots. Colors between dots are interpolated.</p>
          </aside>
        }

        <div class="pointer-events-none absolute bottom-3 left-1/2 hidden -translate-x-1/2 items-center gap-4 rounded-full border border-white/10 bg-bg/80 px-4 py-2 backdrop-blur-xl sm:flex">
          @for (l of legend; track l.label) {
            <span class="eyebrow flex items-center gap-2"><i class="h-2 w-2 rounded-full" [style.background]="l.color"></i>{{ l.label }}</span>
          }
        </div>

        @if (error()) {
          <div class="absolute inset-0 grid place-items-center bg-bg/80"><p class="eyebrow text-red-300/80">Buildings could not be loaded</p></div>
        } @else if (loading()) {
          <div class="pointer-events-none absolute inset-0 grid place-items-center bg-bg/70 backdrop-blur-sm"><p class="eyebrow">Building the city</p></div>
        }
      </div>
    }
  `,
})
export class ScanView {
  private http = inject(HttpClient);
  src = input('mock/scan-wsf-13.json');
  scan = signal<any>(null);
  active = signal<any>(null);
  loading = signal(true);
  error = signal(false);
  fmt = formatRank;
  color = rankColor;
  legend = [
    { label: '1', color: '#22c55e' },
    { label: '2-3', color: '#34d399' },
    { label: '4-5', color: '#86efac' },
    { label: '6-10', color: '#fbbf24' },
    { label: '11-15', color: '#f97316' },
    { label: '16-20', color: '#ef4444' },
    { label: '20+ / none', color: '#555555' },
  ];

  constructor() {
    queueMicrotask(() => this.http.get<any>(this.src()).subscribe((r) => this.scan.set(r.data)));
  }

  geogridUrl(id: string) {
    return 'https://geogrid.dev/dashboard/scans/' + id;
  }

  fail() {
    this.loading.set(false);
    this.error.set(true);
  }
}
