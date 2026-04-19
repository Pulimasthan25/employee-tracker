import { Component, ChangeDetectionStrategy, signal, output, effect, untracked } from '@angular/core';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';

@Component({
  selector: 'app-date-range',
  imports: [FormsModule, ReactiveFormsModule],
  templateUrl: './date-range.html',
  styleUrl: './date-range.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DateRange {
  rangeChange = output<{ from: Date; to: Date }>();
  
  selectedRange = signal<'today' | '7d' | '30d' | 'custom'>('today');
  readonly fromControl = new FormControl(new Date().toISOString().slice(0, 10));
  readonly toControl = new FormControl(new Date().toISOString().slice(0, 10));

  constructor() {
    effect(() => {
      const selection = this.selectedRange();
      const fromStr = this.fromControl.value;
      const toStr = this.toControl.value;
      
      untracked(() => {
        const now = new Date();
        now.setHours(23, 59, 59, 999);
        
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);

        if (selection === 'today') {
          this.rangeChange.emit({ from: start, to: now });
        } else if (selection === '7d') {
          start.setDate(start.getDate() - 7);
          this.rangeChange.emit({ from: start, to: now });
        } else if (selection === '30d') {
          start.setDate(start.getDate() - 30);
          this.rangeChange.emit({ from: start, to: now });
        } else if (selection === 'custom') {
          if (fromStr && toStr) {
            const f = new Date(fromStr);
            f.setHours(0, 0, 0, 0);
            const t = new Date(toStr);
            t.setHours(23, 59, 59, 999);
            this.rangeChange.emit({ from: f, to: t });
          }
        }
      });
    });
  }

  setRange(val: 'today' | '7d' | '30d' | 'custom') {
    this.selectedRange.set(val);
  }
}
