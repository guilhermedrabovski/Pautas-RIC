export type QuickReminderPriority = 'alta' | 'media' | 'baixa';
export type QuickReminderScope = 'geral' | 'pessoal';

export interface QuickReminder {
  id: string;
  text: string;
  priority: QuickReminderPriority;
  scope: QuickReminderScope;
  isPinned: boolean;
  isCompleted: boolean;
  createdBy: string;
  createdByName: string;
  createdAt: number;
  updatedAt: number;
}
