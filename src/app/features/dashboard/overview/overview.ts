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
} from '@angular/core';
import Chart from 'chart.js/auto';
import type { ActivityLog } from '../../../core/services/activity.service';
import { ActivityService } from '../../../core/services/activity.service';
import { AuthService } from '../../../core/services/auth.service';

function formatDuration(seconds: number): string {
  if (seconds < 60) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
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
export class Overview {
  private activityService = inject(ActivityService);
  private authService = inject(AuthService);
  private injector = inject(Injector);

  logs = signal<ActivityLog[]>([]);
  loading = signal(true);
  connectionError = signal(false);
  selectedRange = signal<'today' | '7d' | '30d'>('today');

  productivityScore = computed(() =>
    this.activityService.getDailyProductivityScore(this.logs())
  );
  topApps = computed(() => this.activityService.groupByApp(this.logs()));
  hourlyData = computed(() =>
    this.activityService.groupByHour(this.logs(), new Date())
  );

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
  formattedActiveTime = computed(() =>
    formatDuration(this.totalSeconds())
  );

  private productivityChart: Chart<'doughnut'> | null = null;
  private hourlyChart: Chart<'bar'> | null = null;

  constructor() {
    effect(() => {
      const ready = this.authService.authReady();
      const range = this.selectedRange();
      if (!ready) return;
      untracked(() => this.loadData());
    });
    effect(() => {
      if (this.loading()) return;
      afterNextRender(
        () => {
          this.destroyCharts();
          this.renderProductivityChart();
          this.renderHourlyChart();
        },
        { injector: this.injector }
      );
    });
  }

  private async loadData(): Promise<void> {
    this.loading.set(true);
    this.connectionError.set(false);
    const { from, to } = getDateRange(this.selectedRange());
    try {
      if (this.authService.isAdmin()) {
        const data = await this.activityService.getTeamActivitySummary(
          from,
          to
        );
        this.logs.set(data);
      } else {
        const uid = this.authService.firebaseUser()?.uid;
        if (!uid) {
          this.logs.set([]);
          return;
        }
        const data = await this.activityService.getActivityForUser(
          uid,
          from,
          to
        );
        this.logs.set(data);
      }
    } catch (e) {
      console.error('Failed to load activity:', e);
      this.connectionError.set(true);
      this.logs.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  setRange(range: 'today' | '7d' | '30d'): void {
    this.selectedRange.set(range);
  }

  formatAppTime(seconds: number): string {
    return formatDuration(seconds);
  }

  getAppPercent(seconds: number): number {
    const total = this.totalSeconds();
    return total === 0 ? 0 : Math.round((seconds / total) * 100);
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
          legend: {
            display: total > 0,
          },
        },
        scales: total > 0 ? {} : undefined,
      },
    });
  }

  private renderHourlyChart(): void {
    const canvas = document.getElementById(
      'hourly-chart'
    ) as HTMLCanvasElement | null;
    if (!canvas) return;

    const hourly = this.hourlyData();
    const labels = hourly.map((h) => `${h.hour}:00`);
    const data = hourly.map((h) => h.productiveSeconds);

    Chart.defaults.color = '#8892aa';
    Chart.defaults.borderColor = '#2a3147';

    this.hourlyChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Productive seconds',
            data,
            backgroundColor: 'rgba(79, 142, 247, 0.6)',
            borderColor: '#4f8ef7',
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          x: {
            grid: { display: false },
          },
          y: {
            beginAtZero: true,
          },
        },
      },
    });
  }

  private destroyCharts(): void {
    this.productivityChart?.destroy();
    this.productivityChart = null;
    this.hourlyChart?.destroy();
    this.hourlyChart = null;
  }
}
