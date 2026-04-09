import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent implements OnInit {
  loginForm: FormGroup;

  isLoading = false;
  errorMessage = '';
  successMessage = '';

  // Hide password visibility
  showPassword = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
    });
  }

  async ngOnInit() {
    if (this.route.snapshot.queryParamMap.get('denied') === '1') {
      this.errorMessage =
        'Your account is not authorized for admin access. Ask a project owner to grant the admin custom claim.';
    }
    const user = await this.authService.waitForAuth();
    if (user && (await this.authService.hasAdminClaim())) {
      this.router.navigate(['/admin']);
    }
  }

  /**
   * Handle login form submission
   */
  async onLogin() {
    if (this.loginForm.valid) {
      this.isLoading = true;
      this.errorMessage = '';

      try {
        const { email, password } = this.loginForm.value;
        const success = await this.authService.signIn(email, password);

        if (success) {
          const isAdmin = await this.authService.hasAdminClaim();
          if (!isAdmin) {
            await this.authService.signOut();
            this.errorMessage =
              'This account does not have admin access. The admin custom claim must be set in Firebase (see project scripts).';
            return;
          }
          this.successMessage = 'Login successful! Redirecting...';
          setTimeout(() => {
            this.router.navigate(['/admin']);
          }, 600);
        }
      } catch (error) {
        this.errorMessage = error as string;
      } finally {
        this.isLoading = false;
      }
    } else {
      this.markFormGroupTouched(this.loginForm);
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
  getFieldError(formGroup: FormGroup, fieldName: string): string {
    const field = formGroup.get(fieldName);

    if (field?.errors && field.touched) {
      if (field.errors['required']) return `${fieldName} is required`;
      if (field.errors['email']) return 'Please enter a valid email address';
      if (field.errors['minlength'])
        return `${fieldName} must be at least ${field.errors['minlength'].requiredLength} characters`;
    }

    return '';
  }

  /**
   * Check if field has error
   */
  hasFieldError(formGroup: FormGroup, fieldName: string): boolean {
    const field = formGroup.get(fieldName);
    return !!(field?.errors && field.touched);
  }
}
