import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Scan } from './scan';
import { ScanStore } from './scan-store';

const scan = (id: string, over: Partial<Scan> = {}): Scan => ({
  id,
  keyword: 'plombier',
  target_name: 'Test',
  latitude: 48.85,
  longitude: 2.35,
  radius_meters: 1000,
  grid_size: 5,
  status: 'completed',
  visibility_score: 50,
  grid_data: [
    { lat: 0, lng: 0, rank: 1 },
    { lat: 0, lng: 0, rank: 8 },
    { lat: 0, lng: 0, rank: null },
  ],
  note: 'avant',
  tag: '',
  saved_at: '2026-11-01T10:00:00Z',
  ...over,
});

async function failAll(http: HttpTestingController, url: string, method: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let req;
    for (let i = 0; i < 50 && !(req = http.match((r) => r.url === url && r.method === method)[0]); i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    req!.flush('boom', { status: 500, statusText: 'Server Error' });
  }
}

describe('ScanStore', () => {
  let store: ScanStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    store = TestBed.inject(ScanStore);
    http = TestBed.inject(HttpTestingController);
  });

  async function loaded(list: Scan[]) {
    const p = store.load();
    http.expectOne('/api/scans').flush(list);
    await p;
  }

  it('calcule le rang moyen et la part du top 3 en ignorant les nodes non mesurés', async () => {
    await loaded([scan('a')]);
    expect(store.count()).toBe(1);
    expect(store.averageRank()).toBe(4.5);
    expect(store.top3Share()).toBe(0.5);
  });

  it('trie les scans du plus récent au plus ancien', async () => {
    await loaded([scan('old'), scan('new', { saved_at: '2026-11-03T10:00:00Z' })]);
    expect(store.sorted().map((s) => s.id)).toEqual(['new', 'old']);
  });

  it('annule la modification locale quand le PATCH échoue', async () => {
    await loaded([scan('a')]);
    const p = store.update('a', { note: 'après' });
    expect(store.scans()[0].note).toBe('après');
    const rejected = expect(p).rejects.toBeDefined();
    await failAll(http, '/api/scans/a', 'PATCH');
    await rejected;
    expect(store.scans()[0].note).toBe('avant');
  });

  it('remet le scan en place quand le DELETE échoue', async () => {
    await loaded([scan('a')]);
    const p = store.remove('a');
    expect(store.count()).toBe(0);
    const rejected = expect(p).rejects.toBeDefined();
    await failAll(http, '/api/scans/a', 'DELETE');
    await rejected;
    expect(store.count()).toBe(1);
  });

  it("passe en erreur quand l'API est injoignable", async () => {
    const p = store.load();
    await failAll(http, '/api/scans', 'GET');
    await p;
    expect(store.state()).toBe('error');
    expect(store.error()).toContain('npm run api');
  });
});
