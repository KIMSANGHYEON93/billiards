import { GoogleGenAI, Type } from "@google/genai";
import { Ball, GameState } from "../types.ts";
import { MAX_POWER } from "../constants.ts";

export interface ShotSuggestion {
  angle: number; 
  power: number; 
  spinX: number; 
  spinY: number; 
  explanation: string;
}

export async function getTutorAdvice(balls: Ball[], gameState: GameState): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const ballData = balls.map(b => ({
    type: b.type,
    position: { x: Math.round(b.pos.x), y: Math.round(b.pos.y) }
  }));

  const prompt = `
    You are a professional billiards coach. 
    Analyze the current 4-ball game state and provide one brief sentence of strategic advice.
    The goal is to hit the two red balls with the cue ball.
    
    Current state:
    - Cue Ball: ${JSON.stringify(ballData.find(b => b.type === 'white'))}
    - Opponent Ball: ${JSON.stringify(ballData.find(b => b.type === 'yellow'))}
    - Red Balls: ${JSON.stringify(ballData.filter(b => b.type.startsWith('red')))}
    - Player Scores: ${JSON.stringify(gameState.scores)} (Current Player: ${gameState.currentPlayer})
    
    Instruction: Provide a punchy, helpful tip in Korean.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text || "조준을 신중히 하세요!";
  } catch (error) {
    console.error("AI Tutor Error:", error);
    return "집중해서 다음 샷을 준비하세요.";
  }
}