
export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export enum AppStatus {
  IDLE = 'IDLE',
  LISTENING = 'LISTENING',
  GENERATING = 'GENERATING',
  EDITING = 'EDITING'
}

export interface UsageStats {
  promptTokens: number;
  candidatesTokens: number;
  totalTokens: number;
  estimatedCostEur: number;
}
