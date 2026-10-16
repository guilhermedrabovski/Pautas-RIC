export type CourtSystem = 
  | 'TJPR Projudi'
  | 'TJPR Eproc'
  | 'TRF4'
  | 'STJ'
  | 'STF'
  | 'Inquérito Policial (PCPR)'
  | 'Boletim de Ocorrência (SESP)'
  | 'Vara de Execuções (SEEU)'
  | 'Outro';

export type ProcessStage = 
  | 'Inquérito Policial'
  | 'Denúncia Oferecida'
  | 'Audiência de Custódia'
  | 'Instrução e Julgamento'
  | 'Pronúncia (Júri Marcado)'
  | 'Sentença / Condenação'
  | 'Recurso em Andamento'
  | 'Execução da Pena'
  | 'Arquivado / Extinto';

export type DefendantStatus = 
  | 'Preso Preventivo'
  | 'Prisão Temporária'
  | 'Prisão Domiciliar'
  | 'Tornozeleira Eletrônica'
  | 'Foragido'
  | 'Em Liberdade'
  | 'Condenado Cumprindo'
  | 'N/A';

export interface LegalProcess {
  id: string;
  storyId?: string;
  storyTitle?: string;
  processNumber: string;
  court: CourtSystem;
  comarca?: string;
  vara?: string;
  defendants: string;
  defendantStatus?: DefendantStatus;
  victims?: string;
  defenseLawyer?: string;
  defenseLawyerPhone?: string;
  prosecutor?: string;
  judge?: string;
  stage: ProcessStage;
  isSecret: boolean;
  nextHearingDate?: string;
  nextHearingTime?: string;
  nextHearingNotes?: string;
  summary?: string;
  documentLink?: string;
  notes?: string;
  createdBy: string;
  createdByName: string;
  createdAt: number;
  updatedAt: number;
}
