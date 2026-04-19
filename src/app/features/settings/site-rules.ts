import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { SiteRuleService, SiteRule } from '../../core/services/site-rule.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { EmployeeService } from '../../core/services/employee.service';
import { SettingsService } from '../../core/services/settings.service';
import { ActivatedRoute } from '@angular/router';
import { ToastService } from '../../core/services/toast.service';
import { fadeIn, staggerFadeIn, scaleIn, slideInUp } from '../../shared/animations';
import { AppSelect, SelectOption } from '../../shared/components/select/select';

@Component({
  selector: 'app-site-rules',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, AppSelect],
  templateUrl: './site-rules.html',
  styleUrl: './site-rules.scss',
  animations: [fadeIn, staggerFadeIn, scaleIn, slideInUp]
})
export class SiteRules implements OnInit, OnDestroy {
  private readonly siteRuleService = inject(SiteRuleService);
  private readonly confirmService = inject(ConfirmService);
  private readonly employeeService = inject(EmployeeService);
  private readonly settingsService = inject(SettingsService);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  readonly ruleForm = this.fb.group({
    displayName: ['', [Validators.required]],
    keywords: ['', [Validators.required]],
    category: ['productive', [Validators.required]],
    teamId: ['']
  });

  readonly rules = this.siteRuleService.rules;
  readonly rulesLoading = this.siteRuleService.loading;
  readonly availableTeams = signal<string[]>([]);
  
  readonly teamOptions = computed<SelectOption[]>(() => {
    const list: SelectOption[] = [{ label: 'Global (all teams)', value: '' }];
    this.availableTeams().forEach(t => list.push({ label: t, value: t }));
    return list;
  });

  readonly categoryOptions: SelectOption[] = [
    { label: 'Productive', value: 'productive' },
    { label: 'Unproductive', value: 'unproductive' },
    { label: 'Neutral', value: 'neutral' },
  ];

  async ngOnInit() {
    // Start the Firestore listener only when this admin page mounts
    this.siteRuleService.init();

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
  }

  ngOnDestroy() {
    this.settingsService.setPrimaryAction(null);
    // Stop the Firestore listener when leaving this page
    this.siteRuleService.destroy();
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
      this.toast.show('Default rules imported', 'success');
    } catch (e) {
      this.toast.show('Failed to import defaults', 'error');
    } finally {
      this.isSeeding.set(false);
    }
  }

  startEdit(rule: SiteRule) {
    if (!rule.id) return;
    this.editingRuleId.set(rule.id);
    this.ruleForm.patchValue({
      displayName: rule.displayName,
      keywords: rule.keywords.join(', '),
      category: rule.category,
      teamId: rule.teamId ?? ''
    });
    this.showForm.set(true);
    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelEdit() {
    this.editingRuleId.set(null);
    this.ruleForm.reset({
      category: 'productive',
      teamId: ''
    });
    this.showForm.set(false);
  }

  async saveRule() {
    if (this.ruleForm.invalid) return;

    const { displayName, keywords: kwStr, category, teamId } = this.ruleForm.getRawValue();
    const keywords = kwStr!.split(',').map(k => k.trim()).filter(Boolean);

    try {
      if (this.editingRuleId()) {
        await this.siteRuleService.updateRule(this.editingRuleId()!, {
          displayName: displayName!,
          keywords,
          category: category as any,
          teamId: teamId || undefined
        });
        this.toast.show('Rule updated successfully', 'success');
      } else {
        const newRule: any = {
          displayName: displayName!,
          keywords,
          category: category as any
        };
        if (teamId) {
          newRule.teamId = teamId;
        }
        await this.siteRuleService.addRule(newRule);
        this.toast.show('Rule added successfully', 'success');
      }

      this.cancelEdit();
    } catch (e) {
      this.toast.show('Failed to save rule', 'error');
    }
  }

  async deleteRule(id: string | undefined) {
    if (!id) return;
    this.confirmService.confirm({
      title: 'Delete Site Rule?',
      message: 'This site will no longer be categorized for your team. Are you sure?',
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          await this.siteRuleService.deleteRule(id);
          this.toast.show('Rule deleted', 'success');
        } catch (e) {
          this.toast.show('Failed to delete rule', 'error');
        }
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
}
