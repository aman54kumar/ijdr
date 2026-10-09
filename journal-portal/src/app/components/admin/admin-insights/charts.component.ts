import { DecimalPipe } from '@angular/common';
import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Bar, fmtDate } from './insights';

/** Series colours: theme tokens, so charts follow light/dark. */
export const SERIES = ['var(--link)', 'var(--accent-500)', 'var(--warning-600)', 'var(--error-600)', 'var(--academic-navy-300)', 'var(--secondary-400)'];

export interface AreaSeries {
  name: string;
  values: number[];
  color: string;
}

/** Stacked area chart over dates with a hover read-out and a text alternative. */
@Component({
  selector: 'app-area-chart',
  standalone: true,
  template: `
    <div class="wrap">
      <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" class="chart" role="img" [attr.aria-label]="label" (mouseleave)="hover = -1">
        @for (t of ticks; track t.y) {
          <line [attr.x1]="L" [attr.x2]="W - R" [attr.y1]="t.y" [attr.y2]="t.y" class="grid" />
          <text [attr.x]="L - 6" [attr.y]="t.y + 4" class="axis" text-anchor="end">{{ t.v }}</text>
        }
        @for (a of areas; track a.name) {
          <path [attr.d]="a.fill" [attr.fill]="a.color" fill-opacity="0.22" />
          <path [attr.d]="a.line" [attr.stroke]="a.color" fill="none" stroke-width="2" stroke-linejoin="round" />
        }
        @for (x of xLabels; track x.i) {
          <text [attr.x]="x.x" [attr.y]="H - 6" class="axis" text-anchor="middle">{{ x.text }}</text>
        }
        @if (hover >= 0) {
          <line [attr.x1]="px(hover)" [attr.x2]="px(hover)" [attr.y1]="T" [attr.y2]="H - B" class="cursor" />
        }
        @for (d of dates; track $index) {
          <rect [attr.x]="px($index) - step / 2" [attr.y]="T" [attr.width]="step" [attr.height]="H - T - B" fill="transparent" (mouseenter)="hover = $index" (focus)="hover = $index" tabindex="-1" />
        }
      </svg>
      @if (hover >= 0) {
        <div class="tip" [style.left.%]="(px(hover) / W) * 100">
          <strong>{{ fmt(dates[hover]) }}</strong>
          @for (s of series; track s.name) {
            <div><span class="dot" [style.background]="s.color"></span>{{ s.name }}: {{ s.values[hover] }}</div>
          }
        </div>
      }
    </div>
    <div class="legend">
      @for (s of series; track s.name) { <span><span class="dot" [style.background]="s.color"></span>{{ s.name }}</span> }
    </div>
  `,
  styles: `
    .wrap { position: relative; }
    .chart { width: 100%; height: auto; display: block; overflow: visible; }
    .grid { stroke: var(--border); stroke-width: 1; stroke-dasharray: 3 4; }
    .axis { fill: var(--text-muted); font-size: 10px; }
    .cursor { stroke: var(--border-strong); stroke-width: 1; }
    .tip { position: absolute; top: 0; transform: translateX(-50%); background: var(--surface); color: var(--text); border: 1px solid var(--border-strong); border-radius: .4rem; padding: .35rem .55rem; font-size: .75rem; pointer-events: none; box-shadow: var(--shadow-md); white-space: nowrap; z-index: 2; }
    .legend { display: flex; gap: 1rem; font-size: .75rem; color: var(--text-muted); margin-top: .25rem; }
    .dot { display: inline-block; width: .6rem; height: .6rem; border-radius: 50%; margin-right: .35rem; }
  `,
})
export class AreaChartComponent {
  @Input() dates: string[] = [];
  @Input() series: AreaSeries[] = [];
  @Input() label = 'Daily views';
  hover = -1;
  readonly W = 640;
  readonly H = 220;
  readonly L = 34;
  readonly R = 8;
  readonly T = 10;
  readonly B = 24;

