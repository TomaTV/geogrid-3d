import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { SCAN_MODE, Scan, ScanRequest } from './scan';

export type Progress = (value: number, label: string) => void;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const API_ERRORS: Record<string, string> = {
  no_key: 'No API key: put GEOGRID_API_KEY in .env, then restart npm run dev.',
  insufficient_credits: 'Not enough credits on this API key to run the scan.',
  plan_required: 'This API key does not allow scans.',
  scan_limit_reached: 'The scan limit of this account is reached.',
  rate_limit_exceeded: 'Too many requests, retry in a minute.',
  upstream_unreachable: 'The Geogrid API is unreachable.',
};

export function describeError(e: unknown): string | null {
  if (e instanceof HttpErrorResponse) {
    const code = e.error?.error?.code as string | undefined;
    return (code && API_ERRORS[code]) || e.error?.error?.message || `The server answered ${e.status}.`;
  }
  return e instanceof Error && e.message ? e.message : null;
}

@Injectable({ providedIn: 'root' })
export class ScanSource {
  private http = inject(HttpClient);
  readonly mode = SCAN_MODE;

  run(req: ScanRequest, progress: Progress, cancelled: () => boolean = () => false): Promise<Scan> {
    return this.mode === 'mock' ? this.runMock(req, progress) : this.runLive(req, progress, cancelled);
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

  private async runLive(req: ScanRequest, progress: Progress, cancelled: () => boolean): Promise<Scan> {
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
      location_name: req.address,
    };
    const start = await firstValueFrom(this.http.post<{ id: string }>('/live/scans', body));
    const total = req.grid * req.grid;
    let failures = 0;
    for (let i = 0; i < 160; i++) {
      await wait(2500);
      if (cancelled()) throw new Error(`Scan ${start.id} left running on the server.`);
      let s: Scan & { nodes_sampled?: number; error_message?: string };
      try {
        s = (await firstValueFrom(this.http.get<{ data: typeof s }>('/live/scans/' + start.id))).data;
        failures = 0;
      } catch (e) {
        if (++failures < 3) continue;
        throw new Error(`Lost track of scan ${start.id} (${describeError(e)}). It is paid and still running: do not start another one.`);
      }
      progress(Math.min(0.95, 0.1 + ((s.nodes_sampled ?? 0) / total) * 0.85), 'Ranking each point');
      if (s.status === 'completed' || s.status === 'partial') {
        progress(1, 'Done');
        return this.toScan(s, req);
      }
      if (s.status === 'failed') throw new Error(s.error_message ?? 'The scan failed.');
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
