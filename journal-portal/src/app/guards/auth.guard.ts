import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  constructor(private authService: AuthService, private router: Router) {}

  async canActivate(): Promise<boolean> {
    try {
      // Wait for auth state to initialize
      const user = await this.authService.waitForAuth();

      if (user) {
        return true;
      } else {
        // Redirect to login if not authenticated
        this.router.navigate(['/login']);
        return false;
      }
    } catch (error) {
      console.error('Auth guard error:', error);
      this.router.navigate(['/login']);
      return false;
    }
  }
}
