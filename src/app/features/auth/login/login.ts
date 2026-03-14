import { Component, signal, inject, ChangeDetectionStrategy } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Login {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly auth = inject(AuthService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = this.fb.group({
    email: this.fb.control('', {
      validators: [Validators.required, Validators.email],
    }),
    password: this.fb.control('', {
      validators: [Validators.required, Validators.minLength(6)],
    }),
  });

  async onSubmit() {
    if (this.form.invalid) return;
    this.error.set(null);
    this.loading.set(true);
    try {
      await this.auth.login(
        this.form.controls.email.value,
        this.form.controls.password.value
      );
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      this.error.set(
        code === 'auth/invalid-credential'
          ? 'Invalid email or password. Please try again.'
          : 'An error occurred. Please try again.'
      );
    } finally {
      this.loading.set(false);
    }
  }
}
