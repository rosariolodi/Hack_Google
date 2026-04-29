/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Scenario, ScenarioType, Difficulty } from './types';

export const SCENARIOS: Scenario[] = [
  {
    id: 'interview-1',
    type: ScenarioType.INTERVIEW,
    title: 'The Great Introduction',
    description: 'Master the "Tell me about yourself" question.',
    difficulty: Difficulty.BEGINNER,
    prompt: 'A hiring manager asks: "So, tell me a bit about yourself and why you applied for this role?"',
    xpReward: 100,
    icon: 'User'
  },
  {
    id: 'pitch-1',
    type: ScenarioType.PITCH,
    title: 'Elevator Pitch',
    description: 'Pitch your app idea in 30 seconds.',
    difficulty: Difficulty.BEGINNER,
    prompt: 'You meet an investor in an elevator. They ask: "What are you working on these days?"',
    xpReward: 120,
    icon: 'Rocket'
  },
  {
    id: 'explain-1',
    type: ScenarioType.EXPLAINING,
    title: 'ELI5: Blockchain',
    description: 'Explain a complex concept to a 5-year-old.',
    difficulty: Difficulty.BEGINNER,
    prompt: 'Your young cousin asks: "What is blockchain and why does everyone talk about it?"',
    xpReward: 150,
    icon: 'Lightbulb'
  },
  {
    id: 'interview-2',
    type: ScenarioType.INTERVIEW,
    title: 'The Weakness Trap',
    description: 'Turn a negative into a positive growth story.',
    difficulty: Difficulty.INTERMEDIATE,
    prompt: 'Interviewer: "What would you say is your biggest weakness, and how do you manage it?"',
    xpReward: 200,
    icon: 'Zap'
  },
  {
    id: 'pitch-2',
    type: ScenarioType.PITCH,
    title: 'Funding Round A',
    description: 'Defend your business model against skepticism.',
    difficulty: Difficulty.ADVANCED,
    prompt: 'Investor: "Your customer acquisition cost seems high. How do you plan to scale profitably?"',
    xpReward: 400,
    icon: 'TrendingUp'
  }
];

export const XP_PER_LEVEL = 500;

export const getRankFromLevel = (level: number): Difficulty => {
  if (level < 3) return Difficulty.BEGINNER;
  if (level < 7) return Difficulty.INTERMEDIATE;
  return Difficulty.ADVANCED;
};
