import { Injectable } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { defaultAdminConfig } from '../../environments/firebase-config';

@Injectable({
  providedIn: 'root',
})
export class AdminSetupService {
  constructor(private authService: AuthService) {}

  /**
   * Initialize default admin account
   * Call this method once to set up the default admin
   */
  async initializeDefaultAdmin(): Promise<boolean> {
    try {
      console.log('Setting up default admin account...');

      const success = await this.authService.createAdminUser(
        defaultAdminConfig.email,
        defaultAdminConfig.password,
        defaultAdminConfig.displayName
      );

      if (success) {
        console.log('✅ Default admin account created successfully!');
        console.log(`📧 Email: ${defaultAdminConfig.email}`);
        console.log(`🔑 Password: ${defaultAdminConfig.password}`);
        console.log(
          '⚠️  Please change the default password after first login!'
        );
        return true;
      } else {
        console.error('❌ Failed to create default admin account');
        return false;
      }
    } catch (error: any) {
      if (error.includes('email-already-in-use')) {
        console.log('ℹ️  Default admin account already exists');
        console.log(`📧 Email: ${defaultAdminConfig.email}`);
        console.log(`🔑 Password: ${defaultAdminConfig.password}`);
        return true;
      } else {
        console.error('❌ Error setting up default admin:', error);
        return false;
      }
    }
  }

  /**
   * Get default admin credentials for reference
   */
  getDefaultAdminCredentials() {
    return {
      email: defaultAdminConfig.email,
      password: defaultAdminConfig.password,
      displayName: defaultAdminConfig.displayName,
    };
  }

  /**
   * Check if current user is the default admin
   */
  isDefaultAdmin(): boolean {
    const currentUser = this.authService.getCurrentUser();
    return currentUser?.email === defaultAdminConfig.email;
  }
}
