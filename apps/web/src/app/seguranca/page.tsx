'use client';
import { useState } from 'react';
import { AppSheet } from '@/components/app-sheet';
import { Flor } from '@/components/flor';
import { Icon } from '@/components/icon';
import { Screen, TituloComVolta } from '@/components/screen';
import { Botao, Rotulo } from '@/components/ui';
import { endSession } from '@/lib/session';

export default function SecurityPage() {
  const [help, setHelp] = useState(false);
  const [signOut, setSignOut] = useState(false);
  return <Screen header={<TituloComVolta voltarPara="/definicoes?area=seguranca" titulo="Segurança e acesso" subtitulo="Os aparelhos onde usas a NaDM" />} footer={<><Botao bloco variante="secundario" onClick={() => setSignOut(true)}>Sair neste aparelho</Botao><p className="mt-2 text-center text-[11px] font-bold text-dim">Podes voltar a entrar quando quiseres.</p></>}>
    <section className="relative overflow-hidden rounded-[26px] border border-line bg-surface p-4"><Flor className="pointer-events-none absolute -top-[26px] -right-6 size-32 opacity-[.07]" /><div className="relative flex items-center gap-[13px]"><span className="flex size-[46px] shrink-0 items-center justify-center rounded-2xl bg-surface2 text-lime-text"><Icon name="shield" className="size-[22px]" /></span><div><h1 className="text-[17px] leading-[1.2] font-[1000] tracking-[-.02em]">O teu acesso à NaDM</h1><p className="mt-[3px] text-[12px] font-bold leading-[1.45] text-dim">Estás a usar uma conta de demonstração.</p></div></div></section>
    <div className="mt-[18px] mb-2"><Rotulo>Onde a tua conta está aberta</Rotulo></div>
    <div className="flex items-center gap-[11px] rounded-[20px] border border-line bg-surface p-[13px]"><span className="flex size-[38px] items-center justify-center rounded-[13px] bg-surface2 text-lime-text"><Icon name="phone" className="size-[18px]" /></span><div className="min-w-0 flex-1"><p className="text-[13px] font-[900]">Este navegador</p><p className="mt-0.5 text-[11px] font-bold text-dim">A sessão que estás a usar agora</p></div><span className="rounded-full bg-lime px-2.5 py-1 text-[10px] font-[1000] text-lime-ink">Actual</span></div>
    <div className="mt-[18px] mb-2"><Rotulo>Protecção da conta</Rotulo></div>
    <button className="flex w-full items-center gap-[11px] rounded-[20px] border border-line bg-surface p-[13px] text-left" onClick={() => setHelp(true)}><span className="flex size-[38px] items-center justify-center rounded-[13px] bg-surface2 text-dim"><Icon name="lock" className="size-[18px]" /></span><span className="flex-1"><span className="block text-[13px] font-[900]">Códigos de entrada</span><span className="mt-0.5 block text-[11px] font-bold text-dim">SMS e recuperação de acesso</span></span><Icon name="arrow" className="size-[15px] text-dim" /></button>
    <p className="mt-3 rounded-[20px] border border-line bg-wash p-[13px] text-[12px] font-bold leading-[1.5] text-dim">Nesta demonstração, só podes terminar a sessão deste navegador. Os códigos de confirmação e a gestão de outros aparelhos ainda não estão disponíveis.</p>
    {help && <AppSheet title="Protecção de acesso" onClose={() => setHelp(false)}><p className="text-[13px] font-bold leading-relaxed text-dim">A confirmação por SMS e a recuperação de conta ainda não estão disponíveis. Não é necessário fornecer códigos ou documentos para testar a NaDM.</p><Botao bloco className="mt-5" onClick={() => setHelp(false)}>Entendi</Botao></AppSheet>}
    {signOut && <AppSheet title="Sair da conta?" onClose={() => setSignOut(false)}><p className="text-[13px] font-bold leading-relaxed text-dim">Os teus pedidos e o teu perfil ficam guardados. Esta acção termina apenas a sessão neste navegador.</p><Botao bloco className="mt-5" onClick={endSession}>Sair neste aparelho</Botao></AppSheet>}
  </Screen>;
}
