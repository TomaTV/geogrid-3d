import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', title: 'Geogrid 3D', loadComponent: () => import('./pages/home').then((m) => m.Home) },
  { path: 'scans', title: 'Scans', loadComponent: () => import('./pages/scans').then((m) => m.Scans) },
  { path: 'scans/new', title: 'New scan', loadComponent: () => import('./pages/scan-new').then((m) => m.ScanNew) },
  { path: 'scans/:id', title: 'Scan', loadComponent: () => import('./pages/scan-detail').then((m) => m.ScanDetail) },
  { path: '**', redirectTo: '' },
];
