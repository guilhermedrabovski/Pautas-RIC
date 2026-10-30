export type CourtSystem = 
  | 'TJPR Projudi'
  | 'TJPR Eproc'
  | 'TRF4'
  | 'PCPR (Inquérito)'
  | 'Justiça Federal'
  | 'Outro'
  | string;

export interface LegalProcess {
  id: string;
  caseName?: string; // Nome do caso na TV (ex: Caso Daniel, Morte no Uberaba)
  storyId?: string; // Vínculo opcional com História
  storyTitle?: string;
  processNumber: string; // Número CNJ ou do Inquérito
  court?: CourtSystem; // TJPR Projudi, TJPR Eproc, PCPR, etc.
  defendants?: string; // Réu(s) / Investigado(s)
  defendantStatus?: string; // Status simples: Preso, Em Liberdade, Foragido, etc.
  notes?: string; // Anotações da TV / Situação rápida
  comarca?: string;
  vara?: string;
  createdAt: number;
  updatedAt?: number;
  createdBy?: string;
  createdByName?: string;
  // Campos legados para compatibilidade com registros existentes no Firestore:
  stage?: string;
  victims?: string;
  defenseLawyer?: string;
  defenseLawyerPhone?: string;
  prosecutor?: string;
  judge?: string;
  isSecret?: boolean;
  nextHearingDate?: string;
  nextHearingTime?: string;
  nextHearingNotes?: string;
  summary?: string;
  documentLink?: string;
}
