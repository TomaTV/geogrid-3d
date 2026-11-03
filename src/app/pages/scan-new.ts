import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ScanRequest } from '../data/scan';
import { ScanSource } from '../data/scan-source';
import { ScanStore } from '../data/scan-store';

@Component({
  selector: 'app-scan-new',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <section class="mx-auto max-w-xl px-4 pb-16 sm:px-6">
      <p class="eyebrow">02 · New scan</p>
      <h1 class="display mt-2 text-[44px]">Map a business.</h1>
      <p class="mt-3 text-white/55">
        @if (source.mode === 'mock') {
          Mock mode: the result comes from a real scan saved in the project, no credit is used.
        } @else {
          Live mode: each point costs one Geogrid credit ({{ form.value.grid === 7 ? 49 : 25 }} for this grid).
        }
      </p>

      @if (running()) {
        <div class="card mt-8 p-6">
          <p class="eyebrow">{{ label() }}</p>
          <div class="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div class="h-full rounded-full bg-accent transition-[width] duration-700" [style.width.%]="progress() * 100"></div>
          </div>
          <p class="mt-3 font-mono text-[11px] text-white/40">{{ (progress() * 100).toFixed(0) }}%</p>
        </div>
      } @else {
        <form class="mt-8 space-y-5" [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <div>
            <label class="label" for="address">Address</label>
            <input id="address" class="input" [class.invalid]="bad('address')" formControlName="address" placeholder="12 rue de Rivoli, Paris" />
            @if (bad('address')) {
              <p class="field-error">{{ form.controls.address.hasError('required') ? 'The address is required.' : 'At least 5 characters.' }}</p>
            }
          </div>
          <div>
            <label class="label" for="keyword">Keyword</label>
            <input id="keyword" class="input" [class.invalid]="bad('keyword')" formControlName="keyword" placeholder="restaurant italien" />
            @if (bad('keyword')) { <p class="field-error">The keyword is required.</p> }
          </div>
          <div>
            <label class="label" for="business">Business to track</label>
            <input id="business" class="input" [class.invalid]="bad('business')" formControlName="business" placeholder="Name as it appears on Google Maps" />
            @if (bad('business')) { <p class="field-error">The business is required.</p> }
          </div>
          <div>
            <span class="label">Grid</span>
            <div class="flex gap-2">
              @for (g of grids; track g) {
                <button type="button" class="btn flex-1" [class.btn-primary]="form.value.grid === g" (click)="form.controls.grid.setValue(g)">{{ g }}x{{ g }}</button>
              }
            </div>
          </div>
          <div>
            <label class="label" for="note">Note (optional)</label>
            <textarea id="note" rows="2" class="input" [class.invalid]="bad('note')" formControlName="note"></textarea>
            <div class="mt-1 flex justify-between">
              @if (bad('note')) { <p class="field-error">200 characters maximum.</p> } @else { <span></span> }
              <span class="font-mono text-[10px] text-white/30">{{ form.value.note?.length ?? 0 }}/200</span>
            </div>
          </div>

          @if (error()) { <p class="field-error">{{ error() }}</p> }

          <div class="flex gap-3">
            <button class="btn btn-primary" type="submit">Start mapping</button>
            <a class="btn" routerLink="/scans">Cancel</a>
          </div>
        </form>
      }
    </section>
  `,
})
export class ScanNew {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private store = inject(ScanStore);
  source = inject(ScanSource);

  form = this.fb.nonNullable.group({
    address: ['', [Validators.required, Validators.minLength(5)]],
    keyword: ['', Validators.required],
    business: ['', Validators.required],
    grid: [5 as 5 | 7, Validators.required],
    note: ['', Validators.maxLength(200)],
  });

  grids: (5 | 7)[] = [5, 7];
  running = signal(false);
  progress = signal(0);
  label = signal('');
  error = signal<string | null>(null);

  bad(name: 'address' | 'keyword' | 'business' | 'note') {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || c.dirty);
  }

  async submit() {
    this.error.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.running.set(true);
    this.progress.set(0);
    try {
      const scan = await this.source.run(this.form.getRawValue() as ScanRequest, (v, l) => {
        this.progress.set(v);
        this.label.set(l);
      });
      const saved = await this.store.create(scan);
      await this.router.navigate(['/scans', saved.id]);
    } catch (e) {
      this.running.set(false);
      this.error.set(e instanceof Error && e.message ? e.message : 'The scan could not be saved. Nothing was added to the collection.');
    }
  }
}
