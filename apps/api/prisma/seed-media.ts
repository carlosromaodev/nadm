import { deflateSync } from 'node:zlib';

/**
 * Imagens de semente, geradas aqui mesmo.
 *
 * São PNG verdadeiros — cabeçalho, `IHDR`, `IDAT` comprimido e `IEND` — e não
 * ficheiros de mentira: passam pela mesma validação por bytes que qualquer
 * carregamento real (`validateMediaBytes`), que é o ponto.
 *
 * Gerar em vez de descarregar é deliberado: uma semente que depende da rede
 * falha no avião, no comboio e no dia em que o sítio de onde vinham as fotos
 * mudar de endereço.
 */

const CRC_TABLE = (() => {
  const tabela = new Uint32Array(256);

  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabela[n] = c >>> 0;
  }

  return tabela;
})();

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;

  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);

  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const comprimento = Buffer.alloc(4);
  comprimento.writeUInt32BE(data.length);

  const corpo = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const verificacao = Buffer.alloc(4);
  verificacao.writeUInt32BE(crc32(corpo));

  return Buffer.concat([comprimento, corpo, verificacao]);
}

export interface Paleta {
  /** Canto superior esquerdo e inferior direito do gradiente, em RGB. */
  de: [number, number, number];
  para: [number, number, number];
}

/**
 * Um PNG com gradiente e uma forma orgânica por cima.
 *
 * `semente` decide a forma, para duas publicações do mesmo criador não saírem
 * iguais sem que seja preciso guardar ficheiros no repositório.
 */
export function gerarPng(largura: number, altura: number, paleta: Paleta, semente: number): Buffer {
  const linhas: Buffer[] = [];

  // Um gerador previsível: a mesma semente dá sempre a mesma imagem, e uma
  // semente diferente dá outra.
  let estado = semente * 2654435761;
  const aleatorio = () => {
    estado = (estado * 1664525 + 1013904223) >>> 0;
    return estado / 0xffffffff;
  };

  const centros = Array.from({ length: 3 }, () => ({
    x: aleatorio() * largura,
    y: aleatorio() * altura,
    raio: (0.18 + aleatorio() * 0.3) * Math.min(largura, altura),
    forca: 0.35 + aleatorio() * 0.4,
  }));

  for (let y = 0; y < altura; y += 1) {
    // Byte de filtro 0: sem filtro, que é o que torna isto legível a olho nu.
    const linha = Buffer.alloc(1 + largura * 3);

    for (let x = 0; x < largura; x += 1) {
      const t = (x / largura + y / altura) / 2;

      let r = paleta.de[0] + (paleta.para[0] - paleta.de[0]) * t;
      let g = paleta.de[1] + (paleta.para[1] - paleta.de[1]) * t;
      let b = paleta.de[2] + (paleta.para[2] - paleta.de[2]) * t;

      for (const centro of centros) {
        const distancia = Math.hypot(x - centro.x, y - centro.y);

        if (distancia < centro.raio) {
          const peso = (1 - distancia / centro.raio) ** 2 * centro.forca;
          r += (255 - r) * peso * 0.5;
          g += (255 - g) * peso * 0.35;
          b += (255 - b) * peso * 0.2;
        }
      }

      const offset = 1 + x * 3;
      linha[offset] = Math.max(0, Math.min(255, Math.round(r)));
      linha[offset + 1] = Math.max(0, Math.min(255, Math.round(g)));
      linha[offset + 2] = Math.max(0, Math.min(255, Math.round(b)));
    }

    linhas.push(linha);
  }

  const cabecalho = Buffer.alloc(13);
  cabecalho.writeUInt32BE(largura, 0);
  cabecalho.writeUInt32BE(altura, 4);
  cabecalho[8] = 8; // 8 bits por canal
  cabecalho[9] = 2; // cor verdadeira, sem alfa
  cabecalho[10] = 0;
  cabecalho[11] = 0;
  cabecalho[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', cabecalho),
    chunk('IDAT', deflateSync(Buffer.concat(linhas), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
