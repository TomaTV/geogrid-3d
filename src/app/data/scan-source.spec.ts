import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Scan, ScanRequest } from './scan';
import { ScanSource } from './scan-source';

const req: ScanRequest = { address: '10 rue de Rivoli, Paris', keyword: 'pizzeria', business: 'Chez Test', grid: 5, radius: 3000, note: 'n' };
const geo = [{ lat: '48.85', lon: '2.35' }];
const scanBody = (status: string, extra: object = {}) => ({
  data: { id: 'srv1', status, keyword: 'pizzeria', target_name: 'Chez Test', latitude: 48.85, longitude: 2.35, radius_meters: 3000, grid_size: 5, visibility_score: 40, grid_data: [{ lat: 1, lng: 2, rank: null }], ...extra },
});

describe('ScanSource live', () => {
  let source: ScanSource;
  let http: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    source = TestBed.inject(ScanSource);
    (source as unknown as { mode: string }).mode = 'live';
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => vi.useRealTimers());

  async function start(progress = vi.fn(), cancelled = () => false) {
    const p = source.run(req, progress, cancelled);
    const out = p.then((s) => ({ s }), (e) => ({ e }));
    http.expectOne((r) => r.url.includes('nominatim')).flush(geo);
    await vi.advanceTimersByTimeAsync(0);
    return { out, progress };
  }

  it('envoie le bon corps puis suit le scan jusqu à completed', async () => {
    const { out, progress } = await start();
    const post = http.expectOne('/live/scans');
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({
      keyword: 'pizzeria', target_name: 'Chez Test', latitude: 48.85, longitude: 2.35,
      radius_meters: 3000, grid_size: 5, location_name: '10 rue de Rivoli, Paris',
    });
    post.flush({ id: 'srv1' });
    await vi.advanceTimersByTimeAsync(2500);
    http.expectOne('/live/scans/srv1').flush(scanBody('running', { nodes_sampled: 10 }));
    await vi.advanceTimersByTimeAsync(2500);
    http.expectOne('/live/scans/srv1').flush(scanBody('completed'));
    const r = (await out) as { s: Scan };
    expect(r.s.tag).toBe('live');
    expect(r.s.id).not.toBe('srv1');
    expect(r.s.note).toBe('n');
    expect(progress).toHaveBeenCalledWith(1, 'Done');
  });

  it('tolère deux erreurs de polling puis abandonne à la troisième en donnant l id du scan', async () => {
    const { out } = await start();
    http.expectOne('/live/scans').flush({ id: 'srv1' });
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(2500);
      http.expectOne('/live/scans/srv1').flush({ error: { code: 'rate_limit_exceeded' } }, { status: 429, statusText: 'x' });
    }
    const r = (await out) as { e: Error };
    expect(r.e.message).toContain('srv1');
    expect(r.e.message).toContain('Too many requests');
  });

  it('une erreur isolée de polling ne casse pas le scan', async () => {
    const { out } = await start();
    http.expectOne('/live/scans').flush({ id: 'srv1' });
    await vi.advanceTimersByTimeAsync(2500);
    http.expectOne('/live/scans/srv1').flush('x', { status: 502, statusText: 'x' });
    await vi.advanceTimersByTimeAsync(2500);
    http.expectOne('/live/scans/srv1').flush(scanBody('partial'));
    expect(((await out) as { s: Scan }).s.tag).toBe('live');
  });

  it('remonte le message d erreur de l API quand le scan échoue', async () => {
    const { out } = await start();
    http.expectOne('/live/scans').flush({ id: 'srv1' });
    await vi.advanceTimersByTimeAsync(2500);
    http.expectOne('/live/scans/srv1').flush(scanBody('failed', { error_message: 'Queue unavailable' }));
    expect(((await out) as { e: Error }).e.message).toBe('Queue unavailable');
  });

  it('adresse introuvable : aucune requête payante', async () => {
    const p = source.run(req, vi.fn());
    const out = p.catch((e: Error) => e);
    http.expectOne((r) => r.url.includes('nominatim')).flush([]);
    expect(((await out) as Error).message).toBe('Address not found.');
    http.expectNone('/live/scans');
  });

  it('crédits insuffisants au lancement : erreur explicite, pas de polling', async () => {
    const p = source.run(req, vi.fn());
    const out = p.catch((e) => e);
    http.expectOne((r) => r.url.includes('nominatim')).flush(geo);
    await vi.advanceTimersByTimeAsync(0);
    http.expectOne('/live/scans').flush({ error: { code: 'insufficient_credits' } }, { status: 402, statusText: 'x' });
    const { describeError } = await import('./scan-source');
    expect(describeError(await out)).toContain('Not enough credits');
    http.expectNone('/live/scans/srv1');
  });
});
