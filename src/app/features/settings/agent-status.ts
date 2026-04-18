import { Component, inject, OnInit, OnDestroy, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RealtimeService } from '../../core/services/realtime.service';

@Component({
  selector: 'app-agent-status',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './agent-status.html',
  styleUrl: './agent-status.scss'
})
export class AgentStatusComponent implements OnInit, OnDestroy {
  public readonly realtime = inject(RealtimeService);
  
  // Alphabetical sorting of agents by name
  readonly sortedAgents = computed(() => {
    return [...this.realtime.agents()].sort((a, b) => 
      (a.userName || '').localeCompare(b.userName || '')
    );
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
    return (now.getTime() - lastSeen.getTime()) < 120000;
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

  /**
   * Translates technical agent errors into more understandable language for non-IT users.
   */
  simplifyError(error: string | null): string {
    if (!error) return '';
    const msg = error.toLowerCase();
    
    if (msg.includes('watchdog forced resume')) {
      return 'System auto-recovered from a temporary freeze.';
    }
    if (msg.includes('stuck idle')) {
      return 'Agent was inactive for too long and had to be restarted.';
    }
    if (msg.includes('network') || msg.includes('timeout')) {
      return 'Temporary connection issue detected.';
    }
    if (msg.includes('permission') || msg.includes('access')) {
      return 'Microphone or Screen access may have been restricted.';
    }
    
    return error; // Fallback to raw error if no mapping
  }
}
