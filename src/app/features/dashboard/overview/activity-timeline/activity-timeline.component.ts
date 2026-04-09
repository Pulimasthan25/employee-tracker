import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface TimelineSegment {
  type: 'productive' | 'unproductive' | 'neutral' | 'break';
  startMinutes: number;
  endMinutes: number;
  label?: string;
  appName?: string;
}

export interface TimelineRow {
  userId: string;
  userName: string;
  segments: TimelineSegment[];
}

@Component({
  selector: 'app-activity-timeline',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './activity-timeline.component.html',
  styleUrl: './activity-timeline.component.scss'
})
export class ActivityTimeline {
  @Input({ required: true }) rows: TimelineRow[] = [];
  
  readonly hours = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22];

  formatHour(h: number): string {
    if (h === 0) return '12 AM';
    if (h < 12) return `${h} AM`;
    if (h === 12) return '12 PM';
    return `${h - 12} PM`;
  }

  getSegmentStyle(segment: TimelineSegment) {
    const startPercent = (segment.startMinutes / (24 * 60)) * 100;
    const widthPercent = Math.max(((segment.endMinutes - segment.startMinutes) / (24 * 60)) * 100, 0.1);
    return {
      left: `${startPercent}%`,
      width: `${widthPercent}%`
    };
  }
}
