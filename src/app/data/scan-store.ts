import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom, retry, timer } from 'rxjs';
import { Scan } from './scan';

export type LoadState = 'idle' | 'loading' | 'error' | 'ready';

const retryTwice = { count: 2, delay: (_: unknown, n: number) => timer(300 * n) };

@Injectable({ providedIn: 'root' })
export class ScanStore {
  private http = inject(HttpClient);
  readonly #scans = signal<Scan[]>([]);
  readonly scans = this.#scans.asReadonly();
  readonly state = signal<LoadState>('idle');
  readonly error = signal<string | null>(null);

  readonly sorted = computed(() => [...this.#scans()].sort((a, b) => b.saved_at.localeCompare(a.saved_at)));
  readonly count = computed(() => this.#scans().length);
  readonly averageRank = computed(() => {
    const ranks = this.#scans().flatMap((s) => s.grid_data.map((n) => n.rank).filter((r): r is number => r != null && r <= 20));
    return ranks.length ? ranks.reduce((a, b) => a + b, 0) / ranks.length : null;
  });
  readonly top3Share = computed(() => {
    const ranks = this.#scans().flatMap((s) => s.grid_data.map((n) => n.rank).filter((r): r is number => r != null));
    return ranks.length ? ranks.filter((r) => r <= 3).length / ranks.length : null;
  });

  async load() {
    this.state.set('loading');
    this.error.set(null);
    try {
      const list = await firstValueFrom(this.http.get<Scan[]>('/api/scans').pipe(retry(retryTwice)));
      this.#scans.set(list);
      this.state.set('ready');
    } catch {
      this.error.set('The collection API is not reachable. Start it with npm run api.');
      this.state.set('error');
    }
  }

  async get(id: string): Promise<Scan> {
    const known = this.#scans().find((s) => s.id === id);
    if (known) return known;
    return firstValueFrom(this.http.get<Scan>('/api/scans/' + id).pipe(retry(retryTwice)));
  }

  async create(scan: Scan): Promise<Scan> {
    const saved = await firstValueFrom(this.http.post<Scan>('/api/scans', scan).pipe(retry(retryTwice)));
    this.#scans.update((l) => [saved, ...l]);
    return saved;
  }

  async update(id: string, patch: Partial<Pick<Scan, 'note' | 'tag'>>) {
    const before = this.#scans();
    this.#scans.set(before.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    try {
      await firstValueFrom(this.http.patch<Scan>('/api/scans/' + id, patch).pipe(retry(retryTwice)));
    } catch (e) {
      this.#scans.set(before);
      throw e;
    }
  }

  async remove(id: string) {
    const before = this.#scans();
    this.#scans.set(before.filter((s) => s.id !== id));
    try {
      await firstValueFrom(this.http.delete('/api/scans/' + id).pipe(retry(retryTwice)));
    } catch (e) {
      this.#scans.set(before);
      throw e;
    }
  }
}
