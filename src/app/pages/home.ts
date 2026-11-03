import { Component } from '@angular/core';
import { ScanView } from '../ui/scan-view';

@Component({
  selector: 'app-home',
  imports: [ScanView],
  template: `<app-scan-view />`,
})
export class Home {}
