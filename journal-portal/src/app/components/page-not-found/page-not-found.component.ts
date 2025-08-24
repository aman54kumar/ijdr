import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-page-not-found',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './page-not-found.component.html',
  styleUrls: ['./page-not-found.component.scss'],
})
export class PageNotFoundComponent {
  searchQuery: string = '';

  constructor(private router: Router) {}

  performSearch(): void {
    if (this.searchQuery.trim()) {
      // Navigate to journals page with search query
      this.router.navigate(['/journals'], {
        queryParams: { search: this.searchQuery.trim() },
      });
    }
  }
}
