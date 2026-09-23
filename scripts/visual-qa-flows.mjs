// UI checks only. Never submits profile/offer changes, orders, payments or media.
export async function verifyFlows({ send, evaluate }) {
  const checks = [];
  async function expect(expression, name) {
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      if (await evaluate(expression)) { checks.push(name); console.log('✓ ' + name); return; }
      await new Promise(done => setTimeout(done, 200));
    }
    console.error(await evaluate('({path:location.pathname,text:document.body.innerText.slice(0,1800)})'));
    throw new Error('UI check failed: ' + name);
  }
  async function click(text, selector = 'button') {
    await expect(`[...document.querySelectorAll(${JSON.stringify(selector)})].some(e=>e.innerText.trim()===${JSON.stringify(text)} && e.getBoundingClientRect().width > 0 && !e.disabled)`, 'Controlo disponível: ' + text);
    await evaluate(`[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.innerText.trim()===${JSON.stringify(text)} && e.getBoundingClientRect().width > 0 && !e.disabled).click()`);
  }
  async function input(selector, text) {
    await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing input');const proto=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  }
  async function goto(path) {
    await send('Page.navigate', { url: 'http://127.0.0.1:3001' + path });
    await expect(`location.pathname===${JSON.stringify(path.split('?')[0])} && document.readyState==='complete' && !!document.querySelector('main') && !document.body.innerText.includes('A abrir a tua conta')`, 'Rota: ' + path);
  }
  await click('Continuar com o meu número');
  await expect(`document.querySelector('button[form="phone-login"]').disabled`, 'Número vazio bloqueado');
  await input('input[type="tel"]', '123');
  await expect(`document.querySelector('button[form="phone-login"]').disabled`, 'Número inválido bloqueado');
  await input('input[type="tel"]', '923000000');
  await click('Receber código');
  await expect(`document.querySelector('dialog[open]')?.innerText.includes('SMS')`, 'SMS indisponível explicado sem simular envio');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await expect(`!document.querySelector('dialog[open]')`, 'Escape fecha a folha');
  await evaluate(`document.querySelector('[aria-label="Voltar às formas de entrada"]').click()`);
  await click('Experimentar a demonstração');
  await click('Entrar como criador');
  await expect(`location.pathname==='/estudio' && document.body.innerText.toLocaleLowerCase('pt').includes('disponível para levantar')`, 'Entrada criador → painel');
  await goto('/estudio/ofertas');
  await expect(`!!document.querySelector('select')?.value && !!document.querySelector('input[maxlength="120"]')?.value`, 'Oferta existente seleccionada');
  await click('7 500 Kz');
  await expect(`document.querySelector('input[inputmode="decimal"]')?.value==='7500'`, 'Preço sugerido actualiza editor sem gravar');
  await goto('/wallet');
  await click('Levantar para Express');
  await expect(`document.querySelector('dialog[open]')?.innerText.includes('Nenhum valor foi descontado')`, 'Levantamento indisponível sem cobrança');
  await click('Dados de recebimento', 'dialog a');
  await expect(`location.search==='?tab=account' && !!document.querySelector('input[type="tel"]')`, 'Carteira → separador Conta');
  await click('Aparência');
  await expect(`!!document.querySelector('[aria-label="Descer Conteúdo"]')`, 'Editor de ordem disponível');
  await evaluate(`document.querySelector('[aria-label="Descer Conteúdo"]').click()`);
  await expect(`document.querySelector('main ul li')?.innerText.includes('Contratar')`, 'Reordenação local sem gravar perfil');
  await goto('/estudio/publicar');
  await expect(`document.body.innerText.includes('A publicação ainda não está disponível')`, 'Ausência do serviço apresentada em linguagem de produto');
  await input('textarea', 'Rascunho de verificação local — não publicar');
  await click('Guardar rascunho');
  await expect(`document.body.innerText.includes('Rascunho guardado neste dispositivo')`, 'Rascunho local confirmado');
  await goto('/estudio/publicar');
  await expect(`document.querySelector('textarea')?.value==='Rascunho de verificação local — não publicar'`, 'Rascunho recuperado após recarregar');
  await goto('/descobrir?q=nadm-qa-inexistente');
  await expect(`document.body.innerText.includes('Ninguém com esse nome')`, 'Pesquisa sem resultados');
  await click('Limpar filtros');
  await expect(`!location.search && document.body.textContent.includes('Categorias')`, 'Limpar pesquisa repõe categorias');
  await goto('/seguranca');
  await click('Sair neste aparelho');
  await click('Sair neste aparelho', 'dialog button');
  await expect(`location.pathname==='/entrar' && document.readyState==='complete' && document.documentElement.hasAttribute('data-skin') && !localStorage.getItem('nadm.dev-user')`, 'Saída limpa sessão e abre entrada');
  await click('Experimentar a demonstração');
  await click('Entrar como espectador');
  await expect(`location.pathname==='/inicio' && localStorage.getItem('nadm.mode')==='buyer'`, 'Entrada espectador → início');
  await click('Descobrir', 'nav a');
  await expect(`location.pathname==='/descobrir' && !!document.querySelector('input[aria-label="Procurar criadores"]') && document.body.textContent.includes('Categorias') && !document.querySelector('svg[role=status]')`, 'Navegação do espectador');
  console.log(JSON.stringify({ interactions: checks }, null, 2));
}
