import { CommonModule } from '@angular/common';
import { Component, HostListener, inject } from '@angular/core';
import { ThemeService } from '../../../services/theme.service';
import { SearchService } from '../../../services/search.service';
import { RouterLink, RouterModule } from '@angular/router';

@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterModule, CommonModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent {
  readonly theme = inject(ThemeService);
  readonly search = inject(SearchService);
  private collapsed = true;

  get isNavbarCollapsed(): boolean {
    return this.collapsed;
  }

  set isNavbarCollapsed(value: boolean) {
    this.collapsed = value;
    // Lock page scroll behind the full-screen menu
    document.body.style.overflow = value ? '' : 'hidden';
  }
  scrolled = false;
  isDropdownOpen = false;
  isMobileAboutOpen = false;

  readonly aboutLinks = [
    { path: '/about', label: 'About IJDR' },
    { path: '/editorial-board', label: 'Editorial Board' },
    { path: '/advisory-board', label: 'Advisory Board' },
    { path: '/publisher', label: 'Publisher' },
  ];

  @HostListener('window:scroll')
  onScroll() {
    this.scrolled = window.scrollY > 8;
  }

  // Back to the desktop layout: make sure the overlay (and scroll lock) is gone
  @HostListener('window:resize')
  onResize() {
    if (window.innerWidth >= 992 && !this.isNavbarCollapsed) {
      this.closeNavbar();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.closeNavbar();
  }

  // Close navbar when clicking navigation links (mobile)
  closeNavbar() {
    this.isNavbarCollapsed = true;
    this.isDropdownOpen = false;
    this.isMobileAboutOpen = false;
  }

  // Toggle dropdown (mobile-friendly)
  toggleDropdown() {
    this.isDropdownOpen = !this.isDropdownOpen;
  }

  // Close mobile menu when clicking outside
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    const target = event.target as HTMLElement;
    const navbar = target.closest('.modern-header');

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
