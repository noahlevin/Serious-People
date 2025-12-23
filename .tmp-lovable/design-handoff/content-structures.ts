/**
 * SERIOUS PEOPLE — CONTENT STRUCTURES
 * 
 * Data shapes and content abstraction patterns.
 * These types define the structure of content throughout the application.
 * 
 * NOTE: For SEO pages, adopt the existing content structure from the current app.
 * For app data, Replit Agent should decide on storage strategy consistent with
 * the current backend patterns.
 */

// ============================================
// NAVIGATION & LAYOUT
// ============================================

export interface NavItem {
  label: string;
  href: string;
  isExternal?: boolean;
}

export interface FooterSection {
  title: string;
  links: NavItem[];
}

export const mainNavigation: NavItem[] = [
  { label: 'How It Works', href: '/how-it-works' },
  { label: 'Resources', href: '/resources' },
  { label: 'Pricing', href: '/pricing' },
];

export const footerNavigation: FooterSection[] = [
  {
    title: 'Product',
    links: [
      { label: 'How It Works', href: '/how-it-works' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'FAQ', href: '/faq' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Guides', href: '/guides' },
      { label: 'Tools', href: '/tools' },
      { label: 'Blog', href: '/blog' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Contact', href: '/contact' },
      { label: 'Privacy', href: '/privacy' },
    ],
  },
];

// ============================================
// HOMEPAGE CONTENT
// ============================================

export interface HeroContent {
  headline: string;
  subheadline: string;
  primaryCta: {
    label: string;
    href: string;
  };
  secondaryCta?: {
    label: string;
    href: string;
  };
  trustSignals: string[];
}

export const heroContent: HeroContent = {
  headline: "Career clarity for executives who've stopped pretending everything's fine",
  subheadline: "A 15-minute AI conversation that cuts through the noise and tells you what you actually need to hear about your career situation.",
  primaryCta: {
    label: 'Start Free Interview',
    href: '/interview',
  },
  secondaryCta: {
    label: 'See How It Works',
    href: '/how-it-works',
  },
  trustSignals: [
    '15 minutes',
    'Private & secure',
    'No credit card required',
  ],
};

// ============================================
// SITUATION CARDS (Homepage)
// ============================================

export interface SituationCard {
  id: string;
  title: string;
  description: string;
  icon: 'stuck' | 'considering' | 'readyToLeave' | 'newOpportunity';
  href: string;
}

export const situationCards: SituationCard[] = [
  {
    id: 'stuck',
    title: 'Stuck in Your Role',
    description: "You're competent, even successful, but something feels off. Growth has stalled.",
    icon: 'stuck',
    href: '/roles/executive/stuck-in-role',
  },
  {
    id: 'considering',
    title: 'Considering a Change',
    description: "You're weighing options but can't get clarity on the right move.",
    icon: 'considering',
    href: '/roles/executive/considering-change',
  },
  {
    id: 'ready-to-leave',
    title: 'Ready to Leave',
    description: "You know it's time to go, but need a strategic exit plan.",
    icon: 'readyToLeave',
    href: '/roles/executive/ready-to-leave',
  },
  {
    id: 'new-opportunity',
    title: 'Evaluating an Opportunity',
    description: "You have an offer or opportunity and need to decide wisely.",
    icon: 'newOpportunity',
    href: '/roles/executive/new-opportunity',
  },
];

// ============================================
// PROCESS STEPS
// ============================================

export interface ProcessStep {
  number: number;
  title: string;
  description: string;
  duration?: string;
}

export const processSteps: ProcessStep[] = [
  {
    number: 1,
    title: 'Complete the Interview',
    description: 'Answer a few questions about your career situation in a private, conversational format.',
    duration: '15 min',
  },
  {
    number: 2,
    title: 'Get Your Insights',
    description: 'Receive a personalized analysis of your situation with actionable recommendations.',
    duration: 'Instant',
  },
  {
    number: 3,
    title: 'Follow Your Plan',
    description: 'Access tailored coaching modules designed for your specific career challenge.',
    duration: 'Self-paced',
  },
];

// ============================================
// INTERVIEW CONTENT
// ============================================

export interface InterviewSection {
  id: string;
  title: string;
  description: string;
}

export const interviewSections: InterviewSection[] = [
  {
    id: 'situation',
    title: 'Your Situation',
    description: 'Understanding where you are now',
  },
  {
    id: 'challenges',
    title: 'Challenges',
    description: 'What\'s making this difficult',
  },
  {
    id: 'goals',
    title: 'Goals',
    description: 'Where you want to be',
  },
  {
    id: 'review',
    title: 'Review',
    description: 'Confirming your priorities',
  },
];

export interface ExpectationItem {
  icon: 'clock' | 'messageCircle' | 'lock' | 'sparkles';
  title: string;
  description: string;
}

export const interviewExpectations: ExpectationItem[] = [
  {
    icon: 'clock',
    title: '15 minutes',
    description: 'A focused conversation about your career situation',
  },
  {
    icon: 'messageCircle',
    title: 'Conversational',
    description: 'Just answer naturally—no right or wrong responses',
  },
  {
    icon: 'lock',
    title: 'Private',
    description: 'Your responses are confidential and secure',
  },
  {
    icon: 'sparkles',
    title: 'AI-powered',
    description: 'Get personalized insights based on your answers',
  },
];

// ============================================
// CHAT MESSAGES
// ============================================

export interface ChatMessage {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  timestamp: Date;
}

export interface WelcomeCardContent {
  title: string;
  description: string;
  meta: {
    duration: string;
    privacy: string;
    style: string;
  };
}

export const welcomeCardContent: WelcomeCardContent = {
  title: 'Welcome to your career clarity session',
  description: "I'm going to ask you a few questions to understand your situation. There are no right or wrong answers—just share what's true for you.",
  meta: {
    duration: '~15 minutes',
    privacy: 'Private & secure',
    style: 'Conversational',
  },
};

// ============================================
// UPSELL / OFFER CONTENT
// ============================================

export interface UpsellContent {
  situationType: string;
  headline: string;
  features: string[];
  price: number;
  originalPrice?: number;
  guarantee: string;
}

// This would be dynamic based on interview results
export const defaultUpsellContent: UpsellContent = {
  situationType: 'Career Transition',
  headline: 'Your personalized coaching plan is ready',
  features: [
    'Customized coaching modules for your situation',
    'Actionable exercises and frameworks',
    'Progress tracking and milestone celebrations',
    'Access to exclusive resources and templates',
  ],
  price: 197,
  originalPrice: 297,
  guarantee: '30-day money-back guarantee',
};

// ============================================
// RESOURCES / GUIDES
// ============================================

export interface Guide {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  readTime: number; // in minutes
  author?: string;
  publishedAt?: Date;
  featured?: boolean;
}

export interface GuideCategory {
  slug: string;
  name: string;
  description: string;
}

export const guideCategories: GuideCategory[] = [
  {
    slug: 'career-transitions',
    name: 'Career Transitions',
    description: 'Navigating major career changes with confidence',
  },
  {
    slug: 'leadership',
    name: 'Leadership',
    description: 'Developing executive presence and influence',
  },
  {
    slug: 'negotiations',
    name: 'Negotiations',
    description: 'Compensation, offers, and difficult conversations',
  },
  {
    slug: 'self-assessment',
    name: 'Self-Assessment',
    description: 'Understanding your strengths and aspirations',
  },
];

// ============================================
// TOOLS
// ============================================

export interface Tool {
  slug: string;
  title: string;
  description: string;
  icon: string;
  href: string;
}

export const tools: Tool[] = [
  {
    slug: 'stay-or-go-calculator',
    title: 'Stay or Go Calculator',
    description: 'Evaluate whether to stay in your current role or pursue new opportunities',
    icon: 'calculator',
    href: '/tools/stay-or-go-calculator',
  },
  // Add more tools as needed
];

// ============================================
// TESTIMONIALS
// ============================================

export interface Testimonial {
  id: string;
  quote: string;
  author: {
    name: string;
    title: string;
    company?: string;
    avatar?: string;
  };
}

export const testimonials: Testimonial[] = [
  {
    id: '1',
    quote: "The clarity I gained in 15 minutes was worth more than months of spinning in my own head.",
    author: {
      name: 'Sarah M.',
      title: 'VP of Product',
      company: 'Tech Startup',
    },
  },
  {
    id: '2',
    quote: "Finally, someone who understood that career decisions aren't just about the money.",
    author: {
      name: 'Michael R.',
      title: 'Director of Engineering',
    },
  },
  {
    id: '3',
    quote: "I wish I had this tool five years ago. Would have saved me from a terrible job move.",
    author: {
      name: 'Jennifer L.',
      title: 'Chief Marketing Officer',
    },
  },
];

// ============================================
// FAQ
// ============================================

export interface FAQItem {
  question: string;
  answer: string;
}

export const faqItems: FAQItem[] = [
  {
    question: 'How long does the interview take?',
    answer: 'The AI-powered interview takes about 15 minutes. You can pause and resume at any time.',
  },
  {
    question: 'Is my information kept private?',
    answer: 'Absolutely. Your responses are encrypted and never shared. We take privacy seriously.',
  },
  {
    question: 'What happens after the interview?',
    answer: 'You\'ll receive a personalized analysis of your situation along with recommended next steps and coaching modules tailored to your needs.',
  },
  {
    question: 'Can I try it before paying?',
    answer: 'Yes! The interview and initial insights are completely free. You only pay if you want access to the full coaching plan.',
  },
];

// ============================================
// SEO / META
// ============================================

export interface PageMeta {
  title: string;
  description: string;
  ogImage?: string;
}

export const pageMeta: Record<string, PageMeta> = {
  home: {
    title: 'Serious People | Career Clarity for Executives',
    description: 'A 15-minute AI conversation that cuts through the noise and tells you what you need to hear about your career situation.',
  },
  interview: {
    title: 'Career Interview | Serious People',
    description: 'Complete a confidential 15-minute interview to get personalized career insights and recommendations.',
  },
  resources: {
    title: 'Career Resources | Serious People',
    description: 'Expert guidance, tools, and frameworks for navigating executive career decisions.',
  },
  // Add more as needed
};

// ============================================
// TYPE EXPORTS
// ============================================

export type {
  NavItem,
  FooterSection,
  HeroContent,
  SituationCard,
  ProcessStep,
  InterviewSection,
  ExpectationItem,
  ChatMessage,
  WelcomeCardContent,
  UpsellContent,
  Guide,
  GuideCategory,
  Tool,
  Testimonial,
  FAQItem,
  PageMeta,
};
