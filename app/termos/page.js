import Link from 'next/link';

export const metadata = {
  title: 'Termos de Uso | Intento',
};

const sectionTitle = 'text-base font-bold text-intento-blue mt-8 mb-3';
const subTitle = 'text-sm font-semibold text-intento-blue mt-5 mb-2';
const paragraph = 'text-sm text-slate-700 leading-relaxed mb-3';
const list = 'list-disc list-inside text-sm text-slate-700 leading-relaxed mb-3 space-y-1';

export default function Termos() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-2">
        <div className="w-1 h-5 bg-intento-yellow rounded-sm" />
        <span className="font-bold text-intento-blue text-sm tracking-wider">INTENTO</span>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-800 mb-6">
          <strong>Documento em revisão jurídica.</strong> Este texto é uma versão preliminar e está em
          processo de revisão por assessoria jurídica especializada.
        </div>

        <h1 className="text-2xl font-bold text-intento-blue">Termos de Uso</h1>
        <p className="text-xs text-slate-500 font-medium mt-1 mb-4">Última atualização: 27 de abril de 2026</p>

        <p className={paragraph}>
          Estes Termos de Uso (&quot;Termos&quot;) regulam a utilização da plataforma de mentoria educacional
          oferecida pela <strong>Intento Grupo Educacional LTDA</strong>, CNPJ 49.929.921/0001-22 (&quot;Intento&quot;,
          &quot;nós&quot;), por você (&quot;Usuário&quot;, &quot;você&quot;). Ao se cadastrar e utilizar a
          plataforma, você declara ter lido, compreendido e aceitado integralmente estes Termos. Se não
          concordar com algum dos termos, não utilize a plataforma.
        </p>

        <h2 className={sectionTitle}>1. Descrição do serviço</h2>
        <p className={paragraph}>
          A Intento oferece serviços de <strong>mentoria educacional individualizada</strong> voltada à
          preparação para vestibulares e ENEM, incluindo acompanhamento por mentores credenciados, registros
          de progresso, encontros periódicos e ferramentas digitais de organização de estudos. A plataforma
          é acessada por meio de site e aplicativo (PWA) próprios da Intento.
        </p>

        <h2 className={sectionTitle}>2. Cadastro e elegibilidade</h2>
        <ul className={list}>
          <li>Para usar a plataforma, é necessário fornecer dados verdadeiros, completos e atualizados durante o cadastro.</li>
          <li>Menores de 18 anos podem utilizar a plataforma desde que com consentimento expresso e supervisão de um dos pais ou responsável legal.</li>
          <li>O Usuário é responsável pela confidencialidade da sua conta de acesso e por todas as atividades realizadas a partir dela.</li>
          <li>Notifique a Intento imediatamente em caso de uso não autorizado da sua conta.</li>
        </ul>

        <h2 className={sectionTitle}>3. Conduta esperada</h2>
        <p className={paragraph}>
          Ao utilizar a plataforma, o Usuário compromete-se a:
        </p>
        <ul className={list}>
          <li>Fornecer informações verdadeiras e mantê-las atualizadas.</li>
          <li>Não compartilhar credenciais de acesso com terceiros.</li>
          <li>Respeitar mentores, demais usuários e funcionários da Intento, mantendo conduta ética e cordial.</li>
          <li>Não utilizar a plataforma para fins ilícitos, fraudulentos ou que violem direitos de terceiros.</li>
          <li>Não tentar interferir no funcionamento técnico da plataforma (engenharia reversa, ataques, scraping não autorizado).</li>
        </ul>

        <h2 className={sectionTitle}>4. Conteúdo da plataforma</h2>
        <p className={paragraph}>
          Todos os conteúdos disponibilizados pela Intento (textos, vídeos, materiais, metodologia, marca,
          logotipos, design da plataforma) são protegidos por direitos autorais e demais direitos de
          propriedade intelectual. É vedado ao Usuário reproduzir, redistribuir, comercializar ou
          modificar tais conteúdos sem autorização prévia e por escrito da Intento.
        </p>

        <h2 className={sectionTitle}>5. Conteúdo gerado pelo Usuário</h2>
        <p className={paragraph}>
          O Usuário é o único responsável pelos conteúdos que insere na plataforma (anotações, registros,
          mensagens). Ao inserir conteúdos, o Usuário concede à Intento licença não exclusiva, gratuita e
          mundial para utilizá-los exclusivamente no escopo da prestação do serviço de mentoria.
        </p>

        <h2 className={sectionTitle}>6. Pagamentos e cancelamento</h2>
        <ul className={list}>
          <li>Os valores, formas de pagamento e periodicidade da mentoria são definidos no contrato específico firmado entre o Usuário (ou seu responsável financeiro) e a Intento.</li>
          <li>O cancelamento dos serviços segue o disposto no contrato firmado, respeitado o direito de arrependimento previsto no Código de Defesa do Consumidor (art. 49) para contratações realizadas fora do estabelecimento comercial.</li>
          <li>Em caso de inadimplência, a Intento poderá suspender o acesso à plataforma, sem prejuízo da cobrança dos valores devidos.</li>
        </ul>

        <h2 className={sectionTitle}>7. Limitação de responsabilidade</h2>
        <p className={paragraph}>
          A Intento envida seus melhores esforços para manter a plataforma disponível, segura e funcional,
          mas não garante:
        </p>
        <ul className={list}>
          <li>Que a plataforma estará disponível de forma ininterrupta, sem falhas ou erros.</li>
          <li>Resultados específicos em provas, vestibulares ou processos seletivos — o desempenho do Usuário depende de múltiplos fatores além da mentoria.</li>
          <li>Que conteúdos de terceiros eventualmente referenciados na plataforma estarão sempre disponíveis ou atualizados.</li>
        </ul>
        <p className={paragraph}>
          A Intento não se responsabiliza por danos indiretos, lucros cessantes ou perdas decorrentes
          de uso indevido da plataforma pelo Usuário ou por terceiros não autorizados.
        </p>

        <h2 className={sectionTitle}>8. Privacidade e proteção de dados</h2>
        <p className={paragraph}>
          O tratamento de dados pessoais na plataforma é regido pela nossa{' '}
          <Link href="/privacidade" className="text-intento-blue underline font-semibold">Política de Privacidade</Link>,
          que faz parte integrante destes Termos.
        </p>

        <h2 className={sectionTitle}>9. Suspensão e encerramento de conta</h2>
        <p className={paragraph}>
          A Intento reserva-se o direito de suspender ou encerrar a conta do Usuário em caso de violação
          destes Termos, mediante notificação prévia quando possível. O Usuário pode encerrar sua conta a
          qualquer momento, contatando o suporte ou solicitando a exclusão dos seus dados conforme nossa
          Política de Privacidade.
        </p>

        <h2 className={sectionTitle}>10. Alterações destes Termos</h2>
        <p className={paragraph}>
          A Intento pode atualizar estes Termos periodicamente. Alterações materiais serão comunicadas
          ao Usuário com antecedência razoável, por e-mail ou notificação na plataforma. O uso contínuo
          da plataforma após a entrada em vigor das alterações implica aceitação tácita da nova versão.
        </p>

        <h2 className={sectionTitle}>11. Lei aplicável e foro</h2>
        <p className={paragraph}>
          Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro da
          Comarca de Brasília/DF para dirimir quaisquer controvérsias decorrentes destes Termos, com
          renúncia a qualquer outro, por mais privilegiado que seja.
        </p>

        <h2 className={sectionTitle}>12. Contato</h2>
        <p className={paragraph}>
          Dúvidas, reclamações ou sugestões sobre estes Termos podem ser enviadas para:{' '}
          <a href="mailto:filippe@metodointento.com.br" className="text-intento-blue underline">filippe@metodointento.com.br</a>.
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
