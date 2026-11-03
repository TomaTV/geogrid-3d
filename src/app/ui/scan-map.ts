import { Component, ElementRef, OnDestroy, effect, input, output, untracked, viewChild } from '@angular/core';
import { createScanMap } from '../../lib/scan-map.js';

@Component({
  selector: 'app-scan-map',
  template: `<div #host style="position:absolute;inset:0"></div>`,
  host: { class: 'absolute inset-0 block' },
})
export class ScanMap implements OnDestroy {
  scan = input.required<any>();
  time = input('dusk');
  nodeSelected = output<{ index: number; node: any; hover: boolean } | null>();
  ready = output<{ buildings: number }>();
  failed = output<unknown>();

  private host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private instance: { destroy: () => void; setTime: (name: string) => void; zoom: (factor: number) => void } | null = null;

  constructor() {
    effect(() => {
      const scan = this.scan();
      this.instance?.destroy();
      this.instance = createScanMap(this.host().nativeElement, scan, {
        time: untracked(this.time),
        onNodeSelect: (e: any) => this.nodeSelected.emit(e),
        onReady: (e: any) => this.ready.emit(e),
        onError: (e: unknown) => this.failed.emit(e),
      });
    });
    effect(() => {
      const time = this.time();
      untracked(() => this.instance?.setTime(time));
    });
  }

  zoom(factor: number) {
    this.instance?.zoom(factor);
  }

  ngOnDestroy() {
    this.instance?.destroy();
  }
}
