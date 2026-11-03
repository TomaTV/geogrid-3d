import { Component } from '@angular/core';
import { ScanView } from '../ui/scan-view';

@Component({
  selector: 'app-scan-detail',
  imports: [ScanView],
  template: `<app-scan-view />`,
})
export class ScanDetail {}
