import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Productivity } from './productivity';

describe('Productivity', () => {
  let component: Productivity;
  let fixture: ComponentFixture<Productivity>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Productivity],
    }).compileComponents();

    fixture = TestBed.createComponent(Productivity);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
