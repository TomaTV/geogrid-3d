import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ScanStore } from '../data/scan-store';
import { ScanCard } from '../ui/scan-card';

@Component({
  selector: 'app-scans',
  imports: [RouterLink, ScanCard],
  template: `
    <section class="mx-auto max-w-[1400px] px-4 pb-16 sm:px-6">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="font-display text-[clamp(1.8rem,4vw,2.4rem)] italic leading-[1.1] tracking-[-0.03em]"><span class="font-light text-white/60">Scan</span><span class="font-medium text-white">&nbsp;History</span></h1>
          <p class="mt-1.5 text-[13px] text-white/30">Browse, edit and delete the scans you saved in 3D</p>
        </div>
        <a routerLink="/scans/new" class="btn btn-primary">Start Mapping</a>
      </div>

      @if (store.state() === 'ready' && store.count() > 0) {
        <div class="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div class="card p-4"><p class="eyebrow">Scans</p><p class="display mt-1 text-[32px]">{{ store.count() }}</p></div>
          <div class="card p-4"><p class="eyebrow">Average rank</p><p class="display mt-1 text-[32px]">{{ store.averageRank() === null ? '-' : '#' + store.averageRank()!.toFixed(1) }}</p></div>
          <div class="card p-4"><p class="eyebrow">Points in top 3</p><p class="display mt-1 text-[32px]">{{ store.top3Share() === null ? '-' : (store.top3Share()! * 100).toFixed(0) + '%' }}</p></div>
          <div class="card p-4"><p class="eyebrow">Last scan</p><p class="display mt-1 truncate text-[22px]">{{ store.sorted()[0].target_name }}</p></div>
        </div>
      }

      @if (actionError()) {
        <p class="field-error mt-6">{{ actionError() }}</p>
      }

      <div class="mt-8">
        @switch (store.state()) {
          @case ('loading') {
            <div class="space-y-2">
              @for (i of [1, 2, 3]; track i) {
                <div class="h-16 animate-pulse rounded-xl bg-white/[0.03]"></div>
              }
            </div>
          }
          @case ('error') {
            <div class="card p-8 text-center">
              <p class="eyebrow text-red-300/80">Collection unavailable</p>
              <p class="mt-2 text-white/60">{{ store.error() }}</p>
              <button class="btn mt-5" (click)="store.load()">Try again</button>
            </div>
          }
          @case ('ready') {
            @if (store.count() === 0) {
              <div class="card p-10 text-center">
                <p class="eyebrow">Nothing here yet</p>
                <h2 class="display mt-2 text-[30px]">Your first scan in 3D.</h2>
                <p class="mx-auto mt-2 max-w-md text-white/55">Pick an address, a keyword and a business. The ranking appears on the buildings.</p>
                <a routerLink="/scans/new" class="btn btn-primary mt-6">Start mapping</a>
              </div>
            } @else {
              <div class="space-y-2">
                <div class="hidden grid-cols-[minmax(0,2.2fr)_120px_minmax(80px,1fr)_70px_90px_auto] gap-x-4 px-4 pb-1 sm:grid"><span class="label !mb-0">Business</span><span class="label !mb-0">Tag</span><span class="label !mb-0">Rank spread</span><span class="label !mb-0 text-right">Top 3</span><span class="label !mb-0">Saved</span><span class="w-[190px]"></span></div>
                @for (s of store.sorted(); track s.id) {
                  <app-scan-card [scan]="s" (edited)="edit($event)" (deleted)="remove($event)" />
                }
              </div>
            }
          }
        }
      </div>
    </section>
  `,
})
export class Scans {
  store = inject(ScanStore);
  actionError = signal<string | null>(null);

  constructor() {
    this.store.load();
  }

  async edit(e: { id: string; note: string; tag: string }) {
    this.actionError.set(null);
    try {
      await this.store.update(e.id, { note: e.note, tag: e.tag });
    } catch {
      this.actionError.set('The change could not be saved. It has been reverted.');
    }
  }

  async remove(id: string) {
    this.actionError.set(null);
    try {
      await this.store.remove(id);
    } catch {
      this.actionError.set('The scan could not be deleted. It is still in the collection.');
    }
  }
}
