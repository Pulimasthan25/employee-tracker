import {
  Component,
  inject,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { EmployeeService } from '../../../core/services/employee.service';

@Component({
  selector: 'app-invite',
  imports: [RouterLink, FormsModule],
  templateUrl: './invite.html',
  styleUrl: './invite.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Invite {
  private readonly employeeService = inject(EmployeeService);
  private readonly router = inject(Router);

  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal(false);

  email = '';
  displayName = '';
  teamId = '';

  async submit(): Promise<void> {
    const email = this.email.trim();
    const displayName = this.displayName.trim();
    if (!email || !displayName) {
      this.error.set('Email and display name are required.');
      return;
    }
    this.error.set(null);
    this.submitting.set(true);
    try {
      await this.employeeService.inviteEmployee({
        email,
        displayName,
        teamId: this.teamId.trim() || undefined,
      });
      this.success.set(true);
      setTimeout(() => this.router.navigate(['/employees']), 1500);
    } catch (e) {
      this.error.set('Failed to invite. Please try again.');
      this.submitting.set(false);
    }
  }
}
