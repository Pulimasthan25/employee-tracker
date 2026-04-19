import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SiteRuleService, SiteRule } from '../../core/services/site-rule.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { EmployeeService } from '../../core/services/employee.service';
import { SettingsService } from '../../core/services/settings.service';
import { AuthService } from '../../core/services/auth.service';
import { WebAuthnService, StoredCredential } from '../../core/services/webauthn.service';
import { ActivatedRoute } from '@angular/router';
import { fadeIn, staggerFadeIn, scaleIn, slideInUp } from '../../shared/animations';
import { afterNextRender } from '@angular/core';

@Component({
  selector: 'app-productivity-rules',
  imports: [CommonModule, FormsModule],
  templateUrl: './productivity-rules.html',
  styleUrl: './productivity-rules.scss',
  animations: [fadeIn, staggerFadeIn, scaleIn, slideInUp]
})
export class ProductivityRules implements OnInit, OnDestroy {
  private readonly siteRuleService = inject(SiteRuleService);
  private readonly confirmService = inject(ConfirmService);
  private readonly employeeService = inject(EmployeeService);
  private readonly settingsService = inject(SettingsService);
  private readonly auth = inject(AuthService);
  private readonly webauthn = inject(WebAuthnService);
  private readonly route = inject(ActivatedRoute);

  readonly rules = this.siteRuleService.rules;
  readonly rulesLoading = this.siteRuleService.loading;
  readonly availableTeams = signal<string[]>([]);

