
import { GoogleGenAI } from "@google/genai";
import { SYSTEM_INSTRUCTION } from "../constants";
import { UsageStats } from "../types";

// Preus estimats per Gemini 3 Flash (per 1M tokens)
// Input: ~$0.10 -> ~€0.093
// Output: ~$0.40 -> ~€0.37
const COST_PER_1M_INPUT_EUR = 0.093;
const COST_PER_1M_OUTPUT_EUR = 0.37;

export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  }

  async generateReport(userInput: string): Promise<{ text: string; usage?: UsageStats }> {
    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: userInput,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.1,
          topP: 0.95,
          topK: 40
        },
      });

      const text = response.text || 'OK';
      const usageMetadata = (response as any).usageMetadata;

      let usage: UsageStats | undefined;
      if (usageMetadata) {
        const inputCost = (usageMetadata.promptTokenCount / 1000000) * COST_PER_1M_INPUT_EUR;
        const outputCost = (usageMetadata.candidatesTokenCount / 1000000) * COST_PER_1M_OUTPUT_EUR;
        usage = {
          promptTokens: usageMetadata.promptTokenCount,
          candidatesTokens: usageMetadata.candidatesTokenCount,
          totalTokens: usageMetadata.totalTokenCount,
          estimatedCostEur: inputCost + outputCost
        };
      }

      return { text, usage };
    } catch (error) {
      console.error("Error al generar l'informe:", error);
      return { text: "S'ha produït un error en la comunicació amb el servei." };
    }
  }
}

export const geminiService = new GeminiService();
