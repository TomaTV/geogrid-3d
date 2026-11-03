import { Component } from '@angular/core';

@Component({
  selector: 'app-rank-legend',
  template: `
    @for (l of items; track l.label) {
      <span class="eyebrow flex items-center gap-2"><i class="h-2 w-2 rounded-full" [style.background]="l.color"></i>{{ l.label }}</span>
    }
  `,
  host: { class: 'flex items-center gap-4' },
})
export class RankLegend {
  items = [
    { label: '1', color: '#22c55e' },
    { label: '2-3', color: '#34d399' },
    { label: '4-5', color: '#86efac' },
    { label: '6-10', color: '#fbbf24' },
    { label: '11-15', color: '#f97316' },
    { label: '16-20', color: '#ef4444' },
    { label: '20+ / none', color: '#555555' },
  ];
}
