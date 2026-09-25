export interface Persona {
  name: string;
  voiceName: string;
}

export interface GroundingSource {
  uri: string;
  title: string;
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
  groundingSources?: GroundingSource[];
}

export interface ChatSession {
  persona: Persona;
  messages: Message[];
}
