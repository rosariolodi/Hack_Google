/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum Difficulty {
  BEGINNER = 'Beginner',
  INTERMEDIATE = 'Intermediate',
  ADVANCED = 'Advanced'
}

export enum ScenarioType {
  INTERVIEW = 'Job Interview',
  PITCH = 'Pitching Ideas',
  EXPLAINING = 'Explaining Concepts'
}

export interface Scenario {
  id: string;
  type: ScenarioType;
  title: string;
  description: string;
  difficulty: Difficulty;
  prompt: string;
  xpReward: number;
  icon: string;
}

export interface Evaluation {
  scores: {
    cadence: number;
    language: number;
    shockFactor: number;
    efficiency: number;
    bodyLanguage?: number; // Only for video
  };
  feedback: string;
  improvedResponse: string;
  coachingTips: string[];
  improvementAreas: string[];
  totalScore: number;
}

export interface PracticeSession {
  id: string;
  userId: string;
  scenarioId: string;
  type: 'audio' | 'video';
  transcript: string;
  mediaUrl?: string;
  evaluation: Evaluation;
  createdAt: number;
}

export interface UserStats {
  xp: number;
  level: number;
  rank: Difficulty;
  completedScenarios: string[];
}
