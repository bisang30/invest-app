// services/geminiService.ts - 수정된 최종 버전

import { GoogleGenAI } from "@google/genai";

// FIX: Refactored to adhere to Gemini API guidelines. The API key must be sourced exclusively from `process.env.API_KEY`.
// The previous method of reading from `window.GEMINI_API_KEY` violates the usage policy.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });


// --- 이 아래는 기존에 있던 AI 관련 함수들을 그대로 두거나 추가하면 됩니다. ---
// 예시:
export const getSimpleAiResponse = async (prompt: string) => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return "AI 모델을 호출하는 중 오류가 발생했습니다.";
  }
};
