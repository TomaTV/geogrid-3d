import { Component, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ScanView } from '../ui/scan-view';
import { ScanStore } from '../data/scan-store';

@Component({
  selector: 'app-scan-detail',
  imports: [ScanView, RouterLink],
  template: `
    @if (scan(); as s) {
      <app-scan-view [scan]="s" />
    } @else if (failed()) {
      <section class="grid min-h-dvh place-items-center px-4 text-center">
        <div>
          <p class="eyebrow">Scan not found</p>
          <h1 class="display mt-2 text-[34px]">This scan does not exist.</h1>
          <a routerLink="/scans" class="btn mt-6">Back to the collection</a>
        </div>
      </section>
    } @else {
      <section class="grid min-h-dvh place-items-center"><p class="eyebrow">Loading scan</p></section>
    }
  `,
})
export class ScanDetail {
  private store = inject(ScanStore);
  id = input.required<string>();
  scan = signal<any>(null);
  failed = signal(false);

  ngOnInit() {
    this.store
      .get(this.id())
      .then((s) => this.scan.set(s))
      .catch(() => this.failed.set(true));
  }
}
