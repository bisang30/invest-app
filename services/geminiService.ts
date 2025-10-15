// services/geminiService.ts

import { GoogleGenAI } from "@google/genai";

// FIX: @google/genai 코딩 가이드라인에 따라 API 키를 `process.env.API_KEY`에서 가져오도록 수정합니다.
// 빌드 환경이 이 변수를 올바르게 처리할 것으로 가정합니다.
// 이 변경으로 "Property 'env' does not exist on type 'ImportMeta'" 타입스크립트 오류가 해결됩니다.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });


/**
 * 주어진 프롬프트를 사용하여 Gemini AI 모델로부터 분석 결과를 비동기적으로 가져옵니다.
 * @param prompt AI 모델에 전달할 상세한 질문 또는 분석 요청 문자열입니다.
 * @returns AI가 생성한 텍스트 분석 결과 또는 오류 메시지를 담은 문자열을 반환합니다.
 */
export const getAiAnalysis = async (prompt: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return "AI 모델을 호출하는 중 오류가 발생했습니다. API 키 설정 또는 네트워크 연결을 확인해 주세요.";
  }
};
