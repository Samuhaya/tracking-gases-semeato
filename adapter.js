/* Tracking Gases Semeato — camada Supabase
   Fornece window.claude.use(nome) com as mesmas interfaces que o app já usa:
   db (documentos ao vivo), assets (fotos privadas), user (quem está logado), downloads. */
(() => {
  'use strict';
  const SUPABASE_URL = 'https://oywmbymfqsprkrplwono.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95d21ieW1mcXNwcmtycGx3b25vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU0NTUzMjYsImV4cCI6MjExMTAzMTMyNn0.lTLM1LNVDzEjZ2QikGJ1KgeoF39ZmpmYwIQkeS8qiBo';
  const BUCKET = 'arquivos';
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {auth:{persistSession:true, autoRefreshToken:true}});
  window.__sb = sb;
  const escH = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  /* ---------------- LOGIN ---------------- */
  let sessao = null, resolverLogin;
  const logado = new Promise(r => { resolverLogin = r; });
  const css = document.createElement('style');
  css.textContent = `
  .lg-ov{position:fixed;inset:0;z-index:50;background:var(--bg,#f5f5f7);display:flex;align-items:center;justify-content:center;padding:24px max(16px,env(safe-area-inset-right,0px)) 24px max(16px,env(safe-area-inset-left,0px));overflow:auto}
  .lg-card{width:min(420px,100%);background:var(--card,#fff);border-radius:24px;box-shadow:0 24px 60px -20px rgba(0,0,0,.25);padding:28px;display:flex;flex-direction:column;gap:14px;font-family:var(--f-body,system-ui)}
  .lg-card img{height:56px;align-self:flex-start;mix-blend-mode:multiply}
  .lg-card h1{margin:0;font-size:24px;letter-spacing:-.02em;font-family:var(--f-display,system-ui)}
  .lg-card p{margin:0;color:var(--muted,#6e6e73);font-size:14px}
  .lg-card label{display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:500;color:var(--muted,#6e6e73)}
  .lg-card input{font:inherit;font-size:16px;padding:12px 14px;border-radius:12px;border:1px solid transparent;background:var(--surface,#f0f0f3);color:var(--fg,#1d1d1f)}
  .lg-card button{font:inherit;font-weight:600;font-size:15px;border:0;border-radius:980px;padding:12px 18px;cursor:pointer;background:#B7241F;color:#fff;min-height:46px}
  .lg-card button.sec{background:transparent;color:#B7241F;font-weight:500;min-height:36px}
  .lg-card button:disabled{opacity:.6}
  .lg-err{color:#B7241F;font-size:13.5px;min-height:1em}
  .lg-alerta[data-st=on]{color:#1f7a4d}
  @media (max-width:620px){.lg-alerta{font-size:0!important;padding:6px 8px!important}.lg-alerta svg{margin:0!important}}
  .lg-sair{font:inherit;font-size:13px;font-weight:500;border:0;border-radius:980px;padding:6px 12px;background:var(--surface,#f0f0f3);color:var(--fg,#1d1d1f);cursor:pointer}`;
  document.head.appendChild(css);
  function tela(html, mount){
    let ov = document.querySelector('.lg-ov');
    if (!ov){ ov = document.createElement('div'); ov.className = 'lg-ov'; document.body.appendChild(ov); }
    ov.innerHTML = '<div class="lg-card" role="dialog" aria-modal="true"><img src="logo-semeato.png" alt="Semeato">'+html+'</div>';
    mount && mount(ov);
    const f = ov.querySelector('input'); f && f.focus();
  }
  const fecharTela = () => { const ov = document.querySelector('.lg-ov'); ov && ov.remove(); };
  async function chamarFuncao(corpo){
    const {data:{session}} = await sb.auth.getSession();
    const r = await fetch(SUPABASE_URL+'/functions/v1/usuarios', {method:'POST', headers:{'Content-Type':'application/json', apikey:SUPABASE_ANON, Authorization:'Bearer '+(session ? session.access_token : SUPABASE_ANON)}, body:JSON.stringify(corpo)});
    const j = await r.json().catch(() => ({erro:'Resposta inválida do servidor.'}));
    if (!r.ok || j.erro) throw new Error(j.erro || 'Falha ('+r.status+').');
    return j;
  }
  window.__usuarios = chamarFuncao;
  function telaLogin(msg){
    tela('<h1>Tracking Gases</h1><p>Entre com o seu e-mail da empresa e a senha que o ADM passou.</p>'+
      '<form id="lg-f" novalidate style="display:flex;flex-direction:column;gap:12px"><label>E-mail<input id="lg-e" type="email" autocomplete="username" required></label>'+
      '<label>Senha<input id="lg-s" type="password" autocomplete="current-password" required></label><div class="lg-err" id="lg-x">'+escH(msg||'')+'</div>'+
      '<button type="submit">Entrar</button></form><button class="sec" id="lg-esq" type="button">Esqueci a senha</button>', ov => {
      ov.querySelector('#lg-f').addEventListener('submit', async e => {
        e.preventDefault();
        const b = ov.querySelector('button[type=submit]'), x = ov.querySelector('#lg-x');
        b.disabled = true; x.textContent = '';
        const {error} = await sb.auth.signInWithPassword({email:ov.querySelector('#lg-e').value.trim().toLowerCase(), password:ov.querySelector('#lg-s').value});
        b.disabled = false;
        if (error) x.textContent = /invalid/i.test(error.message) ? 'E-mail ou senha incorretos.' : error.message;
      });
      ov.querySelector('#lg-esq').addEventListener('click', () => { ov.querySelector('#lg-x').textContent = 'Peça ao ADM uma nova senha. Ele gera na aba Usuários.'; });
    });
  }
  function telaDono(){
    tela('<h1>Primeiro acesso</h1><p>Crie a conta do <b>dono do app</b> (ADM principal). Use o seu e-mail da empresa. Depois disso, só o ADM cria contas.</p>'+
      '<form id="lg-f" novalidate style="display:flex;flex-direction:column;gap:12px"><label>Seu nome<input id="lg-n" autocomplete="name" required></label><label>E-mail da empresa<input id="lg-e" type="email" autocomplete="username" required></label>'+
      '<label>Crie uma senha (mínimo 8)<input id="lg-s" type="password" autocomplete="new-password" minlength="8" required></label><div class="lg-err" id="lg-x"></div><button type="submit">Criar conta de dono</button></form>', ov => {
      ov.querySelector('#lg-f').addEventListener('submit', async e => {
        e.preventDefault();
        const b = ov.querySelector('button[type=submit]'), x = ov.querySelector('#lg-x');
        const email = ov.querySelector('#lg-e').value.trim().toLowerCase(), senha = ov.querySelector('#lg-s').value;
        b.disabled = true; x.textContent = '';
        try { await chamarFuncao({acao:'bootstrap', email, senha, nome:ov.querySelector('#lg-n').value.trim()}); await sb.auth.signInWithPassword({email, password:senha}); }
        catch(err){ x.textContent = err.message; b.disabled = false; }
      });
    });
  }
  function telaTrocarSenha(){
    tela('<h1>Crie sua senha</h1><p>Você entrou com uma senha provisória. Escolha uma senha sua para continuar.</p>'+
      '<form id="lg-f" novalidate style="display:flex;flex-direction:column;gap:12px"><label>Nova senha (mínimo 8)<input id="lg-s" type="password" autocomplete="new-password" minlength="8" required></label>'+
      '<label>Repita a senha<input id="lg-s2" type="password" autocomplete="new-password" required></label><div class="lg-err" id="lg-x"></div><button type="submit">Salvar e entrar</button></form>', ov => {
      ov.querySelector('#lg-f').addEventListener('submit', async e => {
        e.preventDefault();
        const s1 = ov.querySelector('#lg-s').value, s2 = ov.querySelector('#lg-s2').value, x = ov.querySelector('#lg-x');
        if (s1.length < 8){ x.textContent = 'A senha precisa ter pelo menos 8 caracteres.'; return; }
        if (s1 !== s2){ x.textContent = 'As senhas não são iguais.'; return; }
        const {error} = await sb.auth.updateUser({password:s1, data:{trocarSenha:false}});
        if (error){ x.textContent = error.message; return; }
        const {data:{session}} = await sb.auth.getSession(); entrar(session);
      });
    });
  }
  function entrar(s){
    if (!s) return;
    if (s.user && s.user.user_metadata && s.user.user_metadata.trocarSenha){ telaTrocarSenha(); return; }
    sessao = s; fecharTela(); resolverLogin(s);
    const h = document.querySelector('header.top > .wrap');
    if (h && !h.querySelector('.lg-sair')){
      const b = document.createElement('button'); b.className = 'lg-sair'; b.type = 'button'; b.textContent = 'Sair';
      b.addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });
      h.appendChild(b);
      ligarBotaoAlertas(h, b);
    }
  }

  /* ---------------- ALERTAS NO CELULAR (Web Push) ---------------- */
  const VAPID_PUB = 'BFZFBy72zTox_KRpPuCoZ3-G0Cpdv2GKhlp9mu1REt5x09Hzy55IwZsn5UX7n1NAcYJ2geYtiZlxv7Jwnb5P0m8';
  const b64u = b => { const p = '='.repeat((4 - b.length % 4) % 4); const r = atob((b + p).replace(/-/g,'+').replace(/_/g,'/')); return Uint8Array.from([...r].map(c => c.charCodeAt(0))); };
  const hashTxt = t => { let h = 5381; for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) >>> 0; return 'd' + h.toString(16); };
  const ehIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const instalado = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  function aviso(msg, erro){
    const t = document.createElement('div'); t.className = 'toast' + (erro ? ' err' : ''); t.textContent = msg; t.setAttribute('role','status');
    document.querySelectorAll('.toast').forEach(x => x.remove()); document.body.appendChild(t); setTimeout(() => t.remove(), erro ? 7000 : 3500);
  }
  async function estadoPush(){
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'sem';
    try { const reg = await navigator.serviceWorker.ready; const s = await reg.pushManager.getSubscription(); return s && Notification.permission === 'granted' ? 'on' : 'off'; } catch(_) { return 'off'; }
  }
  async function ativarPush(){
    if (ehIOS && !instalado){ aviso('No iPhone: toque em Compartilhar → "Adicionar à Tela de Início", abra o app pelo ícone e ative os alertas ali.', 1); return false; }
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)){ aviso('Este navegador não recebe notificações. Use o Chrome no Android ou o app instalado no iPhone.', 1); return false; }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted'){ aviso('Notificações bloqueadas. Libere nas configurações do navegador para este site.', 1); return false; }
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:b64u(VAPID_PUB)}));
    const j = sub.toJSON();
    try { await docRef('registros/' + sessao.user.id + '/push/' + hashTxt(j.endpoint)).set({sub:j, aparelho:navigator.userAgent.slice(0,140), criadoEm:new Date().toISOString()}); }
    catch(e){ aviso(e && e.code === 'invalid_argument' ? 'Fora do horário de uso: ative os alertas entre 7:30 e 18:00.' : 'Não foi possível ativar agora. Tente de novo.', 1); return false; }
    reg.showNotification('Alertas ativados', {body:'Você vai receber um aviso quando um tanque cair abaixo de 30%.', icon:'icon-192.png', tag:'ativado'});
    return true;
  }
  async function ligarBotaoAlertas(h, antes){
    const b = document.createElement('button'); b.className = 'lg-sair lg-alerta'; b.type = 'button';
    const sino = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-2px;margin-right:5px"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>';
    const pintar = st => { b.innerHTML = sino + (st === 'on' ? 'Alertas ligados' : 'Ativar alertas'); b.dataset.st = st; b.hidden = st === 'sem' && !ehIOS; };
    pintar(await estadoPush());
    b.addEventListener('click', async () => {
      if (b.dataset.st === 'on'){ aviso('Os alertas já estão ligados neste aparelho.'); return; }
      b.disabled = true; const ok = await ativarPush().catch(() => false); b.disabled = false;
      pintar(ok ? 'on' : await estadoPush());
    });
    h.insertBefore(b, antes);
  }
  (async () => {
    const {data:{session}} = await sb.auth.getSession();
    if (session) { entrar(session); }
    else {
      let temDono = true;
      try { const {data} = await sb.rpc('tem_dono'); temDono = !!data; } catch(_){}
      temDono ? telaLogin() : telaDono();
    }
    sb.auth.onAuthStateChange((ev, s) => {
      if (ev === 'SIGNED_IN' && !sessao) entrar(s);
      if (ev === 'TOKEN_REFRESHED' && s) sessao = s;
      if (ev === 'SIGNED_OUT') location.reload();
    });
  })();

  /* ---------------- BANCO (documentos ao vivo) ---------------- */
  const cache = new Map();            // col -> Map(id -> data)
  const colListeners = new Map();     // col -> Set(fn)
  const docListeners = new Map();     // col|id -> Set(fn)
  const carregadas = new Set();
  const snapCol = col => { const m = cache.get(col) || new Map(); return {docs:[...m.entries()].sort((a,b) => a[0] < b[0] ? -1 : 1).map(([id,d]) => ({id, exists:true, data:() => d, metadata:{fromCache:false, hasPendingWrites:false}})), size:m.size, empty:!m.size, metadata:{fromCache:false, hasPendingWrites:false}, docChanges:() => []}; };
  const snapDoc = (col,id) => { const m = cache.get(col); const d = m && m.get(id); return {id, exists:!!d, data:() => d, metadata:{fromCache:false, hasPendingWrites:false}}; };
  const avisar = col => { (colListeners.get(col) || []).forEach(f => { try { f(snapCol(col)); } catch(e){ console.error(e); } }); };
  const avisarDoc = (col,id) => { (docListeners.get(col+'|'+id) || []).forEach(f => { try { f(snapDoc(col,id)); } catch(e){ console.error(e); } }); };
  const aplicar = (col, id, data) => {
    let m = cache.get(col); if (!m){ m = new Map(); cache.set(col, m); }
    if (data !== null && m.has(id) && JSON.stringify(m.get(id)) === JSON.stringify(data)) return;
    if (data === null && !m.has(id)) return;
    if (data === null) m.delete(id); else m.set(id, data);
    avisar(col); avisarDoc(col, id);
  };
  async function buscarCol(col){
    const m = new Map(); let de = 0; const passo = 1000;
    for (;;){
      const {data, error} = await sb.from('docs').select('id,data').eq('col', col).range(de, de + passo - 1);
      if (error) throw error;
      data.forEach(r => m.set(r.id, r.data));
      if (data.length < passo) break; de += passo;
    }
    const antes = cache.get(col), mudou = !antes || antes.size !== m.size || [...m].some(([k,v]) => JSON.stringify(antes.get(k)) !== JSON.stringify(v));
    cache.set(col, m); carregadas.add(col);
    return mudou;
  }
  let canal = null;
  function ligarTempoReal(){
    if (canal) return;
    canal = sb.channel('docs-ao-vivo').on('postgres_changes', {event:'*', schema:'public', table:'docs'}, p => {
      if (p.eventType === 'DELETE'){ const o = p.old || {}; if (o.col && o.id) aplicar(o.col, o.id, null); }
      else { const n = p.new || {}; if (n.col && n.id) aplicar(n.col, n.id, n.data || {}); }
    }).subscribe();
    /* rede de segurança: se o tempo real cair, recarrega as coleções abertas a cada 30 s */
    setInterval(() => { if (document.hidden) return; [...colListeners.keys()].forEach(c => buscarCol(c).then(m => { if (m) avisar(c); }).catch(() => {})); }, 60000);
  }
  const erroDb = e => { const c = e && (e.code || ''); return {code: c === '42501' || /row-level security|permission/i.test((e && e.message) || '') ? 'invalid_argument' : 'unavailable', message: (e && e.message) || 'erro'}; };
  const partes = p => { const s = String(p).split('/'); return {col:s.slice(0,-1).join('/'), id:s[s.length-1]}; };
  const novoId = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g,'').slice(0,20);
  const mesclar = (a, b) => { const o = {...(a||{})}; for (const k in b){ const v = b[k]; if (v && typeof v === 'object' && !Array.isArray(v) && o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) o[k] = mesclar(o[k], v); else o[k] = v; } return o; };
  const limpo = d => JSON.parse(JSON.stringify(d));
  function docRef(path){
    const {col, id} = partes(path);
    return {
      id, path,
      async get(){ const {data, error} = await sb.from('docs').select('data').eq('col', col).eq('id', id).maybeSingle(); if (error) throw erroDb(error); return {id, exists:!!data, data:() => data ? data.data : undefined}; },
      async set(d){ const body = limpo(d); const {error} = await sb.from('docs').upsert({col, id, data:body}); if (error) throw erroDb(error); aplicar(col, id, body); },
      async update(d){
        const atual = await this.get(); if (!atual.exists) throw {code:'invalid_argument', message:'documento não existe'};
        const body = mesclar(atual.data(), limpo(d)); const {error} = await sb.from('docs').update({data:body}).eq('col', col).eq('id', id); if (error) throw erroDb(error); aplicar(col, id, body);
      },
      async delete(){ const {error} = await sb.from('docs').delete().eq('col', col).eq('id', id); if (error) throw erroDb(error); aplicar(col, id, null); },
      collection(sub){ return colRef(path + '/' + sub); },
      onSnapshot(next, err){
        const k = col+'|'+id; if (!docListeners.has(k)) docListeners.set(k, new Set()); docListeners.get(k).add(next);
        ligarTempoReal();
        sb.from('docs').select('data').eq('col', col).eq('id', id).maybeSingle().then(({data, error}) => {
          if (error){ err && err(erroDb(error)); return; }
          let m = cache.get(col); if (!m){ m = new Map(); cache.set(col, m); }
          if (data) m.set(id, data.data); else m.delete(id);
          next(snapDoc(col, id));
        });
        return () => docListeners.get(k).delete(next);
      },
    };
  }
  function colRef(path){
    return {
      path,
      doc(id){ return docRef(path + '/' + (id || novoId())); },
      async add(d){ const r = docRef(path + '/' + novoId()); await r.set(d); return r; },
      onSnapshot(next, err){
        if (!colListeners.has(path)) colListeners.set(path, new Set()); colListeners.get(path).add(next);
        ligarTempoReal();
        (carregadas.has(path) ? Promise.resolve() : buscarCol(path)).then(() => next(snapCol(path)), e => err && err(erroDb(e)));
        return () => colListeners.get(path).delete(next);
      },
      async get(){ await buscarCol(path); return snapCol(path); },
    };
  }
  const db = {doc: docRef, collection: colRef};

  /* ---------------- FOTOS (bucket privado + links assinados) ---------------- */
  const urls = new Map(); const pedir = new Set(); let tAss = 0;
  const VAZIO = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
  async function assinar(){
    const ids = [...pedir]; pedir.clear(); if (!ids.length) return;
    const {data} = await sb.storage.from(BUCKET).createSignedUrls(ids, 60*60*6);
    (data || []).forEach(x => { if (x && x.path && x.signedUrl) urls.set(x.path, x.signedUrl); else if (x && x.path) urls.set(x.path, VAZIO); });
    ids.forEach(id => { if (!urls.has(id)) urls.set(id, VAZIO); });
    window.__render && window.__render();
  }
  window.blobSrc = id => {
    if (!id) return VAZIO;
    const u = urls.get(id); if (u) return escH(u);
    pedir.add(id); clearTimeout(tAss); tAss = setTimeout(assinar, 60);
    return VAZIO;
  };
  const assets = {
    async upload(blob, opts){
      const uid = sessao && sessao.user.id; if (!uid) throw {code:'not_granted'};
      const tipo = (opts && opts.type) || blob.type || 'application/octet-stream';
      const ext = /pdf/.test(tipo) ? 'pdf' : /png/.test(tipo) ? 'png' : /svg/.test(tipo) ? 'svg' : /webp/.test(tipo) ? 'webp' : 'jpg';
      const path = uid + '/' + Date.now() + '-' + novoId().slice(0,8) + '.' + ext;
      const {error} = await sb.storage.from(BUCKET).upload(path, blob, {contentType:tipo, upsert:false});
      if (error) throw {code:'invalid_request', message:error.message};
      return {id:path, url:'', sizeBytes:blob.size || 0, contentType:tipo};
    },
    async delete(id){ const {error} = await sb.storage.from(BUCKET).remove([id]); if (error) throw {code:'unavailable', message:error.message}; urls.delete(id); },
    async list(){ return {assets:[], usage:{}}; },
  };

  /* ---------------- USUÁRIO ---------------- */
  const user = {
    async id(){ return sessao ? sessao.user.id : null; },
    async email(){ return sessao ? (sessao.user.email || '').toLowerCase() : null; },
    async canEdit(){ const {data} = await sb.rpc('eh_admin'); return !!data; },
    async isOwner(){ const {data} = await sb.rpc('eh_dono'); return !!data; },
    async can(){ return null; },
    async me(){ return {id: sessao.user.id, email: sessao.user.email, name: (sessao.user.user_metadata||{}).nome || ''}; },
    async profiles(ids){
      const out = {}; ids.forEach(i => out[i] = {id:i, name:'', email:null});
      const uuids = ids.filter(i => /^[0-9a-f-]{36}$/i.test(i));
      if (uuids.length){ const {data} = await sb.rpc('perfis', {ids:uuids}); (data || []).forEach(p => out[p.id] = {id:p.id, name:p.nome || '', email:p.email || null}); }
      const eu = sessao && sessao.user.id; if (eu && out[eu]) { out[eu].email = out[eu].email || sessao.user.email; out[eu].name = out[eu].name || (sessao.user.user_metadata||{}).nome || ''; }
      return out;
    },
  };

  /* ---------------- DOWNLOADS ---------------- */
  const downloads = {
    async save({filename, data}){
      const blob = data instanceof Blob ? data : new Blob([data], {type: /\.csv$/i.test(filename) ? 'text/csv;charset=utf-8' : 'application/octet-stream'});
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      return {status:'saved'};
    },
  };

  window.claude = {
    use: async nome => {
      await logado;
      return ({db, assets, user, downloads})[nome] || null;
    },
  };
})();
