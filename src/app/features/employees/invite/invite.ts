import {
  Component,
  inject,
  signal,
  ChangeDetectionStrategy,
  OnInit,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { EmployeeService } from '../../../core/services/employee.service';
import { AppSelect, SelectOption } from '../../../shared/components/select/select';
import { computed } from '@angular/core';

@Component({
  selector: 'app-invite',
  imports: [RouterLink, FormsModule, ReactiveFormsModule, AppSelect],
  templateUrl: './invite.html',
  styleUrl: './invite.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Invite implements OnInit {
  private readonly employeeService = inject(EmployeeService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  
  readonly inviteForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    displayName: ['', [Validators.required]],
    teamId: [''],
    intervalSeconds: [1800],
    role: ['employee', [Validators.required]]
  });

  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal(false);
  readonly downloadUrl = signal<string | null>(null);
  readonly linkCopied = signal(false);
  readonly availableTeams = signal<string[]>([]);
  readonly teamOptions = computed<SelectOption[]>(() => {
    const list: SelectOption[] = [{ label: 'No team (global)', value: '' }];
    this.availableTeams().forEach(t => list.push({ label: t, value: t }));
    return list;
  });

  ngOnInit() {
    this.fetchLatestRelease();
    this.loadTeams();
  }

  private async loadTeams() {
    try {
      this.employeeService.invalidateCache();
      const employees = await this.employeeService.getAll();
      const teams = new Set<string>();
      employees.forEach(e => { if (e.teamId) teams.add(e.teamId); });
      this.availableTeams.set(Array.from(teams).sort());
    } catch {
      // Non-critical — just won't show suggestions
    }
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

  triggerDownload() {
    const url = this.downloadUrl();
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'PulseAgent.exe');
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  readonly intervalOptions = [
    { label: '1 minute',    value: 60   },
    { label: '5 minutes',   value: 300  },
    { label: '15 minutes',  value: 900  },
    { label: '30 minutes',  value: 1800 },
    { label: '1 hour',      value: 3600 },
    { label: 'Disabled',    value: 0   },
  ];

  readonly roleOptions = [
    { label: 'Admin', value: 'admin' },
    { label: 'Employee', value: 'employee' },
  ];

  async submit(): Promise<void> {
    if (this.inviteForm.invalid) {
      this.error.set('Please fill all required fields correctly.');
      this.inviteForm.markAllAsTouched();
      return;
    }

    this.error.set(null);
    this.submitting.set(true);
    
    const { email, displayName, password, teamId, intervalSeconds, role } = this.inviteForm.getRawValue();
    
    try {
      await this.employeeService.inviteEmployee({
        email: email!,
        displayName: displayName!,
        teamId: teamId?.trim() || undefined,
        screenshotIntervalSeconds: Number(intervalSeconds),
        role: role as 'admin'|'employee',
        password: password!,
      });
      this.success.set(true);
    } catch (e: any) {
      this.error.set(e.message || 'Failed to invite. Please try again.');
      this.submitting.set(false);
    }
  }
}
