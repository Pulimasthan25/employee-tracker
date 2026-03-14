import { TestBed } from '@angular/core/testing';

import { Screenshot } from './screenshot';

describe('Screenshot', () => {
  let service: Screenshot;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Screenshot);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
