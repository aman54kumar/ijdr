import { Component, Input } from '@angular/core';

/** Minimal inline SVG sparkline with a text alternative. */
@Component({
  selector: 'app-sparkline',
  standalone: true,
  template: `
    <svg [attr.viewBox]="'0 0 ' + w + ' ' + h" class="spark" role="img" [attr.aria-label]="label">
      <polyline [attr.points]="points" fill="none" stroke="var(--link)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      @for (p of dots; track $index) {
        <circle [attr.cx]="p[0]" [attr.cy]="p[1]" r="2.2" fill="var(--link)" />
      }
    </svg>
  `,
  styles: `
    .spark {
      width: 100%;
      height: 48px;
      display: block;
    }
  `,
})
export class SparklineComponent {
  @Input() values: number[] = [];
  @Input() label = 'Trend';
  readonly w = 200;
  readonly h = 48;

  private get coords(): [number, number][] {
    const v = this.values;
    if (!v.length) return [];
    const max = Math.max(...v, 1);
    const step = v.length > 1 ? (this.w - 8) / (v.length - 1) : 0;
    return v.map((x, i) => [4 + i * step, this.h - 6 - (x / max) * (this.h - 12)]);
  }

  get points(): string {
    return this.coords.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  }

  get dots(): [number, number][] {
    const c = this.coords;
    return c.length ? [c[c.length - 1]] : [];
  }
}
