import { CommonModule } from '@angular/common';
import { Component, HostListener } from '@angular/core';
import { RouterLink, RouterModule } from '@angular/router';

@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterModule, CommonModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent {
  isNavbarCollapsed = true;
  isDropdownOpen = false;

  // Close navbar when clicking navigation links (mobile)
  closeNavbar() {
    this.isNavbarCollapsed = true;
    this.isDropdownOpen = false;
  }

  // Toggle dropdown (mobile-friendly)
  toggleDropdown() {
    this.isDropdownOpen = !this.isDropdownOpen;
  }

  // Check if on desktop (for hover behavior)
  onDesktop(): boolean {
    return window.innerWidth >= 992;
  }

  // Close mobile menu when clicking outside
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    const target = event.target as HTMLElement;
    const navbar = target.closest('.navbar');

    // If click is outside navbar, close mobile menu
    if (!navbar && !this.isNavbarCollapsed) {
      this.isNavbarCollapsed = true;
    }
  }

  // Close dropdown when clicking outside
  @HostListener('document:click', ['$event'])
  onDropdownClick(event: Event) {
    const target = event.target as HTMLElement;
    const dropdown = target.closest('.dropdown');

    // If click is outside dropdown, close it
    if (!dropdown && this.isDropdownOpen) {
      this.isDropdownOpen = false;
    }
  }
}
