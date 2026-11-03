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
        <app-scan-map #map [scan]="s" [time]="time()" [scanColors]="scanColors()" (nodeSelected)="active.set($event)" (ready)="loading.set(false)" (failed)="fail()" />

        <div class="pointer-events-none absolute left-4 top-[68px] z-10 max-w-[320px] sm:left-6">
          <p class="eyebrow">{{ s.keyword }}</p>
          <h1 class="display mt-1 text-[28px] drop-shadow-[0_2px_14px_rgba(0,0,0,0.7)]">{{ s.target_name }}</h1>
          <p class="mt-1.5 font-mono text-[10.5px] tracking-[0.04em] text-white/55 drop-shadow-[0_1px_6px_rgba(0,0,0,0.8)]">{{ s.grid_data.length }} points · {{ top3(s) }}% top 3 · avg {{ avg(s) }}</p>
          <a [href]="geogridUrl(s.id)" target="_blank" rel="noopener" class="pointer-events-auto mt-2 inline-flex h-6 items-center gap-1 rounded-md border border-white/10 bg-[rgba(10,10,12,0.7)] px-2 font-mono text-[10px] uppercase tracking-[0.1em] text-white/60 backdrop-blur-xl transition hover:border-accent/40 hover:text-accent">Full scan &#8599;</a>
        </div>

        @if (active(); as a) {
          <aside class="absolute z-10 inset-x-3 bottom-3 rounded-2xl border border-white/10 bg-bg/90 p-4 backdrop-blur-2xl sm:inset-x-auto sm:bottom-auto sm:right-6 sm:top-[68px] sm:w-[300px]">
            <p class="eyebrow">Selected building</p>
            <div class="mt-2 flex items-end justify-between gap-4">
              <div>
                <p class="eyebrow">Estimated rank here</p>
                @if (!a.inScan) {
                  <p class="display mt-1 text-[26px] text-white/50">Outside the scan</p>
                } @else if (a.outOfTop) {
                  <p class="display mt-1 text-[40px]" [style.color]="a.estColor">20+</p>
                } @else {
                  <p class="display mt-1 text-[40px]" [style.color]="a.estColor">#{{ a.est }}</p>
                }
              </div>
              @if (a.businessDist !== null) {
                <div class="pb-2 text-right">
                  <p class="eyebrow">To the business</p>
                  <p class="display mt-1 text-[24px]">{{ dist(a.businessDist) }}</p>
                </div>
              }
            </div>
            <p class="mt-2 font-mono text-[11px] text-white/45">Nearest measured point: <span [style.color]="color(a.node.rank)">{{ fmt(a.node.rank) }}</span>, {{ dist(a.dist) }} away</p>
            <p class="mt-1 font-mono text-[11px] text-white/45">Building height about {{ a.height }} m</p>
            @if (a.to) {
              <a class="mt-2 inline-block font-mono text-[11px] text-accent/80 hover:text-accent" target="_blank" rel="noopener" [href]="mapsUrl(a)">Check on Google Maps &#8599;</a>
            }
            @if (a.node.competitors?.length) {
              <div class="mt-4 border-t border-white/[0.06] pt-3">
                <p class="eyebrow">Top results at that point</p>
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
            <p class="mt-3 text-[11px] leading-snug text-white/30">Rank is measured at Geogrid points only. Between them the color and the rank above are the same estimate.</p>
          </aside>
        }

        <div class="absolute left-4 top-[186px] z-10 flex w-[42px] flex-col items-center rounded-xl border border-white/10 bg-[rgba(10,10,12,0.78)] py-1 backdrop-blur-2xl sm:left-6">
          <button type="button" class="rail-btn" aria-label="Zoom in" data-tip="Zoom in" (click)="map.engine()?.zoom(0.7)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg></button>
          <button type="button" class="rail-btn" aria-label="Zoom out" data-tip="Zoom out" (click)="map.engine()?.zoom(1.4)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 12h14" /></svg></button>
          <button type="button" class="rail-btn" aria-label="Recenter" data-tip="Recenter" (click)="map.engine()?.recenter()"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v4M12 18v4M2 12h4M18 12h4" /></svg></button>
          <span class="my-1 h-px w-6 bg-white/10"></span>
          <button type="button" class="rail-btn" [class.rail-on]="time() === 'standard'" aria-label="Standard" data-tip="Standard" (click)="time.set('standard'); menu.set(null)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 0 18V3Z" /></svg></button>
          <button type="button" class="rail-btn" [class.rail-on]="time() !== 'standard'" aria-label="Time" data-tip="Time" (click)="toggle('time')"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7v5l3 2" /></svg></button>
          <button type="button" class="rail-btn" [class.rail-on]="menu() === 'settings'" aria-label="Settings" data-tip="Settings" (click)="toggle('settings')"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4h4V5h-4ZM6 15v4h4v-4H6Z" /></svg></button>
          <span class="my-1 h-px w-6 bg-white/10"></span>
          <button type="button" class="rail-btn" [class.rail-on]="scanColors()" [attr.aria-pressed]="scanColors()" aria-label="Building colors" [attr.data-tip]="scanColors() ? 'Building colors: on' : 'Building colors: off'" (click)="scanColors.set(!scanColors())"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V9l6-4v16M10 21V3l10 5v13M2 21h20M14 11h2M14 15h2" /></svg></button>
        </div>

        @if (menu() === 'time') {
          <div class="popover top-[329px]">
            <p class="eyebrow mb-1.5 px-2">Time</p>
            @for (t of times; track t.id) {
              <button type="button" class="pop-row" [class.pop-on]="time() === t.id" (click)="time.set(t.id)">{{ t.label }}</button>
            }
          </div>
        }
        @if (menu() === 'settings') {
          <div class="popover top-[363px]">
            <p class="eyebrow mb-1.5 px-2">Settings</p>
            <button type="button" class="pop-row" (click)="scanColors.set(!scanColors())">Building colors <span class="switch" [class.switch-on]="scanColors()"></span></button>
            <button type="button" class="pop-row" (click)="flip('shadows')">Shadows <span class="switch" [class.switch-on]="shadows()"></span></button>
            <button type="button" class="pop-row" (click)="flip('low')">Low power <span class="switch" [class.switch-on]="lowPower()"></span></button>
          </div>
        }

        <app-rank-legend class="pointer-events-none absolute z-10 bottom-4 left-4 hidden rounded-xl border border-white/10 bg-[rgba(10,10,12,0.78)] px-3.5 py-3 backdrop-blur-2xl sm:left-6 sm:block" />

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
  time = signal('standard');
  scanColors = signal(false);
  shadows = signal(true);
  lowPower = signal(false);
  menu = signal<'time' | 'settings' | null>(null);
  times = [
    { id: 'live', label: 'Real time' },
    { id: 'dusk', label: 'Dusk' },
    { id: 'day', label: 'Day' },
    { id: 'night', label: 'Night' },
  ];
  private map = viewChild<ScanMap>(ScanMap);
  loading = signal(true);
  error = signal(false);
  fmt = formatRank;
  dist = (m: number) => (m >= 1000 ? (m / 1000).toFixed(1) + ' km' : m + ' m');
  color = rankColor;


  geogridUrl(id: string) {
    return 'https://geogrid.dev/dashboard/scans/' + id;
  }

  top3(s: any) {
    const ranks = s.grid_data.filter((n: any) => n.rank != null);
    return ranks.length ? Math.round((ranks.filter((n: any) => n.rank <= 3).length / ranks.length) * 100) : 0;
  }

  avg(s: any) {
    const ranks = s.grid_data.map((n: any) => n.rank).filter((r: any) => r != null && r <= 20);
    return ranks.length ? '#' + (ranks.reduce((a: number, b: number) => a + b, 0) / ranks.length).toFixed(1) : '-';
  }

  toggle(name: 'time' | 'settings') {
    this.menu.set(this.menu() === name ? null : name);
  }

  flip(name: 'shadows' | 'low') {
    const engine = this.map()?.engine();
    if (name === 'shadows') {
      this.shadows.set(!this.shadows());
      engine?.setShadows(this.shadows());
    } else {
      this.lowPower.set(!this.lowPower());
      engine?.setLowPower(this.lowPower());
    }
  }

  mapsUrl(a: any) {
    const p = (c: number[]) => c[1].toFixed(6) + ',' + c[0].toFixed(6);
    return 'https://www.google.com/maps/dir/?api=1&travelmode=walking&origin=' + p(a.from) + '&destination=' + p(a.to);
  }

  fail() {
    this.loading.set(false);
    this.error.set(true);
  }
}
