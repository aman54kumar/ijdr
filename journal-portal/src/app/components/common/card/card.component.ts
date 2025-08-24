import { CommonModule } from '@angular/common';
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { RouterLink } from '@angular/router';

export interface CardAction {
  label: string;
  icon?: string;
  action?: () => void;
  routerLink?: string | any[];
  class?: string;
  disabled?: boolean;
}

export interface CardMeta {
  icon: string;
  text: string;
}

export interface CardStat {
  icon: string;
  label: string;
  value: string | number;
}

@Component({
  selector: 'app-card',
  imports: [CommonModule, RouterLink],
  template: `
    <div class="generic-card" [ngClass]="cardClass" (click)="onCardClick()">
      <!-- Card Header -->
      <div class="card-header" *ngIf="title || showImage">
        <!-- Image Section -->
        <div class="card-image" *ngIf="showImage">
          <div class="image-placeholder" [ngClass]="imageType">
            <i class="placeholder-icon" [ngClass]="defaultImageIcon"></i>
          </div>
          <div class="image-overlay" *ngIf="badge">
            <div class="card-badge">
              <i [ngClass]="badge.icon"></i>
            </div>
          </div>
        </div>

        <!-- Header Content -->
        <div class="header-content" *ngIf="title">
          <h3 class="card-title">{{ title }}</h3>
          <div class="card-meta" *ngIf="meta && meta.length > 0">
            <span class="meta-item" *ngFor="let item of meta">
              <i [ngClass]="item.icon"></i>
              {{ item.text }}
            </span>
          </div>
        </div>
      </div>

      <!-- Card Body -->
      <div class="card-body" *ngIf="content || stats || tags">
        <!-- Main Content -->
        <div class="card-content" *ngIf="content">
          <ng-content></ng-content>
        </div>

        <!-- Stats Section -->
        <div class="card-stats" *ngIf="stats && stats.length > 0">
          <div class="stat-item" *ngFor="let stat of stats">
            <i [ngClass]="stat.icon"></i>
            <span class="stat-value">{{ stat.value }}</span>
            <span class="stat-label">{{ stat.label }}</span>
          </div>
        </div>

        <!-- Tags Section -->
        <div class="card-tags" *ngIf="tags && tags.length > 0">
          <span class="tag" *ngFor="let tag of tags">{{ tag }}</span>
        </div>
      </div>

      <!-- Card Footer -->
      <div class="card-footer" *ngIf="actions && actions.length > 0">
        <div class="card-actions">
          <ng-container *ngFor="let action of actions">
            <!-- Router Link Action -->
            <a
              *ngIf="action.routerLink"
              [routerLink]="action.routerLink"
              class="btn"
              [ngClass]="action.class || 'btn-primary'"
              [class.disabled]="action.disabled"
            >
              <i *ngIf="action.icon" [ngClass]="action.icon" class="me-2"></i>
              {{ action.label }}
            </a>

            <!-- Click Action -->
            <button
              *ngIf="!action.routerLink"
              class="btn"
              [ngClass]="action.class || 'btn-primary'"
              [disabled]="action.disabled"
              (click)="$event.stopPropagation(); action.action?.()"
            >
              <i *ngIf="action.icon" [ngClass]="action.icon" class="me-2"></i>
              {{ action.label }}
            </button>
          </ng-container>
        </div>
      </div>
    </div>
  `,
  styleUrl: './card.component.scss',
})
export class CardComponent {
  @Input() title?: string;
  @Input() content?: string;
  @Input() cardClass?: string;
  @Input() showImage: boolean = false;
  @Input() imageType:
    | 'journal'
    | 'person'
    | 'document'
    | 'library'
    | 'research' = 'journal';
  @Input() imageIcon?: string;
  @Input() badge?: { icon: string };
  @Input() meta?: CardMeta[];
  @Input() stats?: CardStat[];
  @Input() tags?: string[];
  @Input() actions?: CardAction[];
  @Input() clickable: boolean = false;

  @Output() cardClick = new EventEmitter<void>();

  get defaultImageIcon(): string {
    const iconMap = {
      journal: 'bi bi-journal-bookmark',
      person: 'bi bi-person-circle',
      document: 'bi bi-file-earmark-text',
      library: 'bi bi-building',
      research: 'bi bi-graph-up',
    };
    return this.imageIcon || iconMap[this.imageType];
  }

  onCardClick(): void {
    if (this.clickable) {
      this.cardClick.emit();
    }
  }
}