  get step() {
    return this.dates.length > 1 ? (this.W - this.L - this.R) / (this.dates.length - 1) : this.W - this.L - this.R;
  }
  private get stackMax(): number {
    const n = this.dates.length;
    let m = 1;
    for (let i = 0; i < n; i++) m = Math.max(m, this.series.reduce((a, s) => a + (s.values[i] ?? 0), 0));
    return this.niceMax(m);
  }
  private niceMax(m: number): number {
    const p = Math.pow(10, Math.floor(Math.log10(m)));
    const f = m / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  }
  px(i: number): number {
    return this.dates.length > 1 ? this.L + i * this.step : this.L + this.step / 2;
  }
  private py(v: number): number {
    return this.T + (1 - v / this.stackMax) * (this.H - this.T - this.B);
  }
  get ticks() {
    return [0, 0.5, 1].map((f) => ({ v: Math.round(this.stackMax * f), y: this.py(this.stackMax * f) }));
  }
  get xLabels() {
    const n = this.dates.length;
    const every = Math.max(1, Math.ceil(n / 7));
    return this.dates.map((d, i) => ({ i, x: this.px(i), text: this.fmt(d) })).filter((x) => (n - 1 - x.i) % every === 0);
  }
  get areas() {
    const n = this.dates.length;
    const base = new Array(n).fill(0);
    return this.series.map((s) => {
      const lower = [...base];
      const upper = s.values.slice(0, n).map((v, i) => (base[i] += v));
      while (upper.length < n) upper.push(base[upper.length]);
      const top = upper.map((v, i) => `${this.px(i).toFixed(1)},${this.py(v).toFixed(1)}`);
      const bottom = lower.map((v, i) => `${this.px(i).toFixed(1)},${this.py(v).toFixed(1)}`).reverse();
      return { name: s.name, color: s.color, line: n ? 'M' + top.join('L') : '', fill: n ? 'M' + top.join('L') + 'L' + bottom.join('L') + 'Z' : '' };
    });
  }
  fmt = fmtDate;
}

/** Vertical columns with value labels; `highlight` picks the tallest. */
@Component({
  selector: 'app-columns',
  standalone: true,
  template: `
    <div class="cols" role="img" [attr.aria-label]="label + ': ' + summary">
      @for (c of items; track c.label) {
        <div class="col" [title]="c.label + ': ' + c.value + (c.extra ? ' · ' + c.extra : '')">
          <span class="val">{{ c.value }}</span>
          <span class="bar" [class.top]="c.value === max && max > 0" [style.height.%]="max ? (c.value / max) * 100 : 0"></span>
          <span class="lab">{{ c.label }}</span>
        </div>
      }
    </div>
  `,
  styles: `
    .cols { display: flex; align-items: flex-end; gap: .4rem; height: 150px; }
    .col { flex: 1; min-width: 0; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: stretch; text-align: center; }
    .bar { display: block; background: color-mix(in srgb, var(--link) 45%, transparent); border-radius: .25rem .25rem 0 0; min-height: 2px; transition: height .3s; }
    .bar.top { background: var(--link); }
    .val { font-size: .7rem; color: var(--text-muted); margin-bottom: .15rem; }
    .lab { font-size: .7rem; color: var(--text-muted); margin-top: .25rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  `,
})
export class ColumnsComponent {
  @Input() items: { label: string; value: number; extra?: string }[] = [];
  @Input() label = 'Chart';
  get max() {
    return Math.max(0, ...this.items.map((i) => i.value));
  }
  get summary() {
    return this.items.map((i) => `${i.label} ${i.value}`).join(', ');
  }
}

/** Donut with a centre figure and a legend. */
@Component({
  selector: 'app-donut',
  standalone: true,
  template: `
    <div class="d">
      <svg viewBox="0 0 120 120" class="ring" role="img" [attr.aria-label]="label + ': ' + summary">
        <circle cx="60" cy="60" r="46" fill="none" stroke="var(--surface-2)" stroke-width="16" />
        @for (s of arcs; track s.label) {
          <circle cx="60" cy="60" r="46" fill="none" [attr.stroke]="s.color" stroke-width="16" [attr.stroke-dasharray]="s.dash" [attr.stroke-dashoffset]="s.offset" transform="rotate(-90 60 60)" />
        }
        <text x="60" y="58" text-anchor="middle" class="big">{{ centre ?? total }}</text>
        <text x="60" y="73" text-anchor="middle" class="small">{{ centreLabel }}</text>
      </svg>
      <ul class="leg">
        @for (s of arcs; track s.label) {
          <li><span class="dot" [style.background]="s.color"></span>{{ s.label }} <strong>{{ s.value }}</strong></li>
        }
      </ul>
    </div>
  `,
  styles: `
    .d { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
    .ring { width: 130px; height: 130px; flex: none; }
    .big { font-size: 22px; font-weight: 700; fill: var(--text); }
    .small { font-size: 9px; fill: var(--text-muted); }
    .leg { list-style: none; margin: 0; padding: 0; font-size: .8rem; color: var(--text); display: grid; gap: .25rem; }
    .dot { display: inline-block; width: .6rem; height: .6rem; border-radius: 50%; margin-right: .4rem; }
    strong { margin-left: .25rem; }
  `,
})
export class DonutComponent {
  @Input() segments: { label: string; value: number; color?: string }[] = [];
  @Input() label = 'Breakdown';
  @Input() centre?: string | number;
  @Input() centreLabel = '';
  private readonly C = 2 * Math.PI * 46;
  get total() {
    return this.segments.reduce((a, s) => a + s.value, 0);
  }
  get summary() {
    return this.segments.map((s) => `${s.label} ${s.value}`).join(', ');
  }
  get arcs() {
    const total = this.total || 1;
    let acc = 0;
    return this.segments
      .filter((s) => s.value > 0)
      .map((s, i) => {
        const len = (s.value / total) * this.C;
        const arc = { label: s.label, value: s.value, color: s.color ?? SERIES[i % SERIES.length], dash: `${Math.max(0, len - 1.5)} ${this.C}`, offset: -acc };
        acc += len;
        return arc;
      });
  }
}

