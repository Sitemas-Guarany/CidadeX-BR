

## Plano: Adicionar aba "MeuRemédio" para Controle de Medicação

### Visao Geral

Nova sub-aba "MeuRemédio" dentro da Agenda, ao lado de Compromissos, Compras, Notas e Dicionário. Permite cadastrar medicamentos com busca via IA, definir horários, frequência, duração do tratamento, dias da semana, instruções, médico responsável e controle de suspensão/retomada.

---

### 1. Banco de Dados

**Tabela `doctors`** (médicos cadastrados pelo usuário):

| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid NOT NULL | ref auth.users |
| name | text NOT NULL | |
| phone | text | |
| mobile | text | |
| address | text | |
| created_at | timestamptz | default now() |

- RLS: `auth.uid() = user_id` para SELECT, INSERT, UPDATE, DELETE
- Trigger de limite: max 20 médicos por usuário
- UNIQUE(user_id, name)

**Tabela `medications`** (medicamentos do usuário):

| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid NOT NULL | ref auth.users |
| name | text NOT NULL | nome do remédio |
| concentration | text | ex: "500mg", "10ml" |
| frequency | text NOT NULL | valor do combobox |
| schedule_time | text NOT NULL | horário principal (HH:MM) |
| icon | text | emoji ou código do ícone |
| instructions | text | instruções de uso |
| start_date | date NOT NULL | data de início |
| duration_type | text NOT NULL | 'ongoing' ou 'fixed_days' |
| duration_days | integer | num dias (quando fixed_days) |
| weekdays | jsonb | array de dias: [0,1,2,3,4,5,6] ou null (todos) |
| doctor_id | uuid | ref doctors.id |
| suspended | boolean default false | controle de suspensão |
| suspended_at | timestamptz | quando foi suspenso |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

- RLS: `auth.uid() = user_id` para SELECT, INSERT, UPDATE, DELETE
- Trigger de limite: max 50 medicamentos por usuário

---

### 2. Edge Function `search-medication`

Nova edge function que usa Gemini (via Lovable AI) para buscar informações sobre medicamentos:
- Recebe nome parcial do medicamento
- Retorna sugestões com nome completo, concentrações comuns, classe terapêutica e instruções de uso padrão
- Modelo: `google/gemini-2.5-flash-lite` (rápido e barato para busca simples)

---

### 3. Componente `MedicationsSection.tsx`

Novo componente em `src/components/agenda/MedicationsSection.tsx`:

**Listagem:**
- Cards com ícone, nome, concentração, frequência, horário e status (ativo/suspenso)
- Indicador visual de tratamento em andamento vs. finalizado
- Botões de editar, suspender/retomar e excluir (com AlertDialog)

**Formulário de cadastro/edição (modal):**
- Nome do remédio com campo de busca via IA (autocomplete)
- Concentração (campo texto)
- Horário (time picker)
- Frequência (combobox com as opções especificadas)
- Data de início (DateInput existente)
- Duração: checkbox "Tratamento em andamento" vs "Número de dias" (abre campo numérico)
- Dias: checkbox "Todos os dias" vs "Dias da semana" (abre checkboxes Seg-Dom)
- Ícone do medicamento (seletor de emojis: 💊💉🩹🧴🫁 etc.)
- Instruções (textarea)
- Médico responsável (combobox com cadastro rápido inline de nome, telefone, celular, endereço)

**Suspensão/Retomada:**
- Botão que alterna entre suspender e retomar o medicamento
- Confirmação via AlertDialog (regra #13 do sistema)

---

### 4. Alterações em `AgendaSection.tsx`

- Expandir tipo de `agendaTab` para incluir `"remedios"`
- Adicionar botão "MeuRemédio" na barra de sub-abas (ícone `Pill` do lucide)
- Lazy load e renderização condicional do `MedicationsSection`

---

### 5. Detalhes Técnicos

- Todos os botões terão atributo `title` (regra #19)
- Ações destrutivas com AlertDialog (regra #13)
- DateInput para campos de data (regra #18)
- Edge function com CORS, tratamento de erros 429/402
- LOVABLE_API_KEY já disponível, sem necessidade de configuração adicional
- `verify_jwt = false` no config.toml para a nova edge function
- Versão atualizada para 1.6.2

