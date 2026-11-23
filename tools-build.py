#!/usr/bin/env python3
"""Gera web/index.html (versão GitHub Pages + Supabase) a partir do app do Claude (gases-semeato/index.html)."""
import pathlib, re, sys

SRC = pathlib.Path('/home/user/gases-semeato/index.html')
OUT = pathlib.Path('/home/user/tracking-gases-semeato/index.html')
s = SRC.read_text()

def rep(a, b, c=1):
    global s
    n = s.count(a)
    if n != c:
        sys.exit(f'Trecho encontrado {n}x (esperado {c}): {a[:90]!r}')
    s = s.replace(a, b)

# Bibliotecas locais + camada Supabase antes do app
rep('<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>',
    '<script src="vendor/supabase.js"></script>\n<script src="vendor/qrcode.js"></script>\n<script src="adapter.js"></script>')

# Fotos privadas: links assinados
s = s.replace("'/_blob/'+esc(", "blobSrc(")
s = s.replace("/_blob/'+esc(", "'+blobSrc(")
if '/_blob/' in s:
    sys.exit('Ainda há /_blob/ no código: ' + s[s.index('/_blob/')-80:s.index('/_blob/')+40])

# Gancho para redesenhar depois de assinar fotos
rep("window.addEventListener('hashchange', () => { render(); window.scrollTo(0,0); });",
    "window.addEventListener('hashchange', () => { render(); window.scrollTo(0,0); });\nwindow.__render = render;")

# Link e QR code
rep("const LINK_APP = 'https://claude.ai/artifact/1yV3Z5Kre8B4KuKrTSkwSJ';", "const LINK_APP = location.origin + location.pathname;")
a = s.index('function desenharQR(){'); b = s.index('\n}\n', a) + 3
s = s[:a] + """function desenharQR(){
  const el = document.getElementById('qrbox');
  if (!el || el.dataset.ok) return;
  if (!window.qrcode){ el.innerHTML = '<span class="muted" style="font-size:12px">QR code indisponível</span>'; return; }
  const q = qrcode(0, 'M'); q.addData(LINK_APP); q.make();
  el.innerHTML = q.createSvgTag({cellSize:4, margin:0, scalable:true});
  el.dataset.ok = '1';
}
""" + s[b:]

# Textos de acesso (sem botão Compartilhar do Claude)
rep('Cada pessoa entra com a conta Claude do e-mail da empresa.', 'Cada pessoa entra com o e-mail da empresa e a senha criada pelo ADM.')
rep("Ninguém da equipe abriu o app ainda. Compartilhe com acesso de <b>Colaborador</b>. Quando a pessoa abrir, ela aparece aqui para você escolher a fábrica dela.",
    "Ninguém da equipe entrou no app ainda. Cadastre as pessoas na aba <a href=\"#usuarios\">Usuários</a>.")
rep("""<li><b>Compartilhe o app</b> com o mesmo e-mail no botão <b>Compartilhar</b> do Claude: <b>Colaborador</b> para responsável, <b>Editor</b> para ADM.</li><li>A pessoa abre o link. O responsável cai direto na fábrica dele; o ADM vê o painel completo.</li>""",
    """<li>O app cria a conta e mostra uma <b>senha provisória</b>. Passe para a pessoa junto com o link do app.</li><li>A pessoa entra com e-mail e senha e cria a senha dela. O responsável cai direto na fábrica dele; o ADM vê o painel completo.</li>""")
rep("""<div class="muted" style="font-size:12px">compartilhe como Editor</div>""", """<div class="muted" style="font-size:12px">conta de ADM</div>""")
rep("""<div class="muted" style="font-size:12px">compartilhe o app com este e-mail</div>""", """<div class="muted" style="font-size:12px">ainda não entrou</div>""")
rep("""Ele perde o acesso na próxima vez que você abrir o app. Para tirar o link de vez, remova também no botão Compartilhar.', () => salvarUsuarios(usuariosLista().filter(x => x.email !== id)), 'Remover'); }""",
    """A conta dele é apagada e ele não consegue mais entrar.', async () => { await salvarUsuarios(usuariosLista().filter(x => x.email !== id)); await window.__usuarios({acao:'remover', email:id}).catch(e => toast(e.message, 1)); }, 'Remover'); }""")
rep("""toast((tipo === 'adm' ? 'ADM cadastrado. Compartilhe o app com '+email+' como Editor.' : 'Responsável cadastrado. Compartilhe o app com '+email+' como Colaborador.')); }, erroDb);""",
    """criarConta(email, nome, 'criar'); }, erroDb);""")
rep("Abra o app pelo claude.ai com sua conta da Semeato.", "Verifique a conexão e entre novamente.")

# Senha provisória, nova senha
js = r"""
/* ---------- CONTAS (senha provisória) ---------- */
function senhaProvisoria(){ const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; const a = new Uint32Array(10); crypto.getRandomValues(a); return [...a].map(x => c[x % c.length]).join(''); }
async function criarConta(email, nome, acao){
  const senha = senhaProvisoria();
  try {
    await window.__usuarios({acao, email, senha, nome});
    abrirModal('<h2>'+(acao === 'criar' ? 'Conta criada' : 'Nova senha criada')+'</h2><p class="muted" style="margin:0">Passe estes dados para a pessoa. No primeiro acesso ela cria a senha dela.</p>'+
      '<div class="avs2" style="font-size:15px;line-height:1.7">Link: <b>'+esc(LINK_APP)+'</b><br>E-mail: <b>'+esc(email)+'</b><br>Senha provisória: <b class="mono" style="font-size:16px">'+esc(senha)+'</b></div>'+
      '<div class="tools" style="justify-content:flex-end"><button class="btn" id="cp_ac">Copiar</button><button class="btn pri" data-close>Pronto</button></div>', ov => {
      ov.querySelector('#cp_ac').addEventListener('click', () => navigator.clipboard.writeText('Tracking Gases Semeato\n'+LINK_APP+'\nE-mail: '+email+'\nSenha provisória: '+senha).then(() => toast('Copiado'), () => toast('Não foi possível copiar', 1)));
    });
  } catch(e){ toast(e.message, 1); }
}
"""
rep("/* ---------- USUÁRIOS ---------- */", "/* ---------- USUÁRIOS ---------- */" + js)
rep("""    {h:'', act:1, f:u => '<button class="btn sm ghost" data-act="usrativo\"""",
    """    {h:'', act:1, f:u => '<button class="btn sm ghost" data-act="usrsenha" data-id="'+esc(u.email)+'" data-nome="'+esc(u.nome||'')+'">Nova senha</button><button class="btn sm ghost" data-act="usrativo\"""")
rep("""  else if (act === 'usrativo'){""", """  else if (act === 'usrsenha') criarConta(id, b.dataset.nome || '', 'senha');
  else if (act === 'usrativo'){""")

# Documento completo para GitHub Pages
head = """<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#F5F5F7"><link rel="manifest" href="manifest.webmanifest"><link rel="icon" href="icon-192.png"><link rel="apple-touch-icon" href="icon-192.png">
<meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Tracking Gases">
<style>:root{padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px);color-scheme:light}body{margin:0;font:14px/1.45 system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>
</head><body>
"""
s = head + s + "\n<script>if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js').catch(()=>{});}</script>\n</body></html>\n"
OUT.write_text(s)
print('ok', len(s))
