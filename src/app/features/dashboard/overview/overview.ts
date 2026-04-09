import {
  Component,
  inject,
  Injector,
  signal,
  computed,
  effect,
  untracked,
  afterNextRender,
  ChangeDetectionStrategy,
  OnDestroy,
} from '@angular/core';
import Chart from 'chart.js/auto';
import type { ActivityLog } from '../../../core/services/activity.service';
import type { DisplayRow } from '../../../core/services/activity.service';
import { ActivityService } from '../../../core/services/activity.service';
import { AuthService, type AppUser } from '../../../core/services/auth.service';
import { EmployeeService } from '../../../core/services/employee.service';
import { IdleService, type IdleSession } from '../../../core/services/idle.service';
import { ShiftService, type ShiftSession } from '../../../core/services/shift.service';
import { sumUniqueTimeSeconds } from '../../../core/utils/time-utils';

function formatDuration(seconds: number): string {
  if (seconds < 60) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function formatHours(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m > 0 ? m + 'm' : ''}`;
}

function getDateRange(range: 'today' | '7d' | '30d' | 'custom', customStart?: string, customEnd?: string): { from: Date; to: Date } {
  if (range === 'custom' && customStart && customEnd) {
    const from = new Date(customStart + 'T00:00:00');
    const to = new Date(customEnd + 'T23:59:59.999');
    return { from, to };
  }
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date(to);
  if (range === 'today') {
    from.setHours(0, 0, 0, 0);
  } else if (range === '7d') {
    from.setDate(from.getDate() - 6);
    from.setHours(0, 0, 0, 0);
  } else {
    from.setDate(from.getDate() - 29);
    from.setHours(0, 0, 0, 0);
  }
  return { from, to };
}

@Component({
  selector: 'app-overview',
  imports: [],
  templateUrl: './overview.html',
  styleUrl: './overview.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Overview implements OnDestroy {
  private activityService = inject(ActivityService);
  private authService = inject(AuthService);
  private injector = inject(Injector);
  private employeeService = inject(EmployeeService);
  private idleService = inject(IdleService);
  private shiftService = inject(ShiftService);

  readonly isAdmin = this.authService.isAdmin;

  logs = signal<ActivityLog[]>([]);
  private allLogs = signal<ActivityLog[]>([]);
  employees = signal<AppUser[]>([]);
  loading = signal(true);
  connectionError = signal(false);
  selectedEmployeeId = signal<'all' | string>('all');
  readonly activeShift = signal<ShiftSession | null>(null);
  readonly idleSessions = signal<IdleSession[]>([]);

  lastUpdated = signal('');
  readonly todayDate = signal(new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }));

  productivityScore = computed(() =>
    this.activityService.getDailyProductivityScore(this.logs())
  );
  displayRows = computed<DisplayRow[]>(() =>
    this.activityService.groupForDisplay(this.logs())
  );
  readonly expandedBrowsers = signal<Set<string>>(new Set());

  /** Hourly buckets — only meaningful for 'today' */
  hourlyData = computed(() =>
    this.activityService.groupByHour(this.logs(), new Date())
  );

  /** Chart x-labels and values derived from today hourly data */
  chartLabels = computed(() => {
    return this.hourlyData().map(h => `${h.hour}:00`);
  });

  chartValues = computed(() => {
    return this.hourlyData().map(h => h.productiveSeconds);
  });

  chartTitle = computed(() => 'Productive time by hour');

  categoryMinutes = computed(() => {
    const list = this.logs();
    let productive = 0;
    let unproductive = 0;
    let neutral = 0;
    for (const log of list) {
      const mins = log.durationSeconds / 60;
      if (log.category === 'productive') productive += mins;
      else if (log.category === 'unproductive') unproductive += mins;
      else neutral += mins;
    }
    return { productive, unproductive, neutral };
  });

  totalSeconds = computed(() =>
    sumUniqueTimeSeconds(
      this.logs().map((l) => ({ start: l.startTime.getTime(), end: l.endTime.getTime() }))
    )
  );
  formattedActiveTime = computed(() => formatDuration(this.totalSeconds()));

  productiveSeconds = computed(() =>
    sumUniqueTimeSeconds(
      this.logs()
        .filter((l) => l.category === 'productive')
        .map((l) => ({ start: l.startTime.getTime(), end: l.endTime.getTime() }))
    )
  );
  formattedProductiveTime = computed(() =>
    formatDuration(this.productiveSeconds())
  );

  readonly totalBreakSeconds = computed(() => {
    const sessions = this.idleSessions();
    const employees = this.employees();
    if (!this.isAdmin()) {
      const ts = this.authService.appUser()?.idleThresholdSeconds ?? 300;
      return this.idleService.getTotalBreakSeconds(sessions, { thresholdSeconds: ts });
    }
    const selected = this.selectedEmployeeId();
    if (selected === 'all') {
      const perUserThreshold = new Map(
        employees.map((e) => [e.uid, e.idleThresholdSeconds ?? 300] as const)
      );
      return this.idleService.getTotalBreakSeconds(sessions, { perUserThreshold });
    }
    const ts =
      employees.find((e) => e.uid === selected)?.idleThresholdSeconds ?? 300;
    return this.idleService.getTotalBreakSeconds(sessions, { thresholdSeconds: ts });
  });
  readonly formattedBreakTime = computed(() =>
    formatDuration(this.totalBreakSeconds())
  );

  private productivityChart: Chart<'doughnut'> | null = null;
  private activityChart: Chart<'bar'> | null = null;

  constructor() {
    // Reload data when authentication is ready or initial load
    effect(() => {
      const ready = this.authService.authReady();
      if (!ready) return;
      untracked(() => this.loadData());
    });

    // Load employees once
    effect(() => {
      const ready = this.authService.authReady();
      if (!ready) return;
      untracked(() => {
        void this.loadEmployees();
        void this.loadActiveShift();
      });
    });

    // Main chart effect: handles both initial render and updates
    effect(() => {
      const logs = this.logs();
      const isLoading = this.loading();

      if (isLoading) {
        untracked(() => this.destroyCharts());
        return;
      }

      // Use afterNextRender to ensure canvas elements are available in the DOM
      afterNextRender(
        () => {
          if (!this.productivityChart || !this.activityChart) {
            // Initial render
            this.destroyCharts();
            this.renderProductivityChart();
            this.renderActivityChart();
          } else {
            // In-place update
            this.updateCharts();
          }
        },
        { injector: this.injector }
      );
    });
  }

  ngOnDestroy(): void {
    this.destroyCharts();
  }

  refreshData(): void {
    untracked(() => this.loadData());
  }

  private async loadData(): Promise<void> {
    this.loading.set(true);
    this.connectionError.set(false);
    this.idleSessions.set([]);

    // Always use today
    const { from, to } = getDateRange('today');

    try {
      if (this.isAdmin()) {
        const logs = await this.activityService.getTeamActivitySummary(from, to);
        this.allLogs.set(logs);
        this.applyEmployeeFilter();
        this.loading.set(false);
        this.lastUpdated.set(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        void this.loadIdleSessions(from, to);
      } else {
        const uid = this.authService.firebaseUser()?.uid;
        if (!uid) {
          this.logs.set([]);
          this.idleSessions.set([]);
          this.loading.set(false);
          return;
        }
        const logs = await this.activityService.getActivityForUser(uid, from, to);
        this.logs.set(logs);
        this.loading.set(false);
        this.lastUpdated.set(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        void this.loadIdleSessions(from, to);
      }
    } catch (e) {
      console.error('Failed to load activity:', e);
      this.connectionError.set(true);
      this.logs.set([]);
      this.idleSessions.set([]);
      this.loading.set(false);
    }
  }

  private async loadIdleSessions(from: Date, to: Date): Promise<void> {
    try {
      if (this.isAdmin()) {
        const selected = this.selectedEmployeeId();
        const data =
          selected === 'all'
            ? await this.idleService.getAllIdleSessions(from, to)
            : await this.idleService.getIdleSessionsForUser(selected, from, to);
        this.idleSessions.set(data);
        return;
      }

      const uid = this.authService.firebaseUser()?.uid;
      if (!uid) {
        this.idleSessions.set([]);
        return;
      }
      const data = await this.idleService.getIdleSessionsForUser(uid, from, to);
      this.idleSessions.set(data);
    } catch (e) {
      console.error('[Overview] Failed to load idle sessions:', e);
      this.idleSessions.set([]);
    }
  }

  private async loadEmployees(): Promise<void> {
    if (!this.isAdmin()) return;
    if (this.employees().length > 0) return;
    try {
      const all = await this.employeeService.getAll();
      this.employees.set(all);
    } catch {
      // non-fatal
    }
  }

  private async loadActiveShift(): Promise<void> {
    const isAdm = this.isAdmin();
    const selected = this.selectedEmployeeId();

    if (isAdm) {
      if (selected === 'all') {
        this.activeShift.set(null);
        return;
      }
      try {
        const s = await this.shiftService.getActiveShift(selected);
        this.activeShift.set(s ?? await this.shiftService.getLatestShiftForUser(selected));
      } catch (e) {
        console.error('[Overview] Failed to load active shift for employee:', e);
        this.activeShift.set(null);
      }
      return;
    }

    const uid = this.authService.firebaseUser()?.uid;
    if (!uid) {
      this.activeShift.set(null);
      return;
    }

    try {
      const s = await this.shiftService.getActiveShift(uid);
      this.activeShift.set(s ?? await this.shiftService.getLatestShiftForUser(uid));
    } catch (e) {
      console.error('[Overview] Failed to load active shift:', e);
      this.activeShift.set(null);
    }
  }

  formatTime(d: Date): string {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  setSelectedEmployee(id: string): void {
    this.selectedEmployeeId.set(id === 'all' ? 'all' : id);
    this.applyEmployeeFilter();
    untracked(() => {
      void this.loadActiveShift();
      const { from, to } = getDateRange('today');
      void this.loadIdleSessions(from, to);
    });
  }

  private applyEmployeeFilter(): void {
    const all = this.allLogs();
    const selected = this.selectedEmployeeId();
    this.logs.set(
      selected === 'all' ? all : all.filter((log) => log.userId === selected)
    );
  }

  formatAppTime(seconds: number): string {
    return formatDuration(seconds);
  }

  toggleBrowser(browserName: string): void {
    this.expandedBrowsers.update((set) => {
      const next = new Set(set);
      if (next.has(browserName)) next.delete(browserName);
      else next.add(browserName);
      return next;
    });
  }

  isExpanded(browserName: string): boolean {
    return this.expandedBrowsers().has(browserName);
  }

  getAppPercent(seconds: number): number {
    const total = this.totalSeconds();
    return total === 0 ? 0 : Math.round((seconds / total) * 100);
  }

  private updateCharts(): void {
    if (this.productivityChart) {
      const { productive, unproductive, neutral } = this.categoryMinutes();
      const total = productive + unproductive + neutral;
      this.productivityChart.data.datasets[0].data =
        total > 0 ? [productive, unproductive, neutral] : [1];
      this.productivityChart.options.plugins!.legend!.display = total > 0;
      this.productivityChart.update();
    }

    if (this.activityChart) {
      this.activityChart.data.labels = this.chartLabels();
      this.activityChart.data.datasets[0].data = this.chartValues();
      this.activityChart.options.scales!['y']!.ticks = {
        color: '#8c97b2',
        callback: (val: unknown) => formatHours(Number(val)),
      };
      this.activityChart.options.scales!['x']!.ticks = {
        color: '#8c97b2',
        maxRotation: 0,
        minRotation: 0,
      };
      this.activityChart.update();
    }
  }

  private renderProductivityChart(): void {
    const canvas = document.getElementById(
      'productivity-chart'
    ) as HTMLCanvasElement | null;
    if (!canvas) return;

    const { productive, unproductive, neutral } = this.categoryMinutes();
    const total = productive + unproductive + neutral;
    const data = total > 0 ? [productive, unproductive, neutral] : [1];

    Chart.defaults.color = '#8892aa';
    Chart.defaults.borderColor = '#2a3147';

    this.productivityChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['Productive', 'Unproductive', 'Neutral'],
        datasets: [
          {
            data,
            backgroundColor: ['#34c98a', '#f05252', '#505870'],
            borderColor: '#2a3147',
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: total > 0 },
        },
      },
    });
  }

  private renderActivityChart(): void {
    const canvas = document.getElementById(
      'activity-chart'
    ) as HTMLCanvasElement | null;
    if (!canvas) return;

    const labels = this.chartLabels();
    const data = this.chartValues();

    Chart.defaults.color = '#8892aa';
    Chart.defaults.borderColor = '#2a3147';

    this.activityChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Productive time',
            data,
            backgroundColor: 'rgba(79, 142, 247, 0.6)',
            borderColor: '#4f8ef7',
            borderWidth: 1,
            borderRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => formatHours(ctx.raw as number),
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: '#8c97b2',
              maxRotation: 0,
              minRotation: 0,
            },
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(255,255,255,0.04)' },
            ticks: {
              color: '#8c97b2',
              callback: (val) => formatHours(Number(val)),
            },
          },
        },
      },
    });
  }

  private destroyCharts(): void {
    this.productivityChart?.destroy();
    this.productivityChart = null;
    this.activityChart?.destroy();
    this.activityChart = null;
  }
}