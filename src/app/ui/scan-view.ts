import { Component, input, signal, viewChild } from '@angular/core';
import { ScanMap } from './scan-map';
import { RankLegend } from './rank-legend';
import { formatRank, rankColor } from '../../lib/rank-colors.js';

@Component({
  selector: 'app-scan-view',
  imports: [ScanMap, RankLegend],
  template: `
    @if (scan(); as s) {
      <div class="relative h-dvh w-full overflow-hidden">
        <app-scan-map #map [scan]="s" [time]="time()" (nodeSelected)="active.set($event)" (ready)="loading.set(false)" (failed)="fail()" />

        <div class="pointer-events-none absolute z-10 left-4 top-[68px] max-w-[300px] sm:left-6">
          <p class="eyebrow">{{ s.keyword }}</p>
          <h1 class="display mt-1 text-[28px] drop-shadow-[0_2px_14px_rgba(0,0,0,0.7)]">{{ s.target_name }}</h1>
          <a [href]="geogridUrl(s.id)" target="_blank" rel="noopener"
             class="pointer-events-auto mt-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-bg/80 px-3.5 py-1.5 text-[12px] font-medium text-white/80 backdrop-blur-xl transition hover:border-accent/40 hover:text-accent">
            Full scan on Geogrid <span aria-hidden="true">&#8599;</span>
          </a>
        </div>

        @if (active(); as a) {
          <aside class="absolute z-10 inset-x-3 bottom-3 rounded-2xl border border-white/10 bg-bg/90 p-4 backdrop-blur-2xl sm:inset-x-auto sm:bottom-auto sm:right-6 sm:top-[68px] sm:w-[300px]">
            <p class="eyebrow">Selected building</p>
            <div class="mt-2 flex items-end justify-between gap-4">
              <div>
                <p class="eyebrow">Nearest measured point</p>
                <p class="display mt-1 text-[40px]" [style.color]="color(a.node.rank)">{{ fmt(a.node.rank) }}</p>
              </div>
              <div class="pb-2 text-right">
                <p class="eyebrow">Point is</p>
                <p class="mt-1 font-mono text-[12px] text-white/70">{{ dist(a.dist) }} away</p>
              </div>
            </div>
            @if (a.businessDist !== null) {
              <p class="mt-2 font-mono text-[11px] text-white/45">{{ dist(a.businessDist) }} from {{ s.target_name }}</p>
            }
            @if (a.est !== null) {
              <p class="mt-2 font-mono text-[11px] text-white/45">Estimated here about #{{ a.est }} (interpolated)</p>
            }
            <p class="mt-1 font-mono text-[11px] text-white/45">Building height about {{ a.height }} m</p>
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
            <p class="mt-3 text-[11px] leading-snug text-white/30">Rank is measured at Geogrid points only. The glow between them is an estimate, with an organic spread.</p>
          </aside>
        }

        <div class="absolute left-4 top-[186px] z-10 flex w-[42px] flex-col items-center rounded-xl border border-white/10 bg-[rgba(10,10,12,0.78)] py-1 backdrop-blur-2xl sm:left-6">
          <button type="button" class="rail-btn" aria-label="Zoom in" title="Zoom in" (click)="map.zoom(0.7)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </button>
          <button type="button" class="rail-btn" aria-label="Zoom out" title="Zoom out" (click)="map.zoom(1.4)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 12h14" /></svg>
          </button>
          <span class="my-1 h-px w-6 bg-white/10"></span>
          @for (t of times; track t.id) {
            <button type="button" class="rail-btn" [class.rail-on]="time() === t.id" [attr.aria-label]="t.label" [attr.aria-pressed]="time() === t.id" [title]="t.label" (click)="time.set(t.id)">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path [attr.d]="t.icon" /></svg>
            </button>
          }
        </div>

        <app-rank-legend class="pointer-events-none absolute z-10 bottom-3 left-1/2 hidden -translate-x-1/2 rounded-full border border-white/10 bg-bg/80 px-4 py-2 backdrop-blur-xl sm:flex" />

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
  scan = input.required<any>();
  active = signal<any>(null);
  time = signal('dusk');
  times = [
    { id: 'dusk', label: 'Dusk', icon: 'M3 17h18M6.5 17a5.5 5.5 0 0 1 11 0M12 5v3M4.9 8.9l2 2M19.1 8.9l-2 2M4 21h16' },
    { id: 'night', label: 'Night', icon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z' },
    { id: 'day', label: 'Day', icon: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4' },
    { id: 'scan', label: 'Scan colors', icon: 'M4 21V9l6-4v16M10 21V3l10 5v13M2 21h20M14 11h2M14 15h2' },
  ];
  loading = signal(true);
  error = signal(false);
  fmt = formatRank;
  dist = (m: number) => (m >= 1000 ? (m / 1000).toFixed(1) + ' km' : m + ' m');
  color = rankColor;


  geogridUrl(id: string) {
    return 'https://geogrid.dev/dashboard/scans/' + id;
  }

  fail() {
    this.loading.set(false);
    this.error.set(true);
  }
}
