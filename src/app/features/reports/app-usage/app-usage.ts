import { Component, ChangeDetectionStrategy, signal, computed, inject, effect, untracked, ElementRef, viewChild, OnDestroy, input } from '@angular/core';
import { DateRange } from '../../../shared/components/date-range/date-range';
import { AuthService, AppUser } from '../../../core/services/auth.service';
import { ActivityService, type ActivityLog, type DisplayRow } from '../../../core/services/activity.service';
import { EmployeeService } from '../../../core/services/employee.service';
import { FormsModule } from '@angular/forms';
import { fadeIn, staggerFadeIn, scaleIn, expandVertical } from '../../../shared/animations';
import { Chart, ChartConfiguration, registerables } from 'chart.js';

Chart.register(...registerables);

type ChartRow = { appName: string; totalSeconds: number; category: 'productive' | 'unproductive' | 'neutral' };

function formatDuration(seconds: number): string {
  if (!seconds) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || (h === 0 && m === 0)) parts.push(`${s}s`);
  
  return parts.join(' ');
}

@Component({
  selector: 'app-app-usage',
  imports: [DateRange, FormsModule],
  templateUrl: './app-usage.html',
  styleUrl: './app-usage.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [fadeIn, staggerFadeIn, scaleIn, expandVertical]
})
export class AppUsage implements OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly activity = inject(ActivityService);
  private readonly employee = inject(EmployeeService);

  readonly chartCanvas = viewChild<ElementRef<HTMLCanvasElement>>('chartCanvas');
  private chartInstance: Chart | null = null;

  // Optional inputs for when used as a child component
  externalLogs = input<ActivityLog[] | null>(null);
  externalLoading = input<boolean | null>(null);
  hideHeader = input<boolean>(false);
  title = input<string>("");

  readonly _internalData = signal<DisplayRow[]>([]);
  readonly data = computed(() => {
    const ext = this.externalLogs();
    if (ext !== null) return this.activity.groupForDisplay(ext);
    return this._internalData();
  });

  readonly chartRows = computed(() =>
    this.data()
      .flatMap((row) =>
        row.type === 'browser' && row.children.length > 0
          ? row.children.map((c) => ({
              appName: c.appName,
              totalSeconds: c.totalSeconds,
              category: c.category,
            }))
          : [
              {
                appName: row.appName,
                totalSeconds: row.totalSeconds,
                category: row.category,
              },
            ]
      )
      .sort((a, b) => b.totalSeconds - a.totalSeconds)
      .slice(0, 10)
  );

  readonly _internalLoading = signal(true);
  readonly loading = computed(() => {
    const ext = this.externalLoading();
    return ext !== null ? ext : this._internalLoading();
  });

  readonly dateRange = signal<{ from: Date; to: Date } | null>(null);
  readonly selectedEmployee = signal<string>('all');
  readonly employees = signal<AppUser[]>([]);
  readonly expandedBrowsers = signal<Set<string>>(new Set());

  readonly isAdmin = this.auth.isAdmin;

  constructor() {
    effect(() => {
      const ready = this.auth.authReady();
      const range = this.dateRange();
      const selEmp = this.selectedEmployee();
      const extLogs = this.externalLogs();
      
      if (ready && range && extLogs === null) {
        untracked(() => {
          this.loadData();
        });
      }
    });

    effect(() => {
      const d = this.chartRows();
      const canvasRef = this.chartCanvas();
      untracked(() => {
        if (canvasRef) {
          this.renderChart(d, canvasRef.nativeElement);
        }
      });
    });
  }

  async loadData() {
    this._internalLoading.set(true);
    try {
      if (this.auth.isAdmin() && this.employees().length === 0) {
        const users = await this.employee.getAll();
        this.employees.set(users);
      }

      const range = this.dateRange()!;
      let logs: ActivityLog[] = [];
      const isAdm = this.auth.isAdmin();
      const sel = this.selectedEmployee();

      if (isAdm) {
        if (sel === 'all') {
          logs = await this.activity.getTeamActivitySummary(range.from, range.to);
        } else {
          logs = await this.activity.getActivityForUser(sel, range.from, range.to);
        }
      } else {
        const user = this.auth.appUser();
        if (user) {
          logs = await this.activity.getActivityForUser(user.uid, range.from, range.to);
        }
      }

      this._internalData.set(this.activity.groupForDisplay(logs));
    } finally {
      this._internalLoading.set(false);
    }
  }

  onRangeChange(range: { from: Date; to: Date }) {
    this.dateRange.set(range);
  }

  formatDurationStr(seconds: number): string {
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

  private renderChart(data: ChartRow[], canvas: HTMLCanvasElement) {
    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = null;
    }

    if (!data.length) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const labels = data.map(d => d.appName);
    const chartData = data.map(d => d.totalSeconds / 3600);
    const colors = data.map(d => {
      if (d.category === 'productive') return '#34c98a';
      if (d.category === 'unproductive') return '#f05252';
      return '#505870';
    });

    const config: ChartConfiguration = {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data: chartData,
          backgroundColor: colors,
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            animation: { duration: 150 },
            filter: (item: any) => Number(item.raw) > 0,
            callbacks: {
              label: (context: any) => {
                const h = Math.floor(context.raw);
                const m = Math.floor((context.raw - h) * 60);
                return `${h}h ${m}m`;
              }
            }
          }
        },
        interaction: {
          mode: 'index',
          intersect: false,
          axis: 'y'
        },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.05)' },
            border: { display: false },
            ticks: {
              color: '#8c97b2',
              callback: (val: any) => `${val}h`
            }
          },
          y: {
            grid: { display: false },
            border: { display: false },
            ticks: { color: '#8c97b2' }
          }
        }
      }
    };

    this.chartInstance = new Chart(ctx, config);
  }

  ngOnDestroy() {
    if (this.chartInstance) {
      this.chartInstance.destroy();
    }
  }

  getTotalSeconds(): number {
    return this.data().reduce((acc, r) => acc + r.totalSeconds, 0);
  }

  getPercentage(seconds: number): string {
    const total = this.getTotalSeconds();
    if (total === 0) return '0%';
    return Math.round((seconds / total) * 100) + '%';
  }
}
