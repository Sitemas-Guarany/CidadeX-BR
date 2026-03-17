import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

const Privacy = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 bg-card/90 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} title="Voltar" className="p-1.5 rounded-lg hover:bg-muted transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-display font-bold text-lg">Política de Privacidade</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
        <p className="text-xs text-muted-foreground/60">Última atualização: 21 de fevereiro de 2026</p>

        <section className="space-y-2">
          <h2 className="font-display font-semibold text-base text-foreground">1. Introdução</h2>
          <p>
            O <strong className="text-foreground">CidadeX-BR</strong> ("Aplicativo") é desenvolvido e mantido por
            <strong className="text-foreground"> Sistemas Guarany</strong> ("nós", "nosso"). Esta Política de Privacidade
            descreve como coletamos, usamos, armazenamos e protegemos suas informações pessoais em conformidade com a
            Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-display font-semibold text-base text-foreground">2. Dados que coletamos</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-foreground">Dados de cadastro:</strong> nome, e-mail, telefone e foto de perfil fornecidos voluntariamente.</li>
            <li><strong className="text-foreground">Dados de uso:</strong> cidade selecionada, preferências de tema, abas visitadas e interações dentro do app.</li>
            <li><strong className="text-foreground">Dados financeiros:</strong> registros de receitas/despesas e contas criadas pelo próprio usuário, armazenados de forma criptografada.</li>
            <li><strong className="text-foreground">Dados de agenda:</strong> compromissos e listas de compras criados pelo usuário.</li>
            <li><strong className="text-foreground">Mensagens:</strong> conteúdo de chats diretos, grupos e publicações na rede social local.</li>
            <li><strong className="text-foreground">Dados técnicos:</strong> endereço IP, user-agent do navegador e logs de acesso para segurança.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-display font-semibold text-base text-foreground">3. Finalidade do tratamento</h2>
          <p>Utilizamos seus dados para:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Fornecer e personalizar as funcionalidades do Aplicativo.</li>
            <li>Autenticar sua identidade e proteger sua conta.</li>
            <li>Exibir informações relevantes sobre a cidade selecionada.</li>
            <li>Permitir a comunicação entre usuários (chat, grupos, posts).</li>
            <li>Gerar relatórios financeiros e de agenda sob sua solicitação.</li>
            <li>Melhorar a segurança e estabilidade do Aplicativo.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-display font-semibold text-base text-foreground">4. Compartilhamento de dados</h2>
          <p>
            <strong className="text-foreground">Não vendemos</strong> seus dados pessoais. Compartilhamos informações apenas:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Com provedores de infraestrutura (hospedagem e banco de dados) necessários para operar o serviço.</li>
            <li>Quando exigido por lei ou ordem judicial.</li>
            <li>Com outros usuários, apenas o conteúdo que você publicar voluntariamente (posts, mensagens de grupo).</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-display font-semibold text-base text-foreground">5. Armazenamento e segurança</h2>
          <p>
            Seus dados são armazenados em servidores seguros com criptografia em trânsito (TLS) e em repouso.
            Implementamos políticas de segurança em nível de linha (RLS) no banco de dados para garantir que
            cada usuário acesse apenas seus próprios dados.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-display font-semibold text-base text-foreground">6. Seus direitos (LGPD)</h2>
          <p>Você tem direito a:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-foreground">Acesso:</strong> solicitar uma cópia dos dados que armazenamos sobre você.</li>
            <li><strong className="text-foreground">Correção:</strong> atualizar dados incorretos ou desatualizados.</li>
            <li><strong className="text-foreground">Exclusão:</strong> solicitar a remoção de seus dados pessoais.</li>
            <li><strong className="text-foreground">Portabilidade:</strong> exportar seus dados (PDF, backup).</li>
            <li><strong className="text-foreground">Revogação:</strong> retirar seu consentimento a qualquer momento.</li>
          </ul>
          <p>
            Para exercer seus direitos, entre em contato pelo WhatsApp{" "}
            <a href="https://wa.me/5585996496064" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              (85) 99649-6064
            </a>.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-display font-semibold text-base text-foreground">7. Cookies e armazenamento local</h2>
          <p>
            Utilizamos armazenamento local do navegador (localStorage) para salvar preferências de tema e cidade.
            Não utilizamos cookies de rastreamento de terceiros.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-display font-semibold text-base text-foreground">8. Alterações nesta política</h2>
          <p>
            Podemos atualizar esta política periodicamente. A versão mais recente estará sempre disponível nesta página.
            Alterações significativas serão comunicadas dentro do Aplicativo.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-display font-semibold text-base text-foreground">9. Contato</h2>
          <p>
            <strong className="text-foreground">Sistemas Guarany</strong><br />
            E-mail:{" "}
            <a href="mailto:cidadexbr@gmail.com" className="text-primary hover:underline">
              cidadexbr@gmail.com
            </a><br />
            WhatsApp:{" "}
            <a href="https://wa.me/5585996496064" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              (85) 99649-6064
            </a>
          </p>
        </section>

        <div className="pt-4 border-t border-border/30 text-center text-xs text-muted-foreground/50">
          © 2026 CidadeX-BR · Sistemas Guarany
        </div>
      </main>
    </div>
  );
};

export default Privacy;
