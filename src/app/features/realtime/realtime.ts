import { Component, inject, OnInit, OnDestroy, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RealtimeService } from '../../core/services/realtime.service';
import { EmployeeService } from '../../core/services/employee.service';

@Component({
  selector: 'app-realtime',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './realtime.html',
  styleUrl: './realtime.scss'
})
export class RealtimeComponent implements OnInit, OnDestroy {
  private readonly realtime = inject(RealtimeService);
  private readonly employeeService = inject(EmployeeService);

  readonly agents = this.realtime.agents;
  readonly feed = this.realtime.liveFeed;

  // Hybrid view: Merge employee info with agent status
  readonly employeeStatuses = computed(() => {
    // This is a bit reactive-heavy, let's assume we have employees already
    // Ideally we'd join them in the service or here.
    return this.agents().map(agent => ({
      ...agent,
      // We'll need employee names. For now service might need to provide them.
    }));
  });

  ngOnInit() {
    this.realtime.init();
  }

  ngOnDestroy() {
    this.realtime.destroy();
  }

  isOnline(lastSeen: Date | null): boolean {
    if (!lastSeen) return false;
    const now = new Date();
    // Heartbeat is every 5 mins. Stay safe by allowing 6 mins.
    return (now.getTime() - lastSeen.getTime()) < 360000;
  }

  formatLastSeen(date: Date | null): string {
    if (!date) return 'Never';
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return date.toLocaleDateString();
  }

  getCategoryClass(category: string): string {
    switch (category) {
      case 'productive': return 'status--productive';
      case 'unproductive': return 'status--unproductive';
      default: return 'status--neutral';
    }
  }
}
