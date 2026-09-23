/** Injectado para que os testes possam ter identificadores previsíveis. */
export abstract class IdGenerator {
  abstract next(): string;
}
