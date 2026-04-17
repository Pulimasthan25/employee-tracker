import { Injectable, signal } from '@angular/core';

export interface SettingsAction {
  label: string;
  icon?: string;
  callback?: () => void;
  routerLink?: string;
  btnClass?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  readonly primaryAction = signal<SettingsAction | null>(null);

  setPrimaryAction(action: SettingsAction | null) {
    this.primaryAction.set(action);
  }
}
