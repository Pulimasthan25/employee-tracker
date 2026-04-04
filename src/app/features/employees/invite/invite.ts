import {
  Component,
  inject,
  signal,
  ChangeDetectionStrategy,
  OnInit,
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
export class Invite implements OnInit {
  private readonly employeeService = inject(EmployeeService);
  private readonly router = inject(Router);

  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal(false);
  readonly downloadUrl = signal<string | null>(null);
  readonly linkCopied = signal(false);

  ngOnInit() {
    this.fetchLatestRelease();
  }

  async fetchLatestRelease() {
    try {
      const response = await fetch('https://api.github.com/repos/masthan-pm/pulsetrack-agent-releases/releases/latest');
      if (response.ok) {
        const data = await response.json();
        const asset = data.assets?.find((a: any) => a.name.endsWith('.exe'));
        if (asset) {
          this.downloadUrl.set(asset.browser_download_url);
          return;
        }
      }
    } catch (e) {
      console.error('Failed to fetch latest release', e);
    }
    // Fallback link if API fails or no exe found
    this.downloadUrl.set('https://github.com/masthan-pm/pulsetrack-agent-releases/releases/latest');
  }

  async copyLink() {
    const url = this.downloadUrl();
    if (url) {
      try {
        await navigator.clipboard.writeText(url);
        this.linkCopied.set(true);
        setTimeout(() => this.linkCopied.set(false), 2000);
      } catch (err) {
        console.error('Failed to copy text: ', err);
      }
    }
  }

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
    } catch (e) {
      this.error.set('Failed to invite. Please try again.');
      this.submitting.set(false);
    }
  }
}
