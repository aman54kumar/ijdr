import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  standalone: true,
  selector: 'app-page-not-found',
  imports: [CommonModule, RouterLink],
  template: `
    <div class="container text-center my-5">
      <h1 class="display-1">404</h1>
      <p class="lead">Page Not Found</p>
      <a routerLink="/" class="btn btn-primary mt-3">Go Back Home</a>
    </div>
  `,
})
export class PageNotFoundComponent {}
