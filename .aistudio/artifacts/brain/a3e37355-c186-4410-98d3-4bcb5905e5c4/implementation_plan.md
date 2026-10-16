# Sistema de Lembretes Rápidos na Dashboard

Um sistema de avisos e lembretes rápidos dinâmicos integrado à Dashboard do Grupo RIC, permitindo que repórteres, editores, pauteiros e coordenadores criem notas com diferentes níveis de prioridade, definam escopo (pessoal ou para toda a equipe), fixem avisos urgentes no topo e marquem conclusões de forma ágil e proeminente.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> **Decisões confirmadas pelo usuário:**
> 1. **Escopo dos Lembretes**: Opção de escolha entre lembrete **Pessoal** (visível apenas para o autor) ou **Geral** (mural compartilhado com toda a equipe da redação).
> 2. **Posicionamento**: Localizado em destaque **no topo da Dashboard**, logo abaixo da barra de boas-vindas e do status de rotina, garantindo visibilidade imediata.
> 3. **Ações Interativas**: Criação ágil com prioridade (*Alta*, *Média*, *Baixa*), marcação de **concluído** (com riscado e feedback visual), **exclusão** e **fixação no topo** (pin).

---

## 1. Overview & Core Concept

- **O que faz**: Permite o registro instantâneo de recados, lembretes operacionais e avisos importantes de plantão diretamente na tela inicial, sem fricção.
- **Público-alvo**: Editores de imagem, coordenadores de pauta, repórteres e estagiários.
- **Valor agregado**: Elimina a perda de comunicados urgentes da redação (ex: "Coletiva do governador antecipada para 11h" ou "Cuidar com o áudio do link 2"), organizando por urgência e permitindo que cada jornalista também anote seus próprios afazeres diários.

---

## 2. User Experience & Visual Design

### A. Fluxo do Usuário
1. **Visualização Imediata**: No topo da página inicial, um card de alta presença com o título **"📌 Lembretes Rápidos"**, filtros rápidos (*Todos*, *Mural da Redação*, *Meus Lembretes*) e botão **"+ Novo Lembrete"**.
2. **Criação Rápida**: Formulário inline / modal limpo com:
   - Texto do lembrete (com sugestões de placeholders dinâmicos).
   - Seletor de prioridade em 3 botões estilizados:
     - 🔴 **Alta Prioridade**: Borda vermelha vibrante, ideal para deadlines críticos e plantões.
     - 🟡 **Média Prioridade**: Destaque âmbar/amarelo, para avisos de rotina importantes.
     - 🔵 **Baixa Prioridade**: Tom neutro/azul suave, para anotações gerais.
   - Alternador de visibilidade: **Mural da Redação (Público)** ou **Apenas Meu (Privado)**.
   - Opção de **Fixar no topo** 📌.
3. **Gestão dos Cards**:
   - Checkbox para concluir com transição suave e texto riscado.
   - Botão de fixar/desafixar no topo com feedback tátil.
   - Botão de exclusão (com confirmação ou clique direto para o criador/admin).
   - Indicação de quem criou e horário tabular (`font-mono`).

### B. Hierarquia Visual e Identidade
- **Bordas & Cores**:
  - Alta: Borda lateral esquerda sólida `border-l-4 border-l-red-600` e fundo levemente avermelhado `bg-red-50/30`.
  - Média: `border-l-4 border-l-amber-500` e fundo `bg-amber-50/20`.
  - Baixa: `border-l-4 border-l-slate-400` e fundo `bg-white`.
- **Tipografia**:
  - Títulos e tags sem pills estáticas genéricas; uso de separadores tipográficos limpos (`·`).
  - Horários em fonte tabular monoespaçada (`font-mono text-[11px]`).

---

## 3. Key Product Decisions & Trade-Offs

- **Coleção dedicada no Firestore (`quickReminders`)**:
  - *Abordagem*: Criar a coleção `quickReminders` separada da coleção de `reminders` existente (que é focada em envio direcionado 1:1 com destinatário `toId`).
  - *Motivo*: Evita acoplamento ou conflito de regras de segurança com notificações diretas e permite ordenação eficiente por `isPinned desc, createdAt desc`.
- **Tempo Real via Firestore `onSnapshot`**:
  - *Abordagem*: Atualizações instantâneas sem necessidade de recarregar a página para que todos na redação vejam os novos avisos imediatamente.
- **Segurança e Permissões**:
  - Todos autenticados podem ler lembretes públicos ou os seus próprios privados.
  - Administradores e criadores podem editar/excluir.

---

## 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                       Dashboard.tsx                         │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Welcome Bar & Action (+ Atribuir Pauta)               │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 📌 QuickRemindersWidget (Novo Componente)             │  │
│  │  - Filtros: [Todos] [Mural da Redação] [Meus]         │  │
│  │  - Form Rápido: Texto, Prioridade, Escopo, Fixar      │  │
│  │  - Grid de Cards: Prioridade Alta, Média, Baixa       │  │
│  │  - Ações: Toggle Concluir, Pin/Unpin, Excluir         │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ EditorWorkloadWidget (Status Ilhas de Edição)         │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Acesso Rápido & Pautas Recentes da Redação            │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                               ▲
                               │ Real-time onSnapshot
                               ▼
            ┌──────────────────────────────────────┐
            │   Firestore: quickReminders          │
            │   - text, priority, scope            │
            │   - isPinned, isCompleted            │
            │   - createdBy, createdByName         │
            │   - createdAt, updatedAt             │
            └──────────────────────────────────────┘
```

### Modelo de Dados (`QuickReminder`)
```typescript
export interface QuickReminder {
  id: string;
  text: string;
  priority: 'alta' | 'media' | 'baixa';
  scope: 'geral' | 'pessoal';
  isPinned: boolean;
  isCompleted: boolean;
  createdBy: string;
  createdByName: string;
  createdAt: number;
  updatedAt: number;
}
```

### Regras de Segurança (`firestore.rules`)
Adicionar suporte completo à coleção `quickReminders`:
```firestore
match /quickReminders/{reminderId} {
  allow read: if isSignedIn();
  allow create: if isSignedIn();
  allow update: if isSignedIn();
  allow delete: if isSignedIn();
}
```

---

## 5. Etapas de Implementação

1. **Regras de Segurança (`firestore.rules`)**:
   - Adicionar permissões para `quickReminders` e realizar deploy das regras.
2. **Criação do Componente `QuickRemindersWidget.tsx`**:
   - Implementar lista em tempo real ordenada por pin e data.
   - Criar formulário de criação com seleção intuitiva de prioridade (*Alta*, *Média*, *Baixa*) e escopo (*Mural Geral* vs *Pessoal*).
   - Adicionar botões de fixar no topo, marcar conclusão e excluir.
3. **Integração na `Dashboard.tsx`**:
   - Inserir o `QuickRemindersWidget` logo abaixo da barra de boas-vindas no topo da página.
4. **Verificação & Testes**:
   - Validar com `compile_applet` e `lint_applet` sem erros.
