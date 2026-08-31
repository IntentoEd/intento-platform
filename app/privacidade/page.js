import Link from 'next/link';

export const metadata = {
  title: 'Política de Privacidade | Intento',
};

const sectionTitle = 'text-base font-bold text-intento-blue mt-8 mb-3';
const subTitle = 'text-sm font-semibold text-intento-blue mt-5 mb-2';
const paragraph = 'text-sm text-slate-700 leading-relaxed mb-3';
const list = 'list-disc list-inside text-sm text-slate-700 leading-relaxed mb-3 space-y-1';

export default function Privacidade() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-2">
        <div className="w-1 h-5 bg-intento-yellow rounded-sm" />
        <span className="font-bold text-intento-blue text-sm tracking-wider">INTENTO</span>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-800 mb-6">
          <strong>Documento em revisão jurídica.</strong> Este texto é uma versão preliminar e está em
          processo de revisão por assessoria jurídica especializada. Em caso de dúvida sobre a versão vigente,
          entre em contato com o Encarregado de Dados (DPO) pelos meios indicados ao final.
        </div>

        <h1 className="text-2xl font-bold text-intento-blue">Política de Privacidade</h1>
        <p className="text-xs text-slate-500 font-medium mt-1 mb-4">Última atualização: 27 de abril de 2026</p>

        <p className={paragraph}>
          A <strong>Intento Grupo Educacional LTDA</strong> (&quot;Intento&quot;, &quot;nós&quot;) é a
          controladora dos dados pessoais tratados na plataforma de mentoria educacional acessada por meio
          do site e aplicativo da Intento (&quot;Plataforma&quot;). Esta Política descreve como coletamos,
          usamos, compartilhamos, armazenamos e protegemos seus dados pessoais, em conformidade com a
          Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — &quot;LGPD&quot;).
        </p>

        <h2 className={sectionTitle}>1. Quem é o controlador</h2>
        <p className={paragraph}>
          <strong>INTENTO GRUPO EDUCACIONAL LTDA</strong>
          <br />
          CNPJ: 49.929.921/0001-22
          <br />
          Endereço: SIA Trecho 3, Lote 1310/1320, Sala 325, Parte A41 — Brasília/DF
        </p>

        <h2 className={sectionTitle}>2. Quais dados coletamos</h2>

        <h3 className={subTitle}>2.1. Dados fornecidos diretamente por você</h3>
        <ul className={list}>
          <li><strong>Identificação:</strong> nome completo, data de nascimento, e-mail, telefone.</li>
          <li><strong>Localização:</strong> cidade e estado.</li>
          <li><strong>Perfil acadêmico:</strong> escolaridade, cursos e vestibulares de interesse, notas de provas anteriores, histórico de estudos.</li>
          <li><strong>Hábitos de estudo:</strong> respostas a questionários sobre métodos de estudo, sono, atenção e revisão.</li>
          <li><strong>Dados de mentoria:</strong> registros semanais de horas estudadas, metas, indicadores emocionais, anotações de encontros.</li>
          <li><strong>Dados financeiros e de responsável:</strong> nome do responsável financeiro, dados de pagamento (quando aplicável).</li>
        </ul>

        <h3 className={subTitle}>2.2. Dados coletados automaticamente</h3>
        <ul className={list}>
          <li><strong>Dados de acesso:</strong> endereço IP, tipo de dispositivo, navegador, sistema operacional, timestamps de acesso.</li>
          <li><strong>Cookies e tecnologias similares:</strong> usados estritamente para autenticação, manutenção de sessão e funcionamento básico da Plataforma.</li>
        </ul>

        <h2 className={sectionTitle}>3. Por que tratamos seus dados (finalidades) e bases legais</h2>
        <ul className={list}>
          <li><strong>Execução do contrato de mentoria:</strong> prestar o serviço de acompanhamento educacional, agendar encontros, acompanhar progresso (art. 7º, V da LGPD).</li>
          <li><strong>Cumprimento de obrigação legal/regulatória:</strong> emissão de notas fiscais, retenção de registros fiscais (art. 7º, II).</li>
          <li><strong>Consentimento do titular:</strong> envio de comunicações de marketing, programa de indicação, uso de imagem em depoimentos (art. 7º, I).</li>
          <li><strong>Legítimo interesse:</strong> melhoria da Plataforma, prevenção a fraudes, segurança da informação (art. 7º, IX).</li>
          <li><strong>Proteção do crédito:</strong> análise de inadimplência (art. 7º, X).</li>
        </ul>

        <h2 className={sectionTitle}>4. Tratamento de dados de menores de 18 anos</h2>
        <p className={paragraph}>
          A Plataforma atende alunos que podem ser menores de idade (vestibulandos a partir do 1º ano do
          Ensino Médio). Para tratar dados pessoais de adolescentes (entre 12 e 18 anos), exigimos o
          consentimento específico e em destaque de pelo menos um dos pais ou do responsável legal,
          conforme art. 14 da LGPD. O responsável legal pode, a qualquer momento, revogar o consentimento
          ou solicitar a exclusão dos dados do menor.
        </p>

        <h2 className={sectionTitle}>5. Com quem compartilhamos</h2>
        <p className={paragraph}>
          Compartilhamos dados pessoais apenas com operadores e parceiros estritamente necessários à
          execução do serviço, sob obrigações contratuais de confidencialidade e proteção de dados:
        </p>
        <ul className={list}>
          <li><strong>Mentores credenciados pela Intento:</strong> acessam dados acadêmicos e de mentoria do aluno designado a eles.</li>
          <li><strong>Google (Firebase, Apps Script, Drive, Gmail):</strong> autenticação, armazenamento de dados de mentoria, envio de e-mails transacionais.</li>
          <li><strong>Vercel:</strong> hospedagem da Plataforma.</li>
          <li><strong>Plataformas de pagamento e contrato:</strong> processamento de mensalidades e assinatura de contratos (quando aplicável).</li>
          <li><strong>Autoridades públicas:</strong> mediante ordem judicial ou requisição legal.</li>
        </ul>
        <p className={paragraph}>
          A Intento não vende, aluga ou cede seus dados pessoais a terceiros para fins comerciais.
        </p>

        <h2 className={sectionTitle}>6. Transferência internacional</h2>
        <p className={paragraph}>
          Alguns operadores (Google, Vercel) podem armazenar dados em servidores localizados fora do Brasil.
          A transferência ocorre apenas para países que oferecem grau de proteção compatível com a LGPD ou
          mediante cláusulas contratuais específicas, conforme art. 33 da LGPD.
        </p>

        <h2 className={sectionTitle}>7. Por quanto tempo guardamos os dados</h2>
        <ul className={list}>
          <li><strong>Durante a vigência do contrato de mentoria:</strong> todos os dados ativos.</li>
          <li><strong>Após o término do contrato:</strong> dados de identificação e financeiros mantidos por até 5 anos para cumprir obrigações fiscais e legais.</li>
          <li><strong>Dados de marketing (consentimento):</strong> mantidos enquanto o consentimento estiver vigente. Você pode revogá-lo a qualquer momento.</li>
          <li><strong>Logs de acesso:</strong> 6 meses, conforme Marco Civil da Internet.</li>
        </ul>

        <h2 className={sectionTitle}>8. Seus direitos como titular</h2>
        <p className={paragraph}>
          A LGPD garante a você, titular dos dados, os seguintes direitos (art. 18):
        </p>
        <ul className={list}>
          <li>Confirmação da existência de tratamento dos seus dados.</li>
          <li>Acesso aos dados que tratamos.</li>
          <li>Correção de dados incompletos, inexatos ou desatualizados.</li>
          <li>Anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade.</li>
          <li>Portabilidade dos dados a outro fornecedor.</li>
          <li>Eliminação dos dados tratados com base em consentimento, exceto quando houver base legal para a manutenção.</li>
          <li>Informação sobre com quem compartilhamos seus dados.</li>
          <li>Revogação do consentimento, sempre que aplicável.</li>
          <li>Oposição a tratamentos que considere irregulares.</li>
        </ul>

        <h2 className={sectionTitle}>9. Como exercer seus direitos</h2>
        <p className={paragraph}>
          Para exercer qualquer dos direitos acima, entre em contato com nosso Encarregado de Dados (DPO):
        </p>
        <p className={paragraph}>
          <strong>Filippe Ximenes</strong>
          <br />
          E-mail: <a href="mailto:filippe@metodointento.com.br" className="text-intento-blue underline">filippe@metodointento.com.br</a>
        </p>
        <p className={paragraph}>
          Responderemos sua solicitação em até 15 dias, conforme prazo previsto pela LGPD.
        </p>

        <h2 className={sectionTitle}>10. Segurança dos dados</h2>
        <p className={paragraph}>
          Adotamos medidas técnicas e administrativas razoáveis para proteger seus dados contra acessos
          não autorizados, perda, alteração e divulgação indevida, incluindo: criptografia em trânsito
          (HTTPS), autenticação por provedor reconhecido (Firebase Auth), controle de acesso baseado em
          perfil (aluno, mentor, vendedor, líder) e logs de auditoria.
        </p>

        <h2 className={sectionTitle}>11. Cookies</h2>
        <p className={paragraph}>
          Utilizamos cookies e tecnologias similares estritamente necessários para o funcionamento da
          Plataforma — autenticação, manutenção de sessão e preferências básicas. Não utilizamos cookies
          de marketing ou rastreamento de terceiros sem o seu consentimento explícito.
        </p>

        <h2 className={sectionTitle}>12. Alterações a esta Política</h2>
        <p className={paragraph}>
          Podemos atualizar esta Política periodicamente. A versão vigente está sempre disponível nesta
          página, com a data da última atualização indicada no topo. Alterações materiais serão
          comunicadas com destaque a você por e-mail ou notificação na Plataforma.
        </p>

        <h2 className={sectionTitle}>13. Reclamações à autoridade competente</h2>
        <p className={paragraph}>
          Caso entenda que seus direitos foram violados e não obtenha resposta satisfatória do nosso DPO,
          você pode apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD) através do
          site <a href="https://www.gov.br/anpd" target="_blank" rel="noopener noreferrer" className="text-intento-blue underline">www.gov.br/anpd</a>.
        </p>

        <div className="mt-10 pt-6 border-t border-slate-200 text-center">
          <Link href="/" className="text-xs font-semibold text-intento-blue hover:underline">
            ← Voltar
          </Link>
        </div>
      </main>

      <footer className="bg-white border-t border-slate-200 px-6 py-4 mt-8 text-center">
        <p className="text-[11px] text-slate-500 font-medium">
          © 2026 Intento Grupo Educacional LTDA · CNPJ 49.929.921/0001-22
        </p>
      </footer>
    </div>
  );
}
