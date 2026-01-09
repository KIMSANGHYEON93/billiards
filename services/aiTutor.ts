
import { GoogleGenAI, Type } from "@google/genai";
import { Ball, GameState } from "../types";
import { MAX_POWER } from "../constants";

export interface ShotSuggestion {
  angle: number; // 0 to 360 degrees
  power: number; // 0 to MAX_POWER
  spinX: number; // -1 to 1
  spinY: number; // -1 to 1
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

export async function getShotSuggestion(balls: Ball[], gameState: GameState): Promise<ShotSuggestion | null> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const cueBall = balls.find(b => b.type === (gameState.currentPlayer === 0 ? 'white' : 'yellow'));
  const others = balls.filter(b => b.id !== cueBall?.id);

  const prompt = `
    Calculate the best shot parameters for a billiards game.
    Table: 800x400.
    Cue Ball: ${JSON.stringify(cueBall?.pos)}
    Targets: ${JSON.stringify(others.map(o => ({ id: o.id, pos: o.pos })))}
    Game Mode: ${gameState.mode}
    
    Return a JSON object suggesting:
    - angle: direction in degrees (0 is right, 90 is down, 180 is left, 270 is up)
    - power: force value between 5 and ${MAX_POWER}
    - spinX: side spin (-1 to 1)
    - spinY: top/bottom spin (-1 to 1)
    - explanation: short Korean reason for this shot.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            angle: { type: Type.NUMBER },
            power: { type: Type.NUMBER },
            spinX: { type: Type.NUMBER },
            spinY: { type: Type.NUMBER },
            explanation: { type: Type.STRING }
          },
          required: ["angle", "power", "spinX", "spinY", "explanation"]
        }
      }
    });

    return JSON.parse(response.text || "null");
  } catch (error) {
    console.error("AI Suggestion Error:", error);
    return null;
  }
}
