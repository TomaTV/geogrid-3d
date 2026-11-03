import { Component, ElementRef, OnDestroy, effect, input, output, viewChild } from '@angular/core';
import { createScanMap } from '../../lib/scan-map.js';

@Component({
  selector: 'app-scan-map',
  template: `<div #host style="position:absolute;inset:0"></div>`,
  host: { class: 'absolute inset-0 block' },
})
export class ScanMap implements OnDestroy {
  scan = input.required<any>();
  nodeSelected = output<{ index: number; node: any; hover: boolean } | null>();
  ready = output<{ buildings: number }>();
  failed = output<unknown>();

  private host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private instance: { destroy: () => void } | null = null;

  constructor() {
    effect(() => {
      const scan = this.scan();
      this.instance?.destroy();
      this.instance = createScanMap(this.host().nativeElement, scan, {
        onNodeSelect: (e: any) => this.nodeSelected.emit(e),
        onReady: (e: any) => this.ready.emit(e),
        onError: (e: unknown) => this.failed.emit(e),
      });
    });
  }

  ngOnDestroy() {
    this.instance?.destroy();
  }
}
