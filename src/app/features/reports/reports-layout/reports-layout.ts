import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-reports-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './reports-layout.html',
  styleUrl: './reports-layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportsLayout {}
