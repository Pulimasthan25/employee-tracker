import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
  computed,
  HostListener,
  ElementRef,
  inject,
  forwardRef,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { fadeIn, expandVertical } from '../../animations';

export interface SelectOption {
  label: string;
  value: any;
  icon?: string;
  subtitle?: string;
}

@Component({
  selector: 'app-select',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './select.html',
  styleUrl: './select.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [fadeIn, expandVertical],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AppSelect),
      multi: true,
    },
  ],
})
export class AppSelect implements ControlValueAccessor {
  private elementRef = inject(ElementRef);

  @Input() options: SelectOption[] = [];
  @Input() placeholder = 'Select an option';
  @Input() label: string = '';
  @Input() id: string = 'select-' + Math.random().toString(36).substring(2, 9);
  
  @Input() set value(v: any) {
    this.selectedValue.set(v);
  }
  get value() {
    return this.selectedValue();
  }
  
  @Output() valueChange = new EventEmitter<any>();

  isOpen = signal(false);
  selectedValue = signal<any>(null);

  selectedOption = computed(() => {
    return this.options.find((opt) => opt.value === this.selectedValue()) || null;
  });

  // ControlValueAccessor methods
  private onChange: (value: any) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: any): void {
    this.selectedValue.set(value);
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  @HostListener('document:click', ['$event'])
  onClickOutside(event: MouseEvent) {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.isOpen.set(false);
    }
  }

  toggleDropdown() {
    this.isOpen.update((v) => !v);
    if (this.isOpen()) {
      this.onTouched();
    }
  }

  selectOption(option: SelectOption) {
    this.selectedValue.set(option.value);
    this.isOpen.set(false);
    this.onChange(option.value);
    this.valueChange.emit(option.value);
  }
}
