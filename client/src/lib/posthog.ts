import posthog from 'posthog-js';

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = 'https://us.i.posthog.com';

let initialized = false;

export function initPostHog() {
  if (initialized || !POSTHOG_KEY) {
    return;
  }
  
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    person_profiles: 'identified_only',
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: false,
  });
  
  initialized = true;
}

export function identifyUser(email: string, properties?: Record<string, unknown>) {
  if (!POSTHOG_KEY) return;
  posthog.identify(email, properties);
}

export function resetUser() {
  if (!POSTHOG_KEY) return;
  posthog.reset();
}

export function trackEvent(event: string, properties?: Record<string, unknown>) {
  if (!POSTHOG_KEY) return;
  posthog.capture(event, properties);
}

export const analytics = {
  interviewStarted: () => trackEvent('interview_started'),
  interviewMessageSent: () => trackEvent('interview_message_sent'),
  interviewCompleted: () => trackEvent('interview_completed'),
  
  checkoutStarted: () => trackEvent('checkout_started'),
  paymentCompleted: () => trackEvent('payment_completed'),
  
  moduleStarted: (moduleNumber: number) => trackEvent('module_started', { module_number: moduleNumber }),
  moduleMessageSent: (moduleNumber: number) => trackEvent('module_message_sent', { module_number: moduleNumber }),
  moduleCompleted: (moduleNumber: number) => trackEvent('module_completed', { module_number: moduleNumber }),
  
  seriousPlanGenerated: () => trackEvent('serious_plan_generated'),
  
  coachChatMessageSent: () => trackEvent('coach_chat_message_sent'),
};
