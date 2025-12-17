export interface Message {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  timestamp: Date;
}

export interface InterviewSection {
  id: string;
  title: string;
  subtitle?: string;
  startsAtQuestion: number;
}

export const interviewSections: InterviewSection[] = [
  { id: 'context', title: 'Your Context', subtitle: 'Current situation', startsAtQuestion: 0 },
  { id: 'catalyst', title: 'The Catalyst', subtitle: 'What changed', startsAtQuestion: 2 },
  { id: 'vision', title: 'Your Vision', subtitle: 'Where you want to go', startsAtQuestion: 4 },
];

export const interviewQuestions = [
  "Tell me about your current role. What company are you with, and what's your title?",
  "How long have you been in this position, and how long with the company overall?",
  "What's prompting you to think about your career right now? What changed?",
  "On a scale of 1-10, how urgent does this feel? What's driving that sense of urgency?",
  "If you could wave a magic wand and have your ideal outcome in 6 months, what would that look like?",
  "What's the biggest thing holding you back from making a change right now?",
  "Is there anything else about your situation I should understand?"
];

export const initialMessage: Message = {
  id: '1',
  role: 'assistant',
  content: "Hello. I'm here to understand your career situation so we can provide meaningful guidance. This conversation typically takes about 15 minutes. Everything you share is confidential.\n\nLet's start with the basics—tell me about your current role. What company are you with, and what's your title?",
  timestamp: new Date()
};

export const mockResponses: Record<number, string> = {
  1: "That's helpful context. How long have you been in this position, and how long with the company overall?",
  2: "I see. Now, what's prompting you to think about your career right now? Something must have shifted—what changed?",
  3: "That makes sense. On a scale of 1-10, how urgent does this feel to you? And what's driving that sense of urgency?",
  4: "I appreciate you sharing that. Here's an important question: if you could wave a magic wand and have your ideal outcome in 6 months, what would that look like?",
  5: "That's a clear picture. Now, what's the biggest thing holding you back from making a change right now?",
  6: "Thank you for being so open. Before I share my analysis, is there anything else about your situation I should understand?",
  7: "Perfect. I have a clear picture now. Give me a moment to analyze what you've shared..."
};

export const mockResults = {
  situationType: "Career Transition at a Crossroads",
  headline: "You're navigating a pivotal moment where multiple factors are converging",
  urgency: 7,
  keyThemes: [
    "Timing pressure from external factors",
    "Misalignment between current role and aspirations",
    "Uncertainty about the right next move"
  ],
  insights: [
    {
      title: "What's Really Going On",
      content: "The frustration you're feeling isn't just about the current situation—it's a signal that you've outgrown this chapter. Your instincts are telling you something important."
    },
    {
      title: "The Hidden Risk",
      content: "The biggest danger isn't making a change—it's waiting too long while your options narrow. The window for optimal moves tends to be smaller than people expect."
    },
    {
      title: "Your Leverage Points",
      content: "You have more leverage than you realize. Your experience and the current market conditions create opportunities that aren't immediately obvious."
    },
    {
      title: "The Decision Framework",
      content: "This isn't a single decision—it's a sequence of smaller moves. The key is knowing which move to make first and what that unlocks."
    }
  ],
  recommendedModules: [
    "Strategic Exit Planning",
    "Difficult Conversations",
    "Negotiation Playbook"
  ]
};
