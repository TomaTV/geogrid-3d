import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ScanStore } from '../data/scan-store';
import { ScanCard } from '../ui/scan-card';

@Component({
  selector: 'app-scans',
  imports: [RouterLink, ScanCard],
  template: `
    <section class="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
      <p class="eyebrow">01 · Collection</p>
      <div class="mt-2 flex flex-wrap items-end justify-between gap-4">
        <h1 class="display text-[44px]">Saved scans.</h1>
        <a routerLink="/scans/new" class="btn btn-primary">New scan</a>
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
            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              @for (i of [1, 2, 3]; track i) {
                <div class="card h-[220px] animate-pulse"></div>
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
              <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
