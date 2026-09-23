import type { NextConfig } from 'next';

/**
 * As origens que o servidor de desenvolvimento aceita para servir `/_next/*`.
 *
 * Sem isto, abrir a aplicação pelo túnel do ngrok — que é como se vê no
 * telemóvel — serve o HTML e **recusa os pacotes de JavaScript**, porque vêm de
 * outra origem. O ecrã fica na casca sem nada hidratar: nem a animação de
 * entrada, nem o redireccionamento, nem sequer um erro visível.
 *
 * Só afecta o desenvolvimento. Em produção a aplicação é servida do seu próprio
 * domínio e isto não se aplica.
 */
const devOrigins = [
  '*.ngrok-free.dev',
  '*.ngrok-free.app',
  '*.ngrok.io',
  // A rede local, para abrir no telemóvel sem túnel nenhum.
  '192.168.*.*',
  '10.*.*.*',
];

const config: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  allowedDevOrigins: devOrigins,
  async rewrites() {
    const upstream = (process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3333/api').replace(/\/$/, '');
    return [{ source: '/api/:path*', destination: `${upstream}/:path*` }];
  },
  /**
   * `typedRoutes` fica desligado de propósito.
   *
   * Quase todas as ligações da aplicação são construídas em execução a partir
   * de identificadores (`/${handle}/pedir/${offerId}`), e o tipo inferido para
   * um template desses é `\`/${string}\``, que o Next não consegue casar com a
   * rota. Ligá-lo obrigaria a espalhar conversões de tipo por cada `href` —
   * ruído em troca de nenhuma garantia real.
   */
  typedRoutes: false,
};

export default config;
