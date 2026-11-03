import { Component } from '@angular/core';

@Component({
  selector: 'app-rank-legend',
  template: `
    <p class="eyebrow mb-2">Rank</p>
    <ul class="space-y-1">
      @for (l of items; track l.label) {
        <li class="flex items-center gap-2 font-mono text-[10px] text-white/65"><i class="h-2.5 w-2.5 rounded-[3px]" [style.background]="l.color"></i>{{ l.label }}</li>
      }
    </ul>
  `,
  host: { class: 'block' },
})
export class RankLegend {
  items = [
    { label: '1', color: '#22c55e' },
    { label: '2-3', color: '#34d399' },
    { label: '4-5', color: '#86efac' },
    { label: '6-10', color: '#fbbf24' },
    { label: '11-15', color: '#f97316' },
    { label: '16-20', color: '#ef4444' },
    { label: '20+', color: '#555555' },
  ];
}
