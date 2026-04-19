import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
  computed,
  ElementRef,
  inject,
  forwardRef,
  ChangeDetectionStrategy,
  ViewChild,
  OnDestroy,
  TemplateRef,
  ViewContainerRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import {
  Overlay,
  OverlayRef,
  OverlayModule,
  ConnectedPosition,
} from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { expandVertical } from '../../animations';

export interface SelectOption {
  label: string;
  value: any;
  icon?: string;
  subtitle?: string;
}

@Component({
  selector: 'app-select',
  standalone: true,
  imports: [CommonModule, OverlayModule],
  templateUrl: './select.html',
  styleUrl: './select.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [expandVertical],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AppSelect),
      multi: true,
    },
  ],
})
export class AppSelect implements ControlValueAccessor, OnDestroy {
  private overlay = inject(Overlay);
  private vcr = inject(ViewContainerRef);
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

  @ViewChild('dropdownTemplate') dropdownTemplate!: TemplateRef<any>;
  @ViewChild('triggerBtn') triggerBtn!: ElementRef;

  isOpen = signal(false);
  selectedValue = signal<any>(null);

  selectedOption = computed(() => {
    return this.options.find((opt) => opt.value === this.selectedValue()) || null;
  });

  // CDK Overlay
  private overlayRef: OverlayRef | null = null;

  /** Preferred positions: below-left first, then above-left as fallback */
  readonly positions: ConnectedPosition[] = [
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
    { originX: 'start', originY: 'top',    overlayX: 'start', overlayY: 'bottom', offsetY: -6 },
  ];

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

  toggleDropdown() {
    this.isOpen() ? this.close() : this.open();
  }

  open() {
    if (this.overlayRef?.hasAttached()) return;

    this.onTouched();

    const trigger = this.triggerBtn.nativeElement as HTMLElement;
    const triggerWidth = trigger.getBoundingClientRect().width;

    this.overlayRef = this.overlay.create({
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop',
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
      positionStrategy: this.overlay
        .position()
        .flexibleConnectedTo(trigger)
        .withPositions(this.positions)
        .withPush(false),
      width: triggerWidth,
      minWidth: triggerWidth,
    });

    const portal = new TemplatePortal(this.dropdownTemplate, this.vcr);
    this.overlayRef.attach(portal);

    // Close on backdrop click
    this.overlayRef.backdropClick().subscribe(() => this.close());
    // Close if scroll/resize detaches
    this.overlayRef.detachments().subscribe(() => this.isOpen.set(false));

    this.isOpen.set(true);
  }

  close() {
    this.overlayRef?.detach();
    this.isOpen.set(false);
  }

  selectOption(option: SelectOption) {
    this.selectedValue.set(option.value);
    this.onChange(option.value);
    this.valueChange.emit(option.value);
    this.close();
  }

  ngOnDestroy() {
    this.overlayRef?.dispose();
  }
}
