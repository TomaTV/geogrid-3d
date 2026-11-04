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
  scanColors = input(false);
  origin = input<[number, number] | null>(null);
  nodeSelected = output<{ index: number; node: any; hover: boolean } | null>();
  ready = output<{ buildings: number }>();
  failed = output<unknown>();

  private host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private instance: any = null;

  constructor() {
    effect(() => {
      const scan = this.scan();
      const origin = this.origin();
      this.instance?.destroy();
      this.instance = createScanMap(this.host().nativeElement, scan, {
        time: untracked(this.time),
        origin,
        onNodeSelect: (e: any) => this.nodeSelected.emit(e),
        onReady: (e: any) => this.ready.emit(e),
        onError: (e: unknown) => this.failed.emit(e),
      });
      this.instance.setScanColors(untracked(this.scanColors));
    });
    effect(() => {
      const time = this.time();
      untracked(() => this.instance?.setTime(time));
    });
    effect(() => {
      const on = this.scanColors();
      untracked(() => this.instance?.setScanColors(on));
    });
  }

  engine() {
    return this.instance;
  }

  ngOnDestroy() {
    this.instance?.destroy();
  }
}
