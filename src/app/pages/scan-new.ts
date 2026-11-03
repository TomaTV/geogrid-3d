import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ScanRequest } from '../data/scan';
import { ScanSource } from '../data/scan-source';
import { ScanStore } from '../data/scan-store';

type Field = 'address' | 'keyword' | 'business' | 'note';

@Component({
  selector: 'app-scan-new',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <section class="mx-auto max-w-[720px] px-4 pb-16 sm:px-6">
      <p class="eyebrow">New scan</p>
      <h1 class="font-display mt-2 text-[clamp(1.8rem,4vw,2.4rem)] italic leading-[1.1] tracking-[-0.03em]">
        <span class="font-light text-white/60">Map a</span><span class="font-medium text-white">&nbsp;business</span>
      </h1>
      <p class="mt-1.5 text-[13px] text-white/30">
        @if (source.mode === 'mock') {
          Mock mode: the result comes from a real scan saved in the project, no credit is used.
        } @else {
          Live mode: each point costs one Geogrid credit.
        }
      </p>

      <ol class="mt-8 grid grid-cols-3 gap-2">
        @for (s of steps; track s.num) {
          <li class="rounded-xl border px-3.5 py-3 transition"
              [class.border-accent/40]="step() === s.num" [class.bg-accent/[0.06]]="step() === s.num"
              [class.border-white/[0.06]]="step() !== s.num">
            <p class="font-mono text-[9px] uppercase tracking-[0.15em]" [class.text-accent]="step() >= s.num" [class.text-white/30]="step() < s.num">Step 0{{ s.num }}</p>
            <p class="mt-0.5 text-[13px] font-medium" [class.text-white/40]="step() < s.num">{{ s.label }}</p>
          </li>
        }
      </ol>

      @if (running()) {
        <div class="card mt-6 p-6">
          <p class="eyebrow">{{ label() }}</p>
          <div class="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div class="h-full rounded-full bg-accent transition-[width] duration-700" [style.width.%]="progress() * 100"></div>
          </div>
          <p class="mt-3 font-mono text-[11px] text-white/40">{{ (progress() * 100).toFixed(0) }}%</p>
        </div>
      } @else {
        <form class="card mt-6 space-y-5 p-6" [formGroup]="form" (ngSubmit)="next()" novalidate>
          @switch (step()) {
            @case (1) {
              <div>
                <label class="label" for="address">Address</label>
                <input id="address" class="input" [class.invalid]="bad('address')" formControlName="address" placeholder="e.g. 10 rue de Rivoli, Paris" />
                @if (bad('address')) {
                  <p class="field-error">{{ form.controls.address.hasError('required') ? 'The address is required.' : 'At least 5 characters.' }}</p>
                }
              </div>
              <div>
                <label class="label" for="keyword">Keyword</label>
                <input id="keyword" class="input" [class.invalid]="bad('keyword')" formControlName="keyword" placeholder="e.g. plumber, dentist, pizza" />
                @if (bad('keyword')) { <p class="field-error">The keyword is required.</p> }
              </div>
            }
            @case (2) {
              <div>
                <label class="label" for="business">Business to track</label>
                <input id="business" class="input" [class.invalid]="bad('business')" formControlName="business" placeholder="Name as it appears on Google Maps" />
                @if (bad('business')) { <p class="field-error">The business is required.</p> }
                <p class="mt-2 text-[12px] text-white/35">Its Google listing gives the position shown as the green pin in 3D.</p>
              </div>
            }
            @case (3) {
              <div>
                <span class="label">Grid</span>
                <div class="flex gap-2">
                  @for (g of grids; track g) {
                    <button type="button" class="btn flex-1" [class.btn-primary]="form.value.grid === g" (click)="form.controls.grid.setValue(g)">{{ g }}x{{ g }} <span class="font-mono text-[10px] opacity-60">{{ g * g }} points</span></button>
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
              <div class="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <p class="label">Scan summary</p>
                <dl class="space-y-1.5 text-[13px]">
                  <div class="flex justify-between gap-4"><dt class="text-white/40">Address</dt><dd class="truncate text-right">{{ form.value.address }}</dd></div>
                  <div class="flex justify-between gap-4"><dt class="text-white/40">Keyword</dt><dd class="truncate text-right">{{ form.value.keyword }}</dd></div>
                  <div class="flex justify-between gap-4"><dt class="text-white/40">Business</dt><dd class="truncate text-right">{{ form.value.business }}</dd></div>
                  <div class="flex justify-between gap-4"><dt class="text-white/40">Credits</dt><dd class="font-mono">{{ source.mode === 'mock' ? '0 (mock)' : credits() }}</dd></div>
                </dl>
              </div>
            }
          }

          @if (error()) { <p class="field-error">{{ error() }}</p> }

          <div class="flex items-center justify-between pt-1">
            @if (step() > 1) {
              <button type="button" class="btn" (click)="back()">&larr; Back</button>
            } @else {
              <a class="btn" routerLink="/scans">Cancel</a>
            }
            <button class="btn btn-primary" type="submit">{{ step() === 3 ? 'Start Mapping' : 'Continue' }}</button>
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

  steps = [
    { num: 1, label: 'Address' },
    { num: 2, label: 'Business' },
    { num: 3, label: 'Grid config' },
  ];
  grids: (5 | 7)[] = [5, 7];

  form = this.fb.nonNullable.group({
    address: ['', [Validators.required, Validators.minLength(5)]],
    keyword: ['', Validators.required],
    business: ['', Validators.required],
    grid: [5 as 5 | 7, Validators.required],
    note: ['', Validators.maxLength(200)],
  });

  step = signal(1);
  running = signal(false);
  progress = signal(0);
  label = signal('');
  error = signal<string | null>(null);
  credits = computed(() => (this.form.value.grid === 7 ? 49 : 25));

  private stepFields: Record<number, Field[]> = { 1: ['address', 'keyword'], 2: ['business'], 3: ['note'] };

  bad(name: Field) {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || c.dirty);
  }

  back() {
    this.error.set(null);
    this.step.update((s) => Math.max(1, s - 1));
  }

  async next() {
    this.error.set(null);
    const fields = this.stepFields[this.step()];
    fields.forEach((f) => this.form.controls[f].markAsTouched());
    if (fields.some((f) => this.form.controls[f].invalid)) return;
    if (this.step() < 3) {
      this.step.update((s) => s + 1);
      return;
    }
    await this.launch();
  }

  private async launch() {
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
