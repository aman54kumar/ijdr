import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-open-access',
  imports: [CommonModule, RouterLink],
  templateUrl: './open-access.component.html',
  styleUrl: './open-access.component.scss',
})
export class OpenAccessComponent {}
