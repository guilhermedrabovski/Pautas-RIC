export type RoutineResponseType = 'text' | 'number' | 'none';

export interface InternRoutineItem {
  id: string;
  title: string;
  description?: string;
  responseType: RoutineResponseType;
  responsePlaceholder?: string;
  required?: boolean;
}

export interface InternRoutineTemplate {
  items: InternRoutineItem[];
  updatedAt?: number;
  updatedBy?: string;
}

export interface InternRoutineRun {
  id: string; // `${dateStr}_${internUid}`
  date: string; // YYYY-MM-DD
  internUid: string;
  internName: string;
  completedItemIds: string[];
  responses: Record<string, string | number>;
  notes?: string;
  isCompleted?: boolean;
  completedAt?: number;
  updatedAt: number;
}

export const DEFAULT_INTERN_ROUTINE_ITEMS: InternRoutineItem[] = [
  {
    id: 'check-pages',
    title: 'Checar páginas',
    description: 'Navegar pelos principais portais locais, redes sociais e sites de notícias para identificar tendências e fatos relevantes.',
    responseType: 'text',
    responsePlaceholder: 'Espaço para colocar o que achou de mais relevante nas páginas...',
    required: false,
  },
  {
    id: 'check-whatsapp',
    title: 'Checar WhatsApp',
    description: 'Conferir mensagens recebidas dos telespectadores, grupos de fontes e canais da redação.',
    responseType: 'number',
    responsePlaceholder: 'Quantas potenciais pautas encontradas?',
    required: false,
  },
  {
    id: 'clear-mobile-messages',
    title: 'Apagar mensagens celular',
    description: 'Fazer a limpeza das conversas e mídias pesadas temporárias no celular da TV.',
    responseType: 'none',
    required: false,
  },
  {
    id: 'review-police-round',
    title: 'Conferir ronda policial e bombeiros',
    description: 'Checar canais e ocorrências da Polícia Militar, Rodoviária, Polícia Civil e Corpo de Bombeiros.',
    responseType: 'text',
    responsePlaceholder: 'Espaço para resumo das principais ocorrências...',
    required: false,
  },
  {
    id: 'update-agendas-system',
    title: 'Alimentar sistema de pautas e WhatsApp Sugestões',
    description: 'Registrar as melhores ideias e sugestões na Central para a equipe de pauteiros e editores.',
    responseType: 'none',
    required: false,
  }
];
