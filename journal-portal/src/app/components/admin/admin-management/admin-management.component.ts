import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-admin-management',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './admin-management.component.html',
  styleUrls: ['./admin-management.component.scss'],
})
export class AdminManagementComponent {
  createAdminForm: FormGroup;
  changePasswordForm: FormGroup;

  isLoading = false;
  errorMessage = '';
  successMessage = '';
  showCreateForm = false;
  showPassword = false;
  showChangePasswordForm = false;
  showCurrentPassword = false;
  showNewPassword = false;

  constructor(private fb: FormBuilder, private authService: AuthService) {
    this.createAdminForm = this.fb.group(
      {
        displayName: ['', [Validators.required, Validators.minLength(2)]],
        email: ['', [Validators.required, Validators.email]],
        password: ['', [Validators.required, Validators.minLength(6)]],
        confirmPassword: ['', [Validators.required]],
      },
      { validators: this.passwordMatchValidator }
    );

    this.changePasswordForm = this.fb.group(
      {
        currentPassword: ['', [Validators.required]],
        newPassword: ['', [Validators.required, Validators.minLength(6)]],
        confirmNewPassword: ['', [Validators.required]],
      },
      { validators: this.newPasswordMatchValidator }
    );
  }

  /**
   * Custom validator to check if passwords match
   */
  passwordMatchValidator(form: FormGroup) {
    const password = form.get('password');
    const confirmPassword = form.get('confirmPassword');

    if (
      password &&
      confirmPassword &&
      password.value !== confirmPassword.value
    ) {
      confirmPassword.setErrors({ passwordMismatch: true });
      return { passwordMismatch: true };
    }

    return null;
  }

  /**
   * Handle create admin form submission
   */
  async onCreateAdmin() {
    if (this.createAdminForm.valid) {
      this.isLoading = true;
      this.errorMessage = '';

      try {
        const { displayName, email, password } = this.createAdminForm.value;
        const success = await this.authService.createAdminUser(
          email,
          password,
          displayName
        );

        if (success) {
          this.successMessage = 'Admin account created successfully!';
          this.createAdminForm.reset();
          this.showCreateForm = false;
        }
      } catch (error) {
        this.errorMessage = error as string;
      } finally {
        this.isLoading = false;
      }
    } else {
      this.markFormGroupTouched(this.createAdminForm);
    }
  }

  /**
   * Toggle create admin form
   */
  toggleCreateForm() {
    this.showCreateForm = !this.showCreateForm;
    this.errorMessage = '';
    this.successMessage = '';
    if (!this.showCreateForm) {
      this.createAdminForm.reset();
    }
  }

  /**
   * Toggle password visibility
   */
  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  /**
   * Mark all form fields as touched to show validation errors
   */
  private markFormGroupTouched(formGroup: FormGroup) {
    Object.keys(formGroup.controls).forEach((key) => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }

  /**
   * Get form field error message
   */
  getFieldError(fieldName: string): string {
    const field = this.createAdminForm.get(fieldName);

    if (field?.errors && field.touched) {
      if (field.errors['required']) return `${fieldName} is required`;
      if (field.errors['email']) return 'Please enter a valid email address';
      if (field.errors['minlength'])
        return `${fieldName} must be at least ${field.errors['minlength'].requiredLength} characters`;
      if (field.errors['passwordMismatch']) return 'Passwords do not match';
    }

    return '';
  }

  /**
   * Check if field has error
   */
  hasFieldError(fieldName: string): boolean {
    const field =
      this.createAdminForm.get(fieldName) ||
      this.changePasswordForm.get(fieldName);
    return !!(field?.errors && field.touched);
  }

  /**
   * Custom validator for new password confirmation
   */
  newPasswordMatchValidator(form: FormGroup) {
    const newPassword = form.get('newPassword');
    const confirmNewPassword = form.get('confirmNewPassword');

    if (
      newPassword &&
      confirmNewPassword &&
      newPassword.value !== confirmNewPassword.value
    ) {
      return { newPasswordMismatch: true };
    }
    return null;
  }

  /**
   * Toggle current password visibility
   */
  toggleCurrentPasswordVisibility() {
    this.showCurrentPassword = !this.showCurrentPassword;
  }

  /**
   * Toggle new password visibility
   */
  toggleNewPasswordVisibility() {
    this.showNewPassword = !this.showNewPassword;
  }

  /**
   * Toggle change password form visibility
   */
  toggleChangePasswordForm() {
    this.showChangePasswordForm = !this.showChangePasswordForm;
    if (!this.showChangePasswordForm) {
      this.changePasswordForm.reset();
    }
  }

  /**
   * Handle password change
   */
  async onChangePassword() {
    if (this.changePasswordForm.valid) {
      this.isLoading = true;
      this.errorMessage = '';
      this.successMessage = '';

      try {
        const { currentPassword, newPassword } = this.changePasswordForm.value;
        const success = await this.authService.changePassword(
          currentPassword,
          newPassword
        );

        if (success) {
          this.successMessage = 'Password changed successfully!';
          this.changePasswordForm.reset();
          this.showChangePasswordForm = false;
        } else {
          this.errorMessage = 'Failed to change password. Please try again.';
        }
      } catch (error: any) {
        this.errorMessage =
          this.authService.getErrorMessage(error.code) ||
          'An error occurred while changing password.';
        console.error('Error changing password:', error);
      } finally {
        this.isLoading = false;
      }
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordReset() {
    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    try {
      const success = await this.authService.sendPasswordReset(
        'admin@ijdrpub.in'
      );
      if (success) {
        this.successMessage = 'Password reset email sent to admin@ijdrpub.in';
      } else {
        this.errorMessage = 'Failed to send password reset email.';
      }
    } catch (error: any) {
      this.errorMessage =
        'An error occurred while sending password reset email.';
      console.error('Error sending password reset:', error);
    } finally {
      this.isLoading = false;
    }
  }
}
