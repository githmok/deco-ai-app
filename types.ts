export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  groundingMetadata?: {
    web?: { uri: string; title: string }[];
  };
}

export enum AppStatus {
  IDLE = 'IDLE',
  GENERATING_IMAGE = 'GENERATING_IMAGE',
  THINKING_CHAT = 'THINKING_CHAT',
  ERROR = 'ERROR',
}

export interface DesignState {
  originalImage: string | null;
  generatedImage: string | null;
  textureImage: string | null;
  prompt: string;
}

export interface SavedDesign {
  id: string;
  timestamp: number;
  originalImage: string;
  generatedImage: string;
  textureImage: string | null;
  prompt: string;
}