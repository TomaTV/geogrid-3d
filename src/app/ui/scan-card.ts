import { Component, computed, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Scan } from '../data/scan';
import { rankColor } from '../../lib/rank-colors.js';

@Component({
  selector: 'app-scan-card',
  imports: [RouterLink, DatePipe, FormsModule],
  template: `
    <article class="group rounded-xl border border-white/[0.06] bg-white/[0.015] transition hover:bg-white/[0.03]">
      <div class="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-3 px-4 py-3.5 sm:grid-cols-[minmax(0,2.2fr)_120px_minmax(80px,1fr)_70px_90px_auto]">
        <div class="min-w-0">
          <p class="truncate text-[14px] font-medium">{{ scan().target_name }}</p>
          <p class="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.12em] text-white/35">{{ scan().keyword }}</p>
        </div>
        <span class="pill hidden w-fit text-white/50 sm:inline-flex">{{ scan().tag || "no tag" }}</span>
        <div class="hidden h-1.5 overflow-hidden rounded-full bg-white/[0.06] sm:flex">
          @for (b of bands(); track b.color) {
            <span [style.width.%]="b.share" [style.background]="b.color"></span>
          }
        </div>
        <p class="hidden text-right font-mono text-[12px] sm:block"><span class="display text-[18px]">{{ top3Percent() }}</span><span class="text-white/40">%</span></p>
        <p class="hidden font-mono text-[10.5px] uppercase tracking-[0.1em] text-white/35 sm:block">{{ scan().saved_at | date: "d MMM y" }}</p>
        <div class="flex items-center justify-end gap-1.5">
          <a class="btn btn-primary !px-3 !py-1.5 text-[12px]" [routerLink]="['/scans', scan().id]">Open</a>
          <button class="btn !px-3 !py-1.5 text-[12px]" (click)="startEdit()">Edit</button>
          <button class="btn btn-danger !px-3 !py-1.5 text-[12px]" (click)="deleted.emit(scan().id)">Delete</button>
        </div>
      </div>
      @if (editing()) {
        <div class="space-y-2 border-t border-white/[0.06] px-4 py-3">
          <input class="input" [(ngModel)]="draftTag" placeholder="Tag" maxlength="24" />
          <textarea class="input" rows="2" [(ngModel)]="draftNote" maxlength="200" placeholder="Note"></textarea>
          <div class="flex gap-2">
            <button class="btn btn-primary" (click)="save()">Save</button>
            <button class="btn" (click)="editing.set(false)">Cancel</button>
          </div>
        </div>
      } @else if (scan().note) {
        <p class="border-t border-white/[0.06] px-4 py-2.5 text-[12px] text-white/45">{{ scan().note }}</p>
      }
    </article>
  `,
})
export class ScanCard {
  scan = input.required<Scan>();
  edited = output<{ id: string; note: string; tag: string }>();
  deleted = output<string>();

  editing = signal(false);
  draftNote = '';
  draftTag = '';

  top3Percent = computed(() => {
    const r = this.scan().grid_data.map((n) => n.rank).filter((v): v is number => v != null);
    return r.length ? Math.round((r.filter((v) => v <= 3).length / r.length) * 100) : 0;
  });

  bands = computed(() => {
    const nodes = this.scan().grid_data;
    const map = new Map<string, number>();
    for (const n of nodes) {
      const c = rankColor(n.rank);
      map.set(c, (map.get(c) ?? 0) + 1);
    }
    return [...map.entries()].map(([color, count]) => ({ color, share: (count / nodes.length) * 100 }));
  });

  startEdit() {
    this.draftNote = this.scan().note;
    this.draftTag = this.scan().tag;
    this.editing.set(true);
  }

  save() {
    this.edited.emit({ id: this.scan().id, note: this.draftNote.slice(0, 200), tag: this.draftTag.trim() });
    this.editing.set(false);
  }
}