  async ngOnInit() {
    this.settingsService.setPrimaryAction({
      label: 'Add Rule',
      icon: 'plus',
      callback: () => this.toggleForm()
    });

    // Bypass the 5-min cache so we always see the latest teams.
    this.employeeService.invalidateCache();
    const employees = await this.employeeService.getAll();
    const teams = new Set<string>();
    employees.forEach(e => {
      if (e.teamId) teams.add(e.teamId);
    });
    this.availableTeams.set(Array.from(teams).sort());

    // Load WebAuthn credentials
    this.loadCredentials();

    // Check for scroll to security
    this.route.queryParams.subscribe(params => {
      if (params['section'] === 'security') {
        this.scrollToSecurity.set(true);
      }
    });

    afterNextRender(() => {
      if (this.scrollToSecurity()) {
        const el = document.getElementById('security-section');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }

  ngOnDestroy() {
    this.settingsService.setPrimaryAction(null);
  }

  // Show/Hide Form
  showForm = signal(false);

  // Sort options
  sortBy = signal<'name' | 'category'>('name');
  sortDirection = signal<'asc' | 'desc'>('asc');

  // Computed sorted rules
  readonly sortedRules = computed(() => {
    const list = [...this.rules()];
    const sortVal = this.sortBy();
    const direction = this.sortDirection();

    return list.sort((a, b) => {
      let comparison = 0;
      if (sortVal === 'name') {
        comparison = a.displayName.localeCompare(b.displayName);
      } else if (sortVal === 'category') {
        comparison = a.category.localeCompare(b.category);
      }

      return direction === 'asc' ? comparison : -comparison;
    });
  });

  setSort(val: 'name' | 'category') {
    if (this.sortBy() === val) {
      this.sortDirection.update(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortBy.set(val);
      this.sortDirection.set('asc');
    }
  }

  // Form fields
  newDisplayName = signal('');
  newKeywords = signal('');
  newCategory = signal<'productive' | 'unproductive' | 'neutral'>('productive');
  newTeamId = signal('');

  isSeeding = signal(false);
  editingRuleId = signal<string | null>(null);

  toggleForm() {
    if (this.showForm()) {
      this.cancelEdit();
    } else {
      this.showForm.set(true);
    }
  }

  async importDefaults() {
    this.isSeeding.set(true);
    try {
      await this.siteRuleService.seedDefaultRules();
    } finally {
      this.isSeeding.set(false);
    }
  }

  startEdit(rule: SiteRule) {
    if (!rule.id) return;
    this.editingRuleId.set(rule.id);
    this.newDisplayName.set(rule.displayName);
    this.newKeywords.set(rule.keywords.join(', '));
    this.newCategory.set(rule.category);
    this.newTeamId.set(rule.teamId ?? '');
    this.showForm.set(true);
    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelEdit() {
    this.editingRuleId.set(null);
    this.newDisplayName.set('');
    this.newKeywords.set('');
    this.newCategory.set('productive');
    this.newTeamId.set('');
    this.showForm.set(false);
  }

  async saveRule() {
    const displayName = this.newDisplayName().trim();
    const keywords = this.newKeywords().split(',').map(k => k.trim()).filter(Boolean);

    if (!displayName || keywords.length === 0) return;

    const teamIdValue = this.newTeamId();

    if (this.editingRuleId()) {
      await this.siteRuleService.updateRule(this.editingRuleId()!, {
        displayName,
        keywords,
        category: this.newCategory(),
        teamId: teamIdValue || undefined
      });
      this.editingRuleId.set(null);
    } else {
      const newRule: any = {
        displayName,
        keywords,
        category: this.newCategory()
      };
      if (teamIdValue) {
        newRule.teamId = teamIdValue;
      }
      await this.siteRuleService.addRule(newRule);
    }

    // Reset form
    this.newDisplayName.set('');
    this.newKeywords.set('');
    this.newCategory.set('productive');
    this.newTeamId.set('');
    this.showForm.set(false);
  }

  async deleteRule(id: string | undefined) {
    if (!id) return;
    this.confirmService.confirm({
      title: 'Delete Site Rule?',
      message: 'This site will no longer be categorized for your team. Are you sure?',
      confirmText: 'Delete',
      onConfirm: async () => {
        await this.siteRuleService.deleteRule(id);
      }
    });
  }

  getCategoryClass(category: string): string {
    switch (category) {
      case 'productive': return 'badge--success';
      case 'unproductive': return 'badge--danger';
      default: return 'badge--info';
    }
  }

  getTeamHue(team: string | undefined): number {
    if (!team) return 0;
    const professionalHues = [210, 225, 190, 170, 200, 215, 235, 180, 160, 205];
    let hash = 0;
    for (let i = 0; i < team.length; i++) {
        hash = team.charCodeAt(i) + ((hash << 5) - hash);
    }
    return professionalHues[Math.abs(hash) % professionalHues.length];
  }

  // WebAuthn Security Section
  credentials = signal<StoredCredential[]>([]);
  credentialsLoading = signal<boolean>(false);
  registerLoading = signal<boolean>(false);
  registerError = signal<string | null>(null);
  deleteLoadingId = signal<string | null>(null);
  scrollToSecurity = signal<boolean>(false);

  async loadCredentials() {
    this.credentialsLoading.set(true);
    const uid = this.auth.firebaseUser()?.uid;
    if (!uid || !this.auth.isAdmin()) {
      this.credentialsLoading.set(false);
      return;
    }
    const creds = await this.webauthn.getStoredCredentials(uid);
    this.credentials.set(creds);
    this.credentialsLoading.set(false);
  }

  async onAddPasskey() {
    this.registerLoading.set(true);
    this.registerError.set(null);
    const uid = this.auth.firebaseUser()?.uid;
    const email = this.auth.firebaseUser()?.email;
    
    if (!uid || !email) {
      this.registerError.set('User session not found');
      this.registerLoading.set(false);
      return;
    }

    try {
      await this.webauthn.registerPasskey(uid, email);
      await this.loadCredentials();
    } catch (e: any) {
      this.registerError.set(e.message || 'Registration failed');
    } finally {
      this.registerLoading.set(false);
    }
  }

  async onDeleteCredential(credentialId: string) {
    this.deleteLoadingId.set(credentialId);
    const uid = this.auth.firebaseUser()?.uid;
    if (!uid) return;

    try {
      await this.webauthn.deleteCredential(uid, credentialId);
      await this.loadCredentials();
    } finally {
      this.deleteLoadingId.set(null);
    }
  }
}
