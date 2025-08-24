import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-accessibility',
  imports: [CommonModule, RouterLink],
  templateUrl: './accessibility.component.html',
  styleUrl: './accessibility.component.scss',
})
export class AccessibilityComponent {}
