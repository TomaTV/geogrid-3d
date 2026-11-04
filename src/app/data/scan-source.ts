import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { SCAN_MODE, Scan, ScanRequest } from './scan';

export type Progress = (value: number, label: string) => void;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

@Injectable({ providedIn: 'root' })
export class ScanSource {
  private http = inject(HttpClient);
  readonly mode = SCAN_MODE;

  run(req: ScanRequest, progress: Progress): Promise<Scan> {
    return this.mode === 'mock' ? this.runMock(req, progress) : this.runLive(req, progress);
  }

  private async runMock(req: ScanRequest, progress: Progress): Promise<Scan> {
    const fixture = await firstValueFrom(this.http.get<{ data: Scan }>('mock/scan-demo-21.json'));
    const steps = ['Locating the address', 'Querying Google Maps', 'Ranking each point', 'Building the 3D view'];
    for (let i = 0; i < steps.length; i++) {
      progress((i + 0.5) / steps.length, steps[i]);
      await wait(700);
    }
    progress(1, 'Done');
    return this.toScan(fixture.data, req);
  }

  private async runLive(req: ScanRequest, progress: Progress): Promise<Scan> {
    progress(0.05, 'Locating the address');
    const geo = await firstValueFrom(
      this.http.get<{ lat: string; lon: string }[]>('https://nominatim.openstreetmap.org/search', {
        params: { q: req.address, format: 'json', limit: 1 },
      }),
    );
    if (!geo.length) throw new Error('Address not found.');
    const body = {
      keyword: req.keyword,
      target_name: req.business,
      latitude: Number(geo[0].lat),
      longitude: Number(geo[0].lon),
      radius_meters: req.radius,
      grid_size: req.grid,
    };
    const start = await firstValueFrom(this.http.post<{ id: string }>('/live/scans', body));
    const total = req.grid * req.grid;
    for (let i = 0; i < 160; i++) {
      await wait(2500);
      const r = await firstValueFrom(this.http.get<{ data: Scan & { nodes_sampled?: number } }>('/live/scans/' + start.id));
      const s = r.data;
      progress(Math.min(0.95, 0.1 + ((s.nodes_sampled ?? 0) / total) * 0.85), 'Ranking each point');
      if (s.status === 'completed' || s.status === 'partial') {
        progress(1, 'Done');
        return this.toScan(s, req);
      }
      if (s.status === 'failed') throw new Error('The scan failed.');
    }
    throw new Error('The scan took too long.');
  }

  private toScan(data: Scan, req: ScanRequest): Scan {
    const { id: _id, ...rest } = data;
    return {
      ...rest,
      id: 's' + Date.now().toString(36),
      keyword: req.keyword,
      target_name: req.business,
      note: req.note,
      tag: this.mode === 'mock' ? 'mock' : 'live',
      saved_at: new Date().toISOString(),
    };
  }
}
