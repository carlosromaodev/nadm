// Read-only account checks plus local UI preferences. Never confirms a transaction.
export async function verifyUpdatedDesign({ send, evaluate }) {
  async function check(expression, label) {
    const until = Date.now() + 45000;
    while (Date.now() < until) {
      if (await evaluate(expression)) { console.log('✓ ' + label); return; }
      await new Promise(done => setTimeout(done, 200));
    }
    throw Error(label + ': ' + JSON.stringify(await evaluate('({path:location.pathname,text:document.body.innerText.slice(0,800)})')));
  }
  async function goto(path) { await send('Page.navigate', { url: 'http://127.0.0.1:3001' + path }); }
  async function button(prefix) {
    const expression = `[...document.querySelectorAll('button')].find(e=>e.textContent.trim().startsWith(${JSON.stringify(prefix)}))`;
    await check(`!!(${expression})`, 'Controlo: ' + prefix);
    await evaluate(`(${expression}).click()`);
  }
  await check(`document.querySelector('nav')?.textContent.replace(/\\s/g,'')==='PainelCaixaCriarPerfil'`, 'Barra única do criador');
  await check(`['/estudio/ofertas','/estudio/agenda','/wallet','/estudio/numeros','/estudio/publicar','/estudio/eventos'].every(href=>document.querySelector('main a[href="'+href+'"]'))`, 'Seis ferramentas acessíveis no painel');
  await evaluate(`document.querySelector('[aria-label="Definições"]').click()`);
  await check(`document.querySelectorAll('main a[href^="/definicoes?area="]').length===12`, 'Centro de controlo com doze áreas');
  await evaluate(`document.querySelector('a[href="/definicoes?area=aparencia"]').click()`);
  await button('Claro');
  await check(`document.documentElement.dataset.skin==='light' && localStorage.getItem('nadm.theme')==='light'`, 'Tema claro guardado');
  await goto('/definicoes?area=aparencia');
  await check(`document.documentElement.dataset.skin==='light' && [...document.querySelectorAll('button')].some(e=>e.textContent==='Claro' && e.getAttribute('aria-pressed')==='true')`, 'Tema preservado ao recarregar');
  await button('Sistema');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await check(`document.documentElement.dataset.skin==='dark'`, 'Sistema acompanha escuro');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await check(`document.documentElement.dataset.skin==='light'`, 'Sistema acompanha claro');
  await goto('/definicoes');
  await button('Espectador');
  await check(`location.pathname==='/inicio' && document.querySelector('nav')?.textContent.replace(/\\s/g,'')==='InícioDescobrirDMMeu'`, 'Troca para espectador muda a navegação');
  await check(`localStorage.getItem('nadm.dev-user')==='11111111-1111-4111-8111-111111111111'`, 'Troca de contexto preserva a mesma conta');
  await goto('/definicoes');
  await button('Criador');
  await check(`location.pathname==='/estudio' && document.querySelector('nav')?.textContent.includes('Caixa')`, 'Regresso ao criador');
  await goto('/nelsonbeats/dm');
  await check(`!!document.querySelector('a[href="/nelsonbeats/mimar"]')`, 'DM aponta para Mimar, não para briefing');
  await evaluate(`document.querySelector('a[href="/nelsonbeats/mimar"]').click()`);
  await button('10 000');
  await check(`[...document.querySelectorAll('footer button')].some(e=>e.textContent.includes('10 500 Kz'))`, 'Estimativa inclui taxa do comprador');
  await button('Só para o criador');
  await button('Rever mimo');
  await check(`document.querySelector('dialog[open]')?.textContent.includes('9 500 Kz') && document.querySelector('dialog[open]')?.textContent.includes('Nada foi cobrado nem enviado')`, 'Revisão mostra valor líquido sem simular envio');
  await button('Voltar a editar');
  await check(`!document.querySelector('dialog[open]')`, 'Voltar preserva a edição');
}
