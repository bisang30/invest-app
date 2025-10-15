// services/geminiService.ts

import { GoogleGenAI } from "@google/genai";

// FIX: 브라우저 환경(Vercel, AI Studio 등)에서 API 키를 올바르게 참조하도록 수정합니다.
// `process.env`는 일반적으로 Node.js 서버 환경에서 사용됩니다. 브라우저에서 실행되는 웹 앱의 경우,
// Vite와 같은 빌드 도구는 보안을 위해 `VITE_` 접두사가 붙은 환경 변수만 `import.meta.env` 객체를 통해 노출합니다.
// 이 코드는 `VITE_API_KEY`라는 이름으로 설정된 환경 변수를 사용하도록 변경되었습니다.
// `(import.meta as any)` 구문은 TypeScript가 `import.meta.env` 타입을 인식하지 못하는 경우를 대비한 것입니다.
const apiKey = (import.meta as any).env.VITE_API_KEY;

// API 키가 존재할 때만 AI 클라이언트를 초기화합니다.
const ai = apiKey ? new GoogleGenAI({ apiKey: apiKey }) : null;

/**
 * 주어진 프롬프트를 사용하여 Gemini AI 모델로부터 분석 결과를 비동기적으로 가져옵니다.
 * @param prompt AI 모델에 전달할 상세한 질문 또는 분석 요청 문자열입니다.
 * @returns AI가 생성한 텍스트 분석 결과 또는 오류 메시지를 담은 문자열을 반환합니다.
 */
export const getAiAnalysis = async (prompt: string): Promise<string> => {
  // AI 클라이언트가 초기화되지 않았으면(API 키가 없음) 오류 메시지를 반환합니다.
  if (!ai) {
    const errorMessage = "API 키가 설정되지 않았습니다. AI Studio의 'Secrets' 메뉴 또는 Vercel과 같은 배포 환경의 변수 설정에서 `VITE_API_KEY`라는 이름으로 키를 설정했는지 확인해주세요.";
    console.error(errorMessage);
    return errorMessage;
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return "AI 모델을 호출하는 중 오류가 발생했습니다. API 키가 올바른지, 네트워크 연결 상태가 양호한지 확인해 주세요.";
  }
};