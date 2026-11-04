import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ScanView } from '../ui/scan-view';

@Component({
  selector: 'app-home',
  imports: [ScanView],
  template: `@if (scan(); as s) { <app-scan-view [scan]="s" /> }`,
})
export class Home {
  scan = signal<any>(null);

  constructor() {
    inject(HttpClient)
      .get<{ data: unknown }>('mock/scan-demo-21.json')
      .subscribe((r) => this.scan.set(r.data));
  }
}
