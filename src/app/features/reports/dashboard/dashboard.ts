import {
  Component,
  ChangeDetectionStrategy,
  inject,
  Injector,
  signal,
  computed,
  effect,
  untracked,
  afterNextRender,
  OnDestroy,
} from '@angular/core';
import Chart from 'chart.js/auto';

import type { ActivityLog } from '../../../core/services/activity.service';
import { ActivityService } from '../../../core/services/activity.service';
import { AuthService, type AppUser } from '../../../core/services/auth.service';
import { EmployeeService } from '../../../core/services/employee.service';
import { ToastService } from '../../../core/services/toast.service';
import { sumUniqueTimeSeconds } from '../../../core/utils/time-utils';
import { fadeIn, slideInUp, staggerFadeIn, scaleIn } from '../../../shared/animations';
import { DateRange } from '../../../shared/components/date-range/date-range';

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

function getDateRange(
  range: 'today' | '7d' | '30d' | 'custom',
  customStart?: string,
  customEnd?: string
): { from: Date; to: Date } {
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
  selector: 'app-reports-dashboard',
  standalone: true,
  imports: [DateRange],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [fadeIn, slideInUp, staggerFadeIn, scaleIn]
})
export class ReportsDashboard implements OnDestroy {
  private activityService = inject(ActivityService);
  private authService = inject(AuthService);
  private injector = inject(Injector);
  private employeeService = inject(EmployeeService);
  private toast = inject(ToastService);

  readonly isAdmin = this.authService.isAdmin;

  logs = signal<ActivityLog[]>([]);
  private allLogs = signal<ActivityLog[]>([]);
  employees = signal<AppUser[]>([]);
  loading = signal(true);
  hasLoadedOnce = signal(false);
  connectionError = signal(false);

  selectedRange = signal<'today' | '7d' | '30d' | 'custom'>('today');
  currentRangeDates = signal<{ from: Date; to: Date }>(getDateRange('today'));
  
  selectedEmployeeId = signal<'all' | string>('all');
  lastUpdated = signal('');

  productivityScore = computed(() =>
    this.activityService.getDailyProductivityScore(this.logs())
  );

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
  formattedProductiveTime = computed(() => formatDuration(this.productiveSeconds()));

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

  hourlyData = computed(() =>
    this.activityService.groupByHour(this.logs(), new Date())
  );

  dailyData = computed(() => {
    const { from, to } = this.currentRangeDates();
    return this.activityService.groupByDay(this.logs(), from, to);
  });

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

  private productivityChart: Chart<'doughnut'> | null = null;
  private activityChart: Chart<'bar'> | null = null;

  constructor() {
    effect(() => {
      const ready = this.authService.authReady();
      if (!ready) return;
      untracked(() => void this.loadEmployees());
    });

    effect(() => {
      // Only destroy/return if it's the initial skeleton load where canvases don't exist
      if (this.loading() && !this.hasLoadedOnce()) return;

      if (this.logs().length === 0) {
        untracked(() => this.destroyCharts());
        return;
      }
      
      if (this.productivityChart && this.activityChart) return;

      afterNextRender(
        () => {
          this.renderProductivityChart();
          this.renderActivityChart();
        },
        { injector: this.injector }
      );
    });

    effect(() => {
      const _logs = this.logs();
      const _range = this.selectedRange();
      
      if (this.loading()) return;
      if (!this.productivityChart || !this.activityChart) return;
      
      untracked(() => this.updateCharts());
    });
  }

  ngOnDestroy(): void {
    this.destroyCharts();
  }

  onRangeChange(range: { from: Date; to: Date }) {
    this.currentRangeDates.set(range);
    // Determine the range string for the label display in cards
    const diff = Math.abs(range.to.getTime() - range.from.getTime());
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days <= 1) this.selectedRange.set('today');
    else if (days <= 8) this.selectedRange.set('7d');
    else if (days <= 31) this.selectedRange.set('30d');
    else this.selectedRange.set('custom');

    untracked(() => this.loadData());
  }

  refreshData() {
    untracked(() => this.loadData());
  }

  setSelectedEmployee(id: string): void {
    this.selectedEmployeeId.set(id === 'all' ? 'all' : id);
    this.applyEmployeeFilter();
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

  private async loadData(): Promise<void> {
    this.loading.set(true);
    this.connectionError.set(false);
    const { from, to } = this.currentRangeDates();

    try {
      if (this.isAdmin()) {
        const logs = await this.activityService.getTeamActivitySummary(from, to);
        this.allLogs.set(logs);
        this.applyEmployeeFilter();
      } else {
        const uid = this.authService.firebaseUser()?.uid;
        if (!uid) {
          this.logs.set([]);
          this.loading.set(false);
          return;
        }
        const logs = await this.activityService.getActivityForUser(uid, from, to);
        this.logs.set(logs);
      }
      this.hasLoadedOnce.set(true);
      this.lastUpdated.set(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      console.error('[ReportsDashboard] Failed to load activity:', e);
      this.connectionError.set(true);
      this.logs.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  private applyEmployeeFilter(): void {
    const all = this.allLogs();
    const selected = this.selectedEmployeeId();
    this.logs.set(selected === 'all' ? all : all.filter((log) => log.userId === selected));
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
      const isToday = this.selectedRange() === 'today';
      this.activityChart.options.scales!['y']!.ticks = {
        color: '#8c97b2',
        callback: (val: unknown) => formatHours(Number(val)),
      };
      this.activityChart.options.scales!['x']!.ticks = {
        color: '#8c97b2',
        maxRotation: isToday ? 0 : 45,
        minRotation: isToday ? 0 : 45,
      };
      this.activityChart.update();
    }
  }

  private renderProductivityChart(): void {
    const canvas = document.getElementById('productivity-chart') as HTMLCanvasElement | null;
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
    const canvas = document.getElementById('activity-chart') as HTMLCanvasElement | null;
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
          { label: 'Productive', data: data.productive, backgroundColor: '#34c98a', borderWidth: 0, borderRadius: 2 },
          { label: 'Unproductive', data: data.unproductive, backgroundColor: '#f05252', borderWidth: 0, borderRadius: 2 },
          { label: 'Neutral', data: data.neutral, backgroundColor: '#505870', borderWidth: 0, borderRadius: 2 },
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
