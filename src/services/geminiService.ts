/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type } from "@google/genai";
import { Evaluation, Scenario, Difficulty } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const EVALUATION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    scores: {
      type: Type.OBJECT,
      properties: {
        cadence: { type: Type.NUMBER, description: "Score from 1 to 10 for rhythm and speed" },
        language: { type: Type.NUMBER, description: "Score from 1 to 10 for vocabulary and grammar" },
        shockFactor: { type: Type.NUMBER, description: "Score from 1 to 10 for impact or memorability" },
        efficiency: { type: Type.NUMBER, description: "Score from 1 to 10 for getting to the point" },
        bodyLanguage: { type: Type.NUMBER, description: "Score from 1 to 10 for non-verbal cues (only for video mode, otherwise 0)" },
      },
      required: ["cadence", "language", "shockFactor", "efficiency"],
    },
    feedback: { type: Type.STRING, description: "General constructive feedback" },
    improvedResponse: { type: Type.STRING, description: "A significantly improved version of the user's response" },
    coachingTips: { 
      type: Type.ARRAY, 
      items: { type: Type.STRING },
      description: "3 specific tips to improve next time"
    },
    improvementAreas: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Specific technical or structural areas needing work"
    },
    totalScore: { type: Type.NUMBER, description: "An average score from 1 to 100" },
  },
  required: ["scores", "feedback", "improvedResponse", "coachingTips", "improvementAreas", "totalScore"],
};

export async function evaluateResponse(
  scenario: Scenario,
  userResponse: string,
  userRank: Difficulty,
  mode: 'audio' | 'video'
): Promise<Evaluation> {
  const prompt = `
    You are an expert communication coach. 
    Evaluate the following user response for a ${scenario.type} scenario.
    
    MODE: ${mode} (Note: For video mode, you should also infer body language quality from the transcript's descriptive cues if provided, or evaluate based on the expectation of high-stakes presentation).
    
    SCENARIO: ${scenario.title}
    DIFFICULTY: ${scenario.difficulty}
    PROMPT: ${scenario.prompt}
    
    USER RANK: ${userRank}
    USER RESPONSE: "${userResponse}"
    
    Evaluate based on these criteria:
    - Cadence (Rhythm and pacing)
    - Language (Lexic, vocabulary choice, grammar)
    - Shock Factor (Memorability and impact)
    - Efficiency (Getting to the point, no fluff)
    ${mode === 'video' ? '- Body Language (Posture, gestures, eye contact as implied by presentation style)' : ''}

    Be encouraging but rigorous based on the difficulty level.
    Provide a significantly better version of the response the user could have given.
    Also identify specific "improvementAreas" which are high-level categories the user can focus on.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: EVALUATION_SCHEMA,
      },
    });

    if (!response.text) {
      throw new Error("No response from Gemini");
    }

    return JSON.parse(response.text.trim()) as Evaluation;
  } catch (error) {
    console.error("Evaluation error:", error);
    throw error;
  }
}
