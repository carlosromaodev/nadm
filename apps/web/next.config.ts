import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
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
