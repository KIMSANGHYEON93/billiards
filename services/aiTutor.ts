
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
    당신은 세계적인 당구 코치입니다.
    현재 4구 당구 게임의 물리적 상태를 분석하여 한 문장의 짧고 강렬한 조언을 제공하세요.
    
    조언의 핵심 내용:
    1. 두께 조절 (예: 1/2 두께로 부드럽게)
    2. 당점과 회전 (예: 상단 회전으로 밀어치기, 하단 회전으로 끌어치기)
    3. 입사각과 반사각 원리 (예: 쿠션 반사각을 이용한 횡단샷)
    
    현재 상태:
    - 수구: ${JSON.stringify(ballData.find(b => b.type === 'white'))}
    - 적구들: ${JSON.stringify(ballData.filter(b => b.type.startsWith('red')))}
    - 상대공: ${JSON.stringify(ballData.find(b => b.type === 'yellow'))}
    
    규칙: 반드시 한국어로, 선수에게 직접 말하듯 친근하면서도 전문적인 팁을 제공하세요.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text || "두께를 신중히 결정하세요!";
  } catch (error) {
    console.error("AI Tutor Error:", error);
    return "집중해서 다음 샷을 준비하세요.";
  }
}
