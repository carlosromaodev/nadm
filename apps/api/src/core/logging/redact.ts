/**
 * O que nunca entra no registo estruturado (SDD §15.1).
 *
 * A lista não é de "coisas privadas" em geral — é a lista curta do que causa
 * dano concreto se sair: um número de telefone completo permite contactar
 * alguém, um documento identifica-o, um destino de levantamento é uma conta
 * bancária, um token e uma assinatura dão acesso, e o conteúdo de uma mensagem
 * é a conversa privada de duas pessoas.
 */
const CAMPOS_PROIBIDOS = new Set([
  'phone',
  'payerphone',
  'expressphone',
  'documentnumber',
  'destination',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'signature',
  'password',
  'secret',
  'body',
  'brief',
  'note',
  'reason',
  'message',
  'reply',
  'detail',
]);

/** Campos que se mascaram em vez de se apagarem: dão contexto sem dar acesso. */
const CAMPOS_MASCARADOS = new Set(['phone', 'payerphone', 'expressphone']);

const MARCA = '[redigido]';

/** Um telefone em E.164 em texto corrido, que às vezes escapa para mensagens. */
const TELEFONE_SOLTO = /\+\d{9,15}/g;

/** Mascara um telefone para `+2449****321`. */
export function maskPhoneValue(value: string): string {
  const limpo = value.trim();

  if (limpo.length <= 8) return '*'.repeat(limpo.length);

  return `${limpo.slice(0, 5)}****${limpo.slice(-3)}`;
}

/**
 * Limpa um objecto antes de ele ir para o registo.
 *
 * Percorre em profundidade e decide por **nome de campo**, não por conteúdo:
 * adivinhar pelo formato falha sempre para algum caso, e falhar aqui significa
 * escrever um documento de identidade num ficheiro de texto.
 *
 * O que não é reconhecido passa — a alternativa, apagar tudo menos uma lista
 * de permitidos, tornaria o registo inútil e levaria alguém a desligá-lo.
 */
export function redact(value: unknown, profundidade = 0): unknown {
  if (profundidade > 6) return MARCA;

  if (typeof value === 'string') {
    // Um telefone em texto corrido escapa à verificação por nome de campo.
    return value.replace(TELEFONE_SOLTO, (match) => maskPhoneValue(match));
  }

  if (typeof value === 'bigint') return value.toString();

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, profundidade + 1));
  }

  if (value && typeof value === 'object') {
    const limpo: Record<string, unknown> = {};

    for (const [chave, conteudo] of Object.entries(value as Record<string, unknown>)) {
      const normalizada = chave.toLowerCase();

      if (CAMPOS_MASCARADOS.has(normalizada) && typeof conteudo === 'string') {
        limpo[chave] = maskPhoneValue(conteudo);
        continue;
      }

      limpo[chave] = CAMPOS_PROIBIDOS.has(normalizada)
        ? MARCA
        : redact(conteudo, profundidade + 1);
    }

    return limpo;
  }

  return value;
}
