// Service worker do cesta (origem: versão do Leo): guarda o app no aparelho para abrir sem
// internet — por exemplo, com a lista de compras no mercado.
//
// - Arquivos do próprio site (página, código do app, ícones, leitores de dieta): tenta a
//   internet primeiro e guarda a cópia mais nova. Sem internet, ou se ela demorar 3,5 s, abre a
//   cópia guardada.
// - Todo o resto (Supabase: login, feed e fotos; mapa, CEP, mercados, preço do site) vai direto
//   para a internet e NUNCA é guardado aqui.
// - A chave do cache não leva o "?…": o código do login (?code=) nunca vai para o cache.
// Este arquivo é público: não coloque dados aqui.
const CACHE = 'cesta2-v1';
const ESSENCIAIS = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];
const INICIO = new URL('/', self.location.href).href;
const PRAZO = 3500; // ms esperando a internet antes de abrir a cópia guardada

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(ESSENCIAIS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n.startsWith('cesta2-') && n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  if (new URL(req.url).origin === self.location.origin) e.respondWith(doSite(e));
  // o resto segue direto para a internet, sem passar pelo cache
});

function doSite(e) {
  const req = e.request;
  const url = new URL(req.url);
  const chave = url.origin + url.pathname;
  const daRede = fetch(req).then((res) => {
    if (res.ok && res.type === 'basic') {
      const copia = res.clone();
      e.waitUntil(caches.open(CACHE).then((c) => c.put(chave, copia)));
    }
    return res;
  });
  e.waitUntil(daRede.catch(() => {})); // termina de guardar mesmo se a cópia antiga já foi mostrada
  const guardada = async () =>
    (await caches.match(chave, { ignoreVary: true })) || (req.mode === 'navigate' ? caches.match(INICIO, { ignoreVary: true }) : undefined);
  return comPrazo(daRede, PRAZO).catch(async () => (await guardada()) || daRede);
}

function comPrazo(promessa, ms) {
  return new Promise((ok, falha) => {
    const t = setTimeout(() => falha(new Error('a internet demorou')), ms);
    promessa.then(
      (r) => {
        clearTimeout(t);
        ok(r);
      },
      (x) => {
        clearTimeout(t);
        falha(x);
      },
    );
  });
}
