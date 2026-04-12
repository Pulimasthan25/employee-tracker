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
import { fadeIn, slideInUp, staggerFadeIn, scaleIn } from '../../../shared/animations';

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0s';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h === 0) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  return s > 0 ? `${h}h ${m}m ${s}s` : (m > 0 ? `${h}h ${m}m` : `${h}h`);
}

function formatHours(seconds: number): string {
  if (seconds <= 0) return '0s';
  if (seconds < 60) return `${Math.round(seconds)}s`;
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
  animations: [fadeIn, slideInUp, staggerFadeIn, scaleIn]
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
  hasLoadedOnce = signal(false);
  connectionError = signal(false);
  selectedRange = signal<'today' | '7d' | '30d' | 'custom'>('today');
  customStart = signal<string>(new Date().toISOString().split('T')[0]);
  customEnd = signal<string>(new Date().toISOString().split('T')[0]);
  selectedEmployeeId = signal<'all' | string>('all');
  readonly activeShift = signal<ShiftSession | null>(null);
  readonly idleSessions = signal<IdleSession[]>([]);

  lastUpdated = signal('');

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

  /** Daily buckets — used for 7d / 30d / custom */
  dailyData = computed(() => {
    const range = this.selectedRange();
    if (range === 'today') return [];
    const { from, to } = getDateRange(range, this.customStart(), this.customEnd());
    return this.activityService.groupByDay(this.logs(), from, to);
  });

  /** Chart x-labels and values derived from the active range */
  chartLabels = computed(() => {
    if (this.selectedRange() === 'today') {
      return this.hourlyData().map(h => `${h.hour}:00`);
    }
    return this.dailyData().map(d => d.label);
  });

  chartData = computed(() => {
    if (this.selectedRange() === 'today') {
      return {
        productive: this.hourlyData().map(h => h.productiveSeconds),
        unproductive: this.hourlyData().map(h => h.unproductiveSeconds),
        neutral: this.hourlyData().map(h => h.neutralSeconds),
      };
    }
    return {
      productive: this.dailyData().map(d => d.productiveSeconds),
      unproductive: this.dailyData().map(d => d.unproductiveSeconds),
      neutral: this.dailyData().map(d => d.neutralSeconds),
    };
  });

  chartTitle = computed(() => {
    const r = this.selectedRange();
    if (r === 'today') return 'Activity by hour';
    if (r === '7d') return 'Activity — last 7 days';
    return 'Activity — last 30 days';
  });

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

  customAdminMetricLabel = computed(() => {
    if (this.isAdmin() && this.selectedEmployeeId() === 'all') {
      return 'Active employees';
    }
    return this.selectedRange() === 'today' ? 'Active apps / sites' : 'Avg daily usage';
  });

  customAdminMetricValue = computed(() => {
    if (this.isAdmin() && this.selectedEmployeeId() === 'all') {
      const activeCount = new Set(this.logs().map(l => l.userId)).size;
      const total = this.employees().length;
      return total > 0 ? `${activeCount} / ${total}` : `${activeCount}`;
    }
    if (this.selectedRange() === 'today') {
      const uniqueApps = new Set(this.logs().map(l => l.appName)).size;
      return `${uniqueApps}`;
    }
    const days = this.selectedRange() === '7d' ? 7 : (this.selectedRange() === '30d' ? 30 : this.dailyData().length || 1);
    const avgSeconds = this.totalSeconds() / days;
    return formatDuration(avgSeconds);
  });

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
    // Reload data when range changes
    effect(() => {
      const ready = this.authService.authReady();
      const _range = this.selectedRange(); // tracked
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

    // Create charts after loading completes (canvas exists in DOM)
    effect(() => {
      if (this.loading() && !this.hasLoadedOnce()) return;
      
      // If there are no logs, the HTML removes the canvas entirely.
      // We must destroy the ChartJS instances so they render anew when data returns.
      if (this.logs().length === 0) {
        untracked(() => this.destroyCharts());
        return;
      }

      if (this.productivityChart && this.activityChart) return; // Don't recreate if they exist
      
      afterNextRender(
        () => {
          this.destroyCharts();
          this.renderProductivityChart();
          this.renderActivityChart();
        },
        { injector: this.injector }
      );
    });

    // Update charts in-place when logs or range changes
    effect(() => {
      const _logs = this.logs();      // tracked — employee filter or realtime
      const _range = this.selectedRange(); // tracked — range switch
      if (this.loading() && !this.hasLoadedOnce()) return;
      if (!this.productivityChart || !this.activityChart) return;
      untracked(() => this.updateCharts());
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
    const { from, to } = getDateRange(this.selectedRange(), this.customStart(), this.customEnd());

    try {
      if (this.isAdmin()) {
        const logs = await this.activityService.getTeamActivitySummary(from, to);
        this.allLogs.set(logs);
        this.applyEmployeeFilter();
        this.loading.set(false);
        this.hasLoadedOnce.set(true);
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
        this.hasLoadedOnce.set(true);
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
      const { from, to } = getDateRange(this.selectedRange(), this.customStart(), this.customEnd());
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

  setRange(range: 'today' | '7d' | '30d' | 'custom'): void {
    this.selectedRange.set(range);
  }

  setCustomStart(val: string): void {
    this.customStart.set(val);
    if (this.selectedRange() === 'custom') {
      untracked(() => this.loadData());
    }
  }

  setCustomEnd(val: string): void {
    this.customEnd.set(val);
    if (this.selectedRange() === 'custom') {
      untracked(() => this.loadData());
    }
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
      const data = this.chartData();
      this.activityChart.data.datasets[0].data = data.productive;
      this.activityChart.data.datasets[1].data = data.unproductive;
      this.activityChart.data.datasets[2].data = data.neutral;
      // Adjust tick formatter based on range
      const isToday = this.selectedRange() === 'today';
      this.activityChart.options.scales!['y']!.ticks = {
        color: '#8c97b2',
        callback: (val: unknown) => formatHours(Number(val)),
      };
      // Rotate x labels for 30d so they don't crowd
      this.activityChart.options.scales!['x']!.ticks = {
        color: '#8c97b2',
        maxRotation: isToday ? 0 : 45,
        minRotation: isToday ? 0 : 45,
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
          tooltip: { animation: { duration: 150 } }
        },
      },
    });
  }

  private renderActivityChart(): void {
    const canvas = document.getElementById(
      'activity-chart'
    ) as HTMLCanvasElement | null;
    if (!canvas) return;

    const isToday = this.selectedRange() === 'today';
    const labels = this.chartLabels();
    const data = this.chartData();

    Chart.defaults.color = '#8892aa';
    Chart.defaults.borderColor = '#2a3147';

    this.activityChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Productive',
            data: data.productive,
            backgroundColor: '#34c98a',
            borderWidth: 0,
            borderRadius: 2,
          },
          {
            label: 'Unproductive',
            data: data.unproductive,
            backgroundColor: '#f05252',
            borderWidth: 0,
            borderRadius: 2,
          },
          {
            label: 'Neutral',
            data: data.neutral,
            backgroundColor: '#505870',
            borderWidth: 0,
            borderRadius: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { 
            display: true,
            position: 'top',
            labels: {
              usePointStyle: true,
              boxWidth: 8
            }
          },
          tooltip: {
            animation: { duration: 150 },
            filter: (item) => Number(item.raw) > 0,
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${formatHours(ctx.raw as number)}`,
            },
          },
        },
        interaction: {
          mode: 'index',
          intersect: false,
        },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            ticks: {
              color: '#8c97b2',
              maxRotation: isToday ? 0 : 45,
              minRotation: isToday ? 0 : 45,
            },
          },
          y: {
            stacked: true,
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