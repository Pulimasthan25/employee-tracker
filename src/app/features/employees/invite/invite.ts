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
  password = '';
  displayName = '';
  teamId = '';
  intervalSeconds = 1800;
  role: 'admin' | 'employee' = 'employee';

  readonly intervalOptions = [
    { label: '1 minute',    value: 60   },
    { label: '5 minutes',   value: 300  },
    { label: '15 minutes',  value: 900  },
    { label: '30 minutes',  value: 1800 },
    { label: '1 hour',      value: 3600 },
    { label: 'Disabled',    value: 0   },
  ];

  readonly roleOptions = [
    { label: 'Admin', value: 'admin' as const },
    { label: 'Employee', value: 'employee' as const },
  ];

  async submit(): Promise<void> {
    const email = this.email.trim();
    const displayName = this.displayName.trim();
    const password = this.password.trim();
    if (!email || !displayName || !password) {
      this.error.set('Email, password, and display name are required.');
      return;
    }
    this.error.set(null);
    this.submitting.set(true);
    try {
      await this.employeeService.inviteEmployee({
        email,
        displayName,
        teamId: this.teamId.trim() || undefined,
        screenshotIntervalSeconds: this.intervalSeconds,
        role: this.role,
        password,
      });
      this.success.set(true);
      setTimeout(() => this.router.navigate(['/employees']), 1500);
    } catch (e) {
      this.error.set('Failed to invite. Please try again.');
      this.submitting.set(false);
    }
  }
}
