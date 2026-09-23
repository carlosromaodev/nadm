'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Screen, TituloComVolta } from '@/components/screen';
import { ACarregar } from '@/components/states';
import { Botao, Rotulo } from '@/components/ui';
import { api, ApiError, type Offer, type PublicProfile } from '@/lib/api';
import { formatMoney } from '@/lib/money';
import { useSession } from '@/lib/session';
import { LinkAction } from '@/components/viewer-ui';

const TONS = ['Alegre', 'Sóbrio', 'Divertido', 'Motivador'] as const;

/**
 * P6 — o briefing.
 *
 * Três campos porque a criadora precisa de três coisas para aceitar sem trocar
 * dez mensagens. O erro aparece no campo, não no topo, e a acção principal fica
 * apagada até estar resolvido.
 *
 * O backend guarda um `brief` só, de texto livre: os três campos são compostos
 * numa mensagem legível antes de partir.
 */
export default function BriefingPage() {
  const { handle, offerId } = useParams<{ handle: string; offerId: string }>();
  const router = useRouter();
  const { userId, ready } = useSession();

  const [perfil, setPerfil] = useState<PublicProfile | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aEnviar, setAEnviar] = useState(false);

  const [nome, setNome] = useState('');
  const [pedido, setPedido] = useState('');
  const [tom, setTom] = useState<string | null>(null);
  const [tocouNoNome, setTocouNoNome] = useState(false);
  const [rascunhoGuardado, setRascunhoGuardado] = useState(false);
  const [loadedDraftKey, setLoadedDraftKey] = useState<string | null>(null);
  const sending = useRef(false);

  const chaveRascunho = `nadm:briefing:${userId ?? 'visitor'}:${offerId}`;

  useEffect(() => {
    let active = true;
    setPerfil(null);
    setErro(null);
    void api<PublicProfile>(`/profiles/${handle}`)
      .then(value => { if (active) setPerfil(value); })
      .catch(() => { if (active) setErro('Não foi possível carregar o perfil. Volta ao perfil e tenta novamente.'); });
    return () => { active = false; };
  }, [handle]);

  // O briefing fica no dispositivo enquanto a pessoa decide — nada é enviado
  // até "Continuar para o pagamento".
  useEffect(() => {
    if (!ready) return;
    setNome(''); setPedido(''); setTom(null); setRascunhoGuardado(false);
    try {
      const guardado = window.localStorage.getItem(chaveRascunho);
      const rascunho = JSON.parse(guardado ?? '{}') as { nome?: string; pedido?: string; tom?: string | null };
      if (rascunho.nome) setNome(rascunho.nome);
      if (rascunho.pedido) setPedido(rascunho.pedido);
      if (rascunho.tom) setTom(rascunho.tom);
    } catch {
      // Sem rascunho legível — segue com os campos vazios.
    }
    setLoadedDraftKey(chaveRascunho);
  }, [chaveRascunho, ready]);

  useEffect(() => {
    if (loadedDraftKey !== chaveRascunho || !ready) return;
    try {
      window.localStorage.setItem(chaveRascunho, JSON.stringify({ nome, pedido, tom }));
      setRascunhoGuardado(Boolean(nome.trim() || pedido.trim() || tom));
    } catch {
      // Sem armazenamento local disponível — o rascunho não persiste, sem drama.
    }
  }, [nome, pedido, tom, chaveRascunho, loadedDraftKey, ready]);

  const offer = perfil?.offers.find((o) => o.id === offerId);

  const video = Boolean(offer && /v[ií]deo|dedicat[oó]ria/i.test(offer.title));

  const faltaNome = video && tocouNoNome && !nome.trim();
  const podeEnviar = Boolean((!video || nome.trim()) && pedido.trim() && perfil?.availabilityStatus === 'AVAILABLE');

  async function enviar() {
    if (!podeEnviar || sending.current || !offer || !['CUSTOM_SERVICE', 'DIRECT_MESSAGE'].includes(offer.kind)) return;
    if (!userId) {
      router.push(`/entrar?next=${encodeURIComponent(`/${handle}/pedir/${offerId}`)}`);
      return;
    }

    sending.current = true;
    setAEnviar(true);
    setErro(null);

    try {
      const deal = await api<{ id: string }>('/deals', {
        method: 'POST',
        actorUserId: userId,
        body: {
          offerId,
          brief: [
            nome.trim() ? `Para quem é: ${nome.trim()}` : null,
            `${video ? 'O que deve dizer' : offer.kind === 'DIRECT_MESSAGE' ? 'Pergunta' : 'O que preciso'}: ${pedido.trim()}`,
            tom ? `Tom: ${tom}` : null,
          ]
            .filter(Boolean)
            .join('\n'),
        },
      });

      try {
        window.localStorage.removeItem(chaveRascunho);
      } catch {
        // Sem armazenamento local — não há rascunho para limpar.
      }

      // Criado e por pagar: o passo seguinte é o Express (DP-15).
      router.push(`/deals/${deal.id}/pagar`);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : 'Não foi possível criar o pedido.');
      setAEnviar(false);
      sending.current = false;
    }
  }

  if (!ready || (!perfil && !erro)) return <ACarregar />;

  if (!offer) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-[16px] font-[900]">Oferta indisponível</p>
        <p className="text-[13px] font-[700] text-dim">{erro ?? 'Já não está à venda.'}</p>
        <LinkAction href={`/${handle}`} secondary>Voltar ao perfil</LinkAction>
      </div>
    );
  }

  if (!['CUSTOM_SERVICE', 'DIRECT_MESSAGE'].includes(offer.kind)) return <Screen header={<TituloComVolta voltarPara={`/${handle}`} titulo={offer.title} />}><p className="my-5 text-[14px] font-[700]">Esta oferta tem um fluxo próprio; não usa um briefing de serviço.</p><LinkAction href={offer.kind === 'BOOKING' ? `/${handle}/marcar/${offer.id}` : `/${handle}/membro`} className="w-full">Abrir {offer.kind === 'BOOKING' ? 'marcação' : 'adesão'}</LinkAction></Screen>;

  return (
    <Screen
      header={
        <>
          <TituloComVolta
            voltarPara={`/${handle}`}
            titulo={`Briefing · ${offer.title}`}
            subtitulo="Prepara o teu pedido"
          />
        </>
      }
      footer={
        <>
          {erro ? (
            <p className="mb-2.5 text-[12px] font-[800] text-danger" role="alert">
              {erro}
            </p>
          ) : null}
          {rascunhoGuardado ? (
            <div className="mb-2.5 flex items-center gap-[7px]">
              <svg viewBox="0 0 24 24" className="size-3.5 shrink-0" aria-hidden="true">
                <polyline
                  points="4,12.5 9.5,18 20,6.5"
                  fill="none"
                  stroke="var(--color-lime)"
                  strokeWidth="2.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="text-[11.5px] font-[700] text-dim">Rascunho guardado neste telemóvel</span>
            </div>
          ) : null}
          <Botao
            bloco
            onClick={() => void enviar()}
            disabled={!podeEnviar || aEnviar}
          >
            {aEnviar ? 'A criar pedido…' : 'Continuar para o pagamento'}
          </Botao>
          {!aEnviar ? (
            <button
              type="button"
              onClick={() => router.push(`/${handle}`)}
              className="mt-1.5 h-11 w-full rounded-full text-[13.5px] font-[900] text-dim"
            >
              Guardar e continuar depois
            </button>
          ) : null}
        </>
      }
    >
      <div className="mb-4 flex items-center justify-between rounded-[20px] border border-line bg-surface px-3.5 py-3">
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-[900]">{offer.title}</div>
          <div className="text-[11.5px] font-[700] text-dim">
            entrega em {offer.slaHours < 24 ? `${offer.slaHours} h` : `${Math.ceil(offer.slaHours / 24)} dias`} ·{' '}
            {offer.revisionsIncluded === 1
              ? '1 alteração incluída'
              : `${offer.revisionsIncluded} alterações incluídas`}
          </div>
        </div>
        <div className="algarismos shrink-0 text-[16px] font-[1000] tracking-[-0.02em]">
          {formatMoney(offer.price)}
        </div>
      </div>

      {perfil?.availabilityStatus !== 'AVAILABLE' && <p role="alert" className="mb-4 text-[13px] font-[800] text-amber">Este criador não está a aceitar novos pedidos.</p>}
      <Campo rotulo={video ? 'Para quem é' : 'Para quem é (opcional)'} erro={faltaNome ? 'Falta dizer para quem é — o criador precisa do nome' : null}>
        <input
          value={nome}
          maxLength={80}
          onChange={(e) => setNome(e.target.value)}
          onBlur={() => setTocouNoNome(true)}
          placeholder="O nome de quem vai receber"
          aria-label="Para quem é"
          className={`w-full rounded-[18px] border bg-wash px-3.5 py-3 text-[13.5px] font-[700] text-ink outline-none placeholder:text-dim ${
            faltaNome ? 'border-danger' : 'border-line'
          }`}
        />
      </Campo>

      <Campo rotulo={video ? 'O que queres que diga' : offer.kind === 'DIRECT_MESSAGE' ? 'A tua pergunta' : 'O que precisas'}>
        <textarea
          value={pedido}
          maxLength={1700}
          onChange={(e) => setPedido(e.target.value)}
          rows={4}
          placeholder={video ? 'A ocasião, o que deve dizer, alguma coisa pessoal.' : 'Descreve o pedido e os detalhes importantes para o criador.'}
          aria-label={video ? 'O que queres que diga' : 'O que precisas'}
          className="w-full resize-none rounded-[18px] border border-line bg-wash px-3.5 py-3 text-[13.5px] font-[700] leading-[1.5] text-ink outline-none placeholder:text-dim"
        />
      </Campo>

      {video && <Campo rotulo="Tom (opcional)">
        <div className="flex flex-wrap gap-[7px]">
          {TONS.map((opcao) => (
            <button
              key={opcao}
              type="button"
              aria-pressed={tom === opcao}
              onClick={() => setTom(tom === opcao ? null : opcao)}
              className={`rounded-full px-[13px] py-[7px] text-[12.5px] font-[800] transition-colors ${
                tom === opcao
                  ? 'bg-lime text-lime-ink'
                  : 'border border-line text-dim hover:bg-wash'
              }`}
            >
              {opcao}
            </button>
          ))}
        </div>
      </Campo>}
      <p className="text-[12px] leading-relaxed font-[700] text-dim">No passo seguinte, confere o preço, a taxa de serviço e o total calculados para este pedido antes de pagar. Ainda não é possível anexar ficheiros ao briefing.</p>
    </Screen>
  );
}

function Campo({
  rotulo,
  erro,
  children,
}: {
  rotulo: string;
  erro?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <div className="mb-[7px]">
        <Rotulo>{rotulo}</Rotulo>
      </div>
      {children}
      {erro ? (
        <div className="mt-[7px] flex items-center gap-[7px]">
          <span className="size-[7px] shrink-0 rounded-full bg-danger" />
          <span className="text-[11.5px] font-[800] text-danger">{erro}</span>
        </div>
      ) : null}
    </div>
  );
}
