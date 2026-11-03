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
    <article class="card flex flex-col gap-4 p-5">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="eyebrow truncate">{{ scan().keyword }}</p>
          <h3 class="display mt-1 truncate text-[24px]">{{ scan().target_name }}</h3>
        </div>
        <span class="pill shrink-0 text-white/50">{{ scan().tag || 'no tag' }}</span>
      </div>

      <div class="flex h-2 overflow-hidden rounded-full bg-white/[0.05]">
        @for (b of bands(); track b.color) {
          <span [style.width.%]="b.share" [style.background]="b.color"></span>
        }
      </div>

      <div class="flex items-end justify-between">
        <div>
          <p class="eyebrow">In the top 3</p>
          <p class="display mt-1 text-[30px]">{{ top3Percent() }}<span class="text-[16px] opacity-50">%</span></p>
        </div>
        <p class="font-mono text-[10.5px] uppercase tracking-[0.1em] text-white/35">{{ scan().grid_size }}x{{ scan().grid_size }} · {{ scan().saved_at | date: 'd MMM y' }}</p>
      </div>

      @if (editing()) {
        <div class="space-y-2">
          <input class="input" [(ngModel)]="draftTag" placeholder="Tag" maxlength="24" />
          <textarea class="input" rows="2" [(ngModel)]="draftNote" maxlength="200" placeholder="Note"></textarea>
          <div class="flex gap-2">
            <button class="btn btn-primary" (click)="save()">Save</button>
            <button class="btn" (click)="editing.set(false)">Cancel</button>
          </div>
        </div>
      } @else {
        @if (scan().note) {
          <p class="text-[12.5px] leading-snug text-white/55">{{ scan().note }}</p>
        }
        <div class="mt-auto flex flex-wrap gap-2">
          <a class="btn btn-primary" [routerLink]="['/scans', scan().id]">Open in 3D</a>
          <button class="btn" (click)="startEdit()">Edit</button>
          <button class="btn btn-danger" (click)="deleted.emit(scan().id)">Delete</button>
        </div>
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
