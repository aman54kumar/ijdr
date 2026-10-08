import { Component, Input } from '@angular/core';
import { iJournal } from '../../../type/journals.type';

/**
 * First-page thumbnail of an issue. The box reserves a fixed aspect ratio so
 * images never shift layout; without a cover (or if it fails to load) a branded
 * placeholder shows the volume/number instead.
 */
@Component({
  selector: 'app-issue-cover',
  standalone: true,
  template: `
    <div class="cover" [class.cover--placeholder]="!showImage">
      @if (showImage) {
        <img
          [src]="issue.coverUrl"
          [alt]="'Cover of ' + issue.title"
          width="400"
          height="560"
          [attr.loading]="eager ? 'eager' : 'lazy'"
          [attr.fetchpriority]="eager ? 'high' : null"
          decoding="async"
          (error)="failed = true"
        />
      } @else {
        <img
          class="cover-logo"
          src="assets/images/logos/ijdr-mark.png"
          alt=""
          width="64"
          height="62"
        />
        <span class="cover-vol">Vol {{ issue.volume }}</span>
        <span class="cover-no">No. {{ issue.number }}</span>
        <span class="cover-year">{{ issue.year }}</span>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .cover {
      aspect-ratio: 5 / 7;
      width: 100%;
      border-radius: var(--radius-md);
      overflow: hidden;
      background: var(--surface-2);
      border: 1px solid var(--border);
      box-shadow: var(--shadow-sm);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.15rem;
    }
    .cover img:not(.cover-logo) {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: top center;
      display: block;
      background: #fff;
    }
    .cover-logo {
      width: 28%;
      height: auto;
      margin-bottom: 0.4rem;
      opacity: 0.9;
    }
    .cover-vol {
      font-family: var(--font-family-display);
      font-weight: 700;
      font-size: 1.1em;
      color: var(--brand);
    }
    .cover-no,
    .cover-year {
      font-size: 0.8em;
      color: var(--text-muted);
    }
  `,
})
export class IssueCoverComponent {
  @Input({ required: true }) issue!: Pick<
    iJournal,
    'title' | 'volume' | 'number' | 'year' | 'coverUrl'
  >;
  /** Above-the-fold covers should not be lazy-loaded. */
  @Input() eager = false;
  failed = false;

  get showImage(): boolean {
    return !!this.issue.coverUrl && !this.failed;
  }
}
