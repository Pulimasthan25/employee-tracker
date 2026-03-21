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

function getDateRange(range: 'today' | '7d' | '30d'): { from: Date; to: Date } {
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

  readonly isAdmin = this.authService.isAdmin;

  logs = signal<ActivityLog[]>([]);
  private allLogs = signal<ActivityLog[]>([]);
  employees = signal<AppUser[]>([]);
  loading = signal(true);
  connectionError = signal(false);
  selectedRange = signal<'today' | '7d' | '30d'>('today');
  selectedEmployeeId = signal<'all' | string>('all');

  private unsubscribe: (() => void) | null = null;

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

  /** Daily buckets — used for 7d / 30d */
  dailyData = computed(() => {
    const range = this.selectedRange();
    if (range === 'today') return [];
    const { from, to } = getDateRange(range);
    return this.activityService.groupByDay(this.logs(), from, to);
  });

  /** Chart x-labels and values derived from the active range */
  chartLabels = computed(() => {
    if (this.selectedRange() === 'today') {
      return this.hourlyData().map(h => `${h.hour}:00`);
    }
    return this.dailyData().map(d => d.label);
  });

  chartValues = computed(() => {
    if (this.selectedRange() === 'today') {
      return this.hourlyData().map(h => h.productiveSeconds);
    }
    return this.dailyData().map(d => d.productiveSeconds);
  });

  chartTitle = computed(() => {
    const r = this.selectedRange();
    if (r === 'today') return 'Productive time by hour';
    if (r === '7d') return 'Productive time — last 7 days';
    return 'Productive time — last 30 days';
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
    this.logs().reduce((s, l) => s + l.durationSeconds, 0)
  );
  formattedActiveTime = computed(() => formatDuration(this.totalSeconds()));

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
      untracked(() => this.loadEmployees());
    });

    // Create charts after loading completes (canvas exists in DOM)
    effect(() => {
      if (this.loading()) return;
      if (this.logs().length === 0) return;
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
      if (this.loading()) return;
      if (!this.productivityChart || !this.activityChart) return;
      untracked(() => this.updateCharts());
    });
  }

  ngOnDestroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.destroyCharts();
  }

  private loadData(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;

    this.loading.set(true);
    this.connectionError.set(false);
    const { from, to } = getDateRange(this.selectedRange());

    try {
      if (this.isAdmin()) {
        this.unsubscribe = this.activityService.listenTeamActivity(
          from,
          to,
          (logs) => {
            this.allLogs.set(logs);
            this.applyEmployeeFilter();
            this.loading.set(false);
          }
        );
      } else {
        const uid = this.authService.firebaseUser()?.uid;
        if (!uid) {
          this.logs.set([]);
          this.loading.set(false);
          return;
        }
        this.unsubscribe = this.activityService.listenActivityForUser(
          uid,
          from,
          to,
          (logs) => {
            this.logs.set(logs);
            this.loading.set(false);
          }
        );
      }
    } catch (e) {
      console.error('Failed to set up activity listener:', e);
      this.connectionError.set(true);
      this.logs.set([]);
      this.loading.set(false);
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

  setSelectedEmployee(id: string): void {
    this.selectedEmployeeId.set(id === 'all' ? 'all' : id);
    this.applyEmployeeFilter();
  }

  private applyEmployeeFilter(): void {
    const all = this.allLogs();
    const selected = this.selectedEmployeeId();
    this.logs.set(
      selected === 'all' ? all : all.filter((log) => log.userId === selected)
    );
  }

  setRange(range: 'today' | '7d' | '30d'): void {
    this.selectedRange.set(range);
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
              maxRotation: isToday ? 0 : 45,
              minRotation: isToday ? 0 : 45,
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