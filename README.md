# CidadeX — Plataforma Cidadã Brasileira

Aplicação web progressiva (PWA) focada em cidades cearenses, oferecendo informações urbanas, rede social local, navegação, agenda pessoal e comunicação em tempo real.

---

## 🛠 Stack Tecnológica

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| Estilização | Tailwind CSS + shadcn/ui |
| Backend | Supabase — banco PostgreSQL, auth, storage, realtime, edge functions |
| Mapas | Leaflet + React-Leaflet |
| PWA | vite-plugin-pwa |

---

## 📁 Estrutura de Pastas

```
src/
├── assets/                  # Imagens estáticas (brasões, screenshots)
├── config/                  # Configurações do domínio
│   ├── cities.ts            # Dados das cidades suportadas
│   └── version.ts           # Controle de versão do app
│
├── components/
│   ├── ui/                  # 🔷 GENÉRICO — Componentes shadcn/ui reutilizáveis
│   │   ├── button.tsx
│   │   ├── dialog.tsx
│   │   ├── input.tsx
│   │   ├── card.tsx
│   │   └── ... (40+ componentes)
│   │
│   ├── common/              # 🔷 GENÉRICO — Componentes reutilizáveis do sistema
│   │   ├── GlobalErrorBoundary.tsx   # Error boundary global
│   │   ├── UpdatePrompt.tsx          # Prompt de atualização PWA
│   │   ├── ProtectedRoute.tsx        # Guard de rotas autenticadas
│   │   ├── Watermark.tsx             # Marca d'água
│   │   ├── NavLink.tsx               # Link de navegação
│   │   ├── NotificationsBell.tsx     # Sino de notificações
│   │   ├── BannerTicker.tsx          # Banner rotativo
│   │   ├── ImageCropModal.tsx        # Recorte de imagem
│   │   ├── EmojiReactions.tsx        # Reações com emoji
│   │   └── ForwardMessageModal.tsx   # Modal de encaminhamento
│   │
│   ├── city/                # 🟢 ESPECÍFICO — Módulo de informações da cidade
│   │   ├── CitySelector.tsx          # Seletor de cidade
│   │   ├── CityInfo.tsx              # Dados gerais da cidade
│   │   ├── CityMap.tsx               # Mapa interativo
│   │   ├── BairrosSection.tsx        # Bairros
│   │   ├── RuasSection.tsx           # Ruas e logradouros
│   │   ├── WeatherSection.tsx        # Clima/tempo
│   │   ├── PlacesSection.tsx         # Pontos de interesse
│   │   ├── EventsSection.tsx         # Eventos locais
│   │   └── NewsSection.tsx           # Notícias da cidade
│   │
│   ├── social/              # 🟢 ESPECÍFICO — Módulo social e comunicação
│   │   ├── SocialSection.tsx         # Feed social / timeline
│   │   ├── DirectChat.tsx            # Chat direto 1:1
│   │   ├── GroupsSection.tsx         # Grupos de chat
│   │   ├── ContactsSection.tsx       # Lista de contatos
│   │   ├── VoiceCallProvider.tsx     # Chamadas de voz/vídeo (WebRTC)
│   │   └── AIChat.tsx                # Assistente IA da cidade
│   │
│   ├── navigation/          # 🟢 ESPECÍFICO — Módulo de navegação urbana
│   │   ├── RoutePanel.tsx            # Painel de rotas
│   │   ├── StepByStepPanel.tsx       # Navegação passo a passo
│   │   ├── LocationSearch.tsx        # Busca de localização
│   │   ├── PoiSearch.tsx             # Busca de pontos de interesse
│   │   ├── StreetPicker.tsx          # Seletor de rua
│   │   ├── TrafficAlertsSection.tsx  # Alertas de trânsito
│   │   ├── NavigationFullscreen.tsx   # Navegação GPS fullscreen (HUD)
│   │   ├── speedCameras.ts           # Detecção de radares (Overpass API)
│   │   ├── types.ts                  # Tipos do módulo
│   │   └── utils.ts                  # Utilitários do módulo
│   │
│   ├── agenda/              # 🟢 ESPECÍFICO — Módulo de agenda pessoal
│   │   └── AgendaSection.tsx         # Agenda com tarefas e compromissos
│   │
│   ├── admin/               # 🟢 ESPECÍFICO — Módulo administrativo
│   │   ├── DataManagement.tsx        # Gerenciamento de dados
│   │   └── InviteSection.tsx         # Sistema de convites
│   │
│   ├── auth/                # 🟢 ESPECÍFICO — Módulo de autenticação
│   │   └── ChangePasswordSection.tsx # Alteração de senha
│   │
│   └── NavigationSection.tsx # Navegação principal (mapas)
│
├── hooks/
│   ├── use-mobile.tsx       # 🔷 Detecção de dispositivo móvel
│   ├── use-toast.ts         # 🔷 Hook de notificações toast
│   ├── useAuth.tsx          # 🟢 Autenticação do usuário
│   ├── useAdmin.ts          # 🟢 Verificação de permissão admin
│   ├── useProfile.tsx       # 🟢 Perfil do usuário
│   └── useContentProtection.ts # 🟢 Proteção de conteúdo
│
├── integrations/
│   └── supabase/            # Cliente e tipos do backend (auto-gerado)
│
├── lib/
│   ├── utils.ts             # Utilitários genéricos (cn, etc.)
│   └── accessLog.ts         # Log de acesso
│
├── pages/
│   ├── Index.tsx            # Página principal com abas
│   ├── Auth.tsx             # Login / Cadastro
│   ├── Profile.tsx          # Perfil do usuário
│   ├── Admin.tsx            # Painel administrativo
│   ├── NavegacaoTelaCheiaPage.tsx # Navegação GPS tela cheia (/navegar)
│   ├── Help.tsx             # Ajuda
│   ├── Install.tsx          # Instalação do PWA
│   ├── ResetPassword.tsx    # Recuperação de senha
│   └── NotFound.tsx         # 404
│
└── main.tsx                 # Entry point

supabase/
└── functions/               # Edge Functions (backend serverless)
    ├── auto-backup/         # Backup automático
    ├── city-assistant/      # Assistente IA da cidade
    ├── fetch-bus-schedules/ # Horários de ônibus
    ├── fetch-events/        # Eventos
    ├── fetch-news/          # Notícias
    ├── fetch-places/        # Pontos de interesse
    ├── protected-content/   # Conteúdo protegido
    ├── track-referral/      # Rastreamento de convites
    └── transcribe-audio/    # Transcrição de áudio
```

---

## 🔑 Princípios de Organização

### Genérico (🔷) vs Específico (🟢)

| Tipo | Pasta | Descrição |
|------|-------|-----------|
| 🔷 Genérico | `components/ui/` | Componentes shadcn/ui — reutilizáveis em qualquer projeto |
| 🔷 Genérico | `components/common/` | Componentes utilitários do app (error boundary, guards, modais) |
| 🔷 Genérico | `hooks/use-*.ts` | Hooks utilitários sem lógica de domínio |
| 🟢 Específico | `components/city/` | Tudo sobre informações e dados da cidade |
| 🟢 Específico | `components/social/` | Rede social, chat, chamadas, contatos |
| 🟢 Específico | `components/navigation/` | Navegação urbana, rotas, trânsito |
| 🟢 Específico | `components/agenda/` | Agenda e compromissos pessoais |
| 🟢 Específico | `components/admin/` | Funcionalidades administrativas |
| 🟢 Específico | `config/` | Configurações de domínio (cidades, versão) |
| 🟢 Específico | `supabase/functions/` | Lógica de backend (Edge Functions) |

---

## 🏗 Arquitetura

```
┌──────────────────────────────────┐
│         Frontend (React)         │
│  ┌────────┬─────────┬─────────┐  │
│  │ Cidade │ Social  │ Agenda  │  │
│  │  Info  │  Chat   │ Tarefas │  │
│  │  Mapa  │ Grupos  │         │  │
│  │ Clima  │ Chamada │         │  │
│  └────┬───┴────┬────┴────┬────┘  │
│       │        │         │       │
│  ┌────┴────────┴─────────┴────┐  │
│  │   Hooks / Context / State  │  │
│  └────────────┬───────────────┘  │
└───────────────┼──────────────────┘
                │ HTTPS / WebSocket / WebRTC
┌───────────────┼──────────────────┐
│  ┌────────────┴───────────────┐  │
│  │  Lovable Cloud (Backend)   │  │
│  │     Supabase (Backend)      │  │
│  │  • Auth (email/senha)      │  │
│  │  • Database (PostgreSQL)   │  │
│  │  • Storage (arquivos)      │  │
│  │  • Realtime (chat/sinais)  │  │
│  │  • Edge Functions (APIs)   │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘
```

---

## 📱 Funcionalidades Principais

- **Cidades**: Informações, mapa, bairros, ruas, clima, lugares, eventos e notícias
- **Social**: Feed com posts, curtidas, reações emoji, repost e comentários
- **Chat**: Mensagens diretas e grupos com texto, imagem, áudio e vídeo
- **Chamadas**: Voz e vídeo via WebRTC com sinalização por banco em tempo real
- **Navegação**: Estilo Waze — mapa fullscreen, "Para onde?", rota com voz, radares, alertas comunitários, tela cheia GPS dedicada (`/navegar`)
- **Agenda**: Compromissos pessoais com categorias, lembretes, dicionário, medicamentos e lista de compras
- **Finanças**: Controle financeiro pessoal com contas, categorias e relatórios
- **IA**: Assistente virtual por cidade (powered by Supabase Edge Functions)
- **PWA**: Instalável, funciona offline parcialmente, auto-update com skipWaiting

---

## 🚀 Desenvolvimento Local

```bash
git clone https://github.com/cidadexbr-oss/CidadeX-BR.git
cd CidadeX-BR
npm install
npm run dev
```

Variáveis de ambiente necessárias (`.env`):
```
VITE_SUPABASE_URL=<sua_url>
VITE_SUPABASE_PUBLISHABLE_KEY=<sua_chave_anon>
```

## 🌐 Deploy

**Hosting**: Vercel (https://www.cidadex-br.com)

```bash
npx vercel           # Preview deploy (gera URL temporária para teste)
npx vercel --prod    # Production deploy
```

O push para `main` também dispara deploy no Vercel.

**Atualizar versão**: editar `src/config/version.ts` e `public/version.json`.

---

## 📄 Licença

Projeto privado — todos os direitos reservados. Sistemas Guarany.