/** Horizontal bar list; labels may link to a page. */
@Component({
  selector: 'app-hbars',
  standalone: true,
  imports: [RouterLink, DecimalPipe],
  template: `
    @if (!items.length) {
      <p class="empty">{{ empty }}</p>
    } @else {
      <ol class="hb" [attr.aria-label]="label">
        @for (it of items; track it.label; let i = $index) {
          <li>
            <div class="line">
              <span class="name">
                @if (it.link) { <a [routerLink]="it.link" target="_blank" rel="noopener" [title]="it.label">{{ it.label }}</a> }
                @else { <span [title]="it.label">{{ it.label }}</span> }
              </span>
              <span class="num">{{ it.value | number }}@if (unit) { <small> {{ unit }}</small> }</span>
            </div>
            <div class="track"><div class="fill" [style.width.%]="max ? (it.value / max) * 100 : 0" [style.background]="color"></div></div>
            @if (it.sub) { <div class="sub">{{ it.sub }}</div> }
          </li>
        }
      </ol>
    }
  `,
  styles: `
    .hb { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: .6rem; }
    .hb li { min-width: 0; }
    .line { display: flex; justify-content: space-between; gap: .75rem; font-size: .85rem; color: var(--text); }
    .name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .name a { color: var(--link); text-decoration: none; }
    .name a:hover { text-decoration: underline; }
    .num { font-variant-numeric: tabular-nums; font-weight: 600; flex: none; }
    .num small { font-weight: 400; color: var(--text-muted); }
    .track { height: .4rem; background: var(--surface-2); border-radius: 1rem; margin-top: .2rem; overflow: hidden; }
    .fill { height: 100%; border-radius: 1rem; transition: width .4s; }
    .sub { font-size: .7rem; color: var(--text-muted); margin-top: .1rem; }
    .empty { color: var(--text-muted); font-size: .85rem; margin: 0; }
  `,
})
export class HBarsComponent {
  @Input() items: Bar[] = [];
  @Input() color = 'var(--link)';
  @Input() unit = '';
  @Input() label = 'Ranking';
  @Input() empty = 'Nothing to show yet.';
  get max() {
    return Math.max(0, ...this.items.map((i) => i.value));
  }
}

/** Circular score gauge. */
@Component({
  selector: 'app-score-ring',
  standalone: true,
  template: `
    <svg viewBox="0 0 120 120" class="ring" role="img" [attr.aria-label]="label + ' ' + value + ' out of 100'">
      <circle cx="60" cy="60" r="50" fill="none" stroke="var(--surface-2)" stroke-width="12" />
      <circle cx="60" cy="60" r="50" fill="none" [attr.stroke]="color" stroke-width="12" stroke-linecap="round" [attr.stroke-dasharray]="dash" transform="rotate(-90 60 60)" />
      <text x="60" y="66" text-anchor="middle" class="big">{{ value }}</text>
    </svg>
  `,
  styles: `
    .ring { width: 120px; height: 120px; }
    .big { font-size: 30px; font-weight: 700; fill: var(--text); }
  `,
})
export class ScoreRingComponent {
  @Input() value = 0;
  @Input() label = 'Score';
  get color() {
    return this.value >= 80 ? 'var(--success-600)' : this.value >= 55 ? 'var(--warning-600)' : 'var(--error-600)';
  }
  get dash() {
    const c = 2 * Math.PI * 50;
    return `${(this.value / 100) * c} ${c}`;
  }
}
