import { animate, query, stagger, style, transition, trigger } from '@angular/animations';

export const fadeIn = trigger('fadeIn', [
  transition(':enter', [
    style({ opacity: 0 }),
    animate('{{duration}}ms {{delay}}ms ease-out', style({ opacity: 1 }))
  ], { params: { duration: 400, delay: 0 } })
]);

export const slideInUp = trigger('slideInUp', [
  transition(':enter', [
    style({ opacity: 0, transform: 'translateY(20px)' }),
    animate('{{duration}}ms {{delay}}ms cubic-bezier(0.16, 1, 0.3, 1)', 
      style({ opacity: 1, transform: 'translateY(0)' }))
  ], { params: { duration: 500, delay: 0 } })
]);

export const staggerFadeIn = trigger('staggerFadeIn', [
  transition('* => *', [
    query(':enter', [
      style({ opacity: 0, transform: 'translateY(8px)' }),
      stagger('30ms', [
        animate('350ms cubic-bezier(0.1, 0.9, 0.2, 1)', 
          style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ], { optional: true })
  ])
]);

export const scaleIn = trigger('scaleIn', [
  transition(':enter', [
    style({ opacity: 0, transform: 'scale(0.98)' }),
    animate('400ms cubic-bezier(0.2, 0.8, 0.2, 1)', 
      style({ opacity: 1, transform: 'scale(1)' }))
  ], { params: { duration: 400, delay: 0 } })
]);

export const routeAnimations = trigger('routeAnimations', [
  transition('* <=> *', [
    query(':enter', [
      style({ opacity: 0, transform: 'translateY(8px)' }),
      animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
    ], { optional: true })
  ])
]);
