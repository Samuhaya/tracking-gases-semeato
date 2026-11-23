// Tracking Gases Semeato — gestão de usuários (só ADM). Também cria a conta do dono no primeiro acesso.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const acao = String(body.acao || "");
    const email = String(body.email || "").trim().toLowerCase();
    const PADRAO = Deno.env.get("DEFAULT_SENHA") || "";
    const senha = String(body.senha || "") || (["criar", "senha", "garantir"].includes(acao) ? PADRAO : "");
    const nome = String(body.nome || "").trim();
    const { data: cfg } = await admin.from("docs").select("data").eq("col", "config").eq("id", "usuarios").maybeSingle();
    const dominio = String(cfg?.data?.dominio || "semeato.com.br").toLowerCase().replace(/^@/, "");
    const valida = () => {
      if (!/^[^@\s]+@[^@\s]+$/.test(email)) return "E-mail inválido.";
      if (!email.endsWith("@" + dominio)) return "Use um e-mail da empresa (@" + dominio + ").";
      if (acao !== "remover" && senha.length < 8) return "A senha precisa ter pelo menos 8 caracteres.";
      return "";
    };

    if (acao === "bootstrap") {
      const { count } = await admin.from("donos").select("email", { count: "exact", head: true });
      if (count && count > 0) return json({ erro: "O dono do app já foi criado. Entre com e-mail e senha." }, 403);
      const v = valida(); if (v) return json({ erro: v }, 400);
      const { error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome } });
      if (error) return json({ erro: error.message }, 400);
      await admin.from("donos").insert({ email });
      return json({ ok: true });
    }

    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = await admin.auth.getUser(jwt);
    if (!u?.user?.email) return json({ erro: "Entre no app novamente." }, 401);
    const quem = u.user.email.toLowerCase();
    const { data: dn } = await admin.from("donos").select("email").eq("email", quem).maybeSingle();
    const lista: any[] = Array.isArray(cfg?.data?.lista) ? cfg!.data.lista : [];
    const ehAdm = !!dn || lista.some((x) => x?.papel === "adm" && x?.ativo !== false && String(x?.email || "").toLowerCase() === quem);
    if (!ehAdm) return json({ erro: "Só o ADM pode fazer isso." }, 403);

    const achar = async () => {
      for (let page = 1; page <= 10; page++) {
        const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        const f = data?.users?.find((x) => (x.email || "").toLowerCase() === email);
        if (f) return f;
        if (!data || data.users.length < 200) break;
      }
      return null;
    };

    if (acao === "criar") {
      const v = valida(); if (v) return json({ erro: v }, 400);
      const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome, trocarSenha: true } });
      if (error) return json({ erro: /already|registered|exists/i.test(error.message) ? "Este e-mail já tem conta. Use 'Nova senha' para trocar a senha." : error.message }, 400);
      return json({ ok: true, id: data.user?.id });
    }
    if (acao === "garantir") {
      if (PADRAO.length < 8) return json({ erro: "Senha padrão não configurada." }, 500);
      const existentes = new Set<string>();
      for (let page = 1; page <= 10; page++) {
        const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        (data?.users || []).forEach((x) => { if (x.email) existentes.add(x.email.toLowerCase()); });
        if (!data || data.users.length < 200) break;
      }
      const criados: string[] = [];
      for (const x of lista) {
        const e = String(x?.email || "").toLowerCase();
        if (!e || x?.ativo === false || existentes.has(e) || !e.endsWith("@" + dominio)) continue;
        const { error } = await admin.auth.admin.createUser({ email: e, password: PADRAO, email_confirm: true, user_metadata: { nome: x?.nome || "", trocarSenha: true } });
        if (!error) criados.push(e);
      }
      return json({ ok: true, criados });
    }
    if (acao === "senha") {
      const v = valida(); if (v) return json({ erro: v }, 400);
      const alvo = await achar();
      if (!alvo) {
        const { error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome, trocarSenha: true } });
        if (error) return json({ erro: error.message }, 400);
        return json({ ok: true, criado: true });
      }
      const { error } = await admin.auth.admin.updateUserById(alvo.id, { password: senha, user_metadata: { ...(alvo.user_metadata || {}), trocarSenha: true } });
      if (error) return json({ erro: error.message }, 400);
      return json({ ok: true });
    }
    if (acao === "remover") {
      if (email === quem) return json({ erro: "Você não pode remover a sua própria conta." }, 400);
      const { data: alvoDono } = await admin.from("donos").select("email").eq("email", email).maybeSingle();
      if (alvoDono) return json({ erro: "A conta do dono não pode ser removida." }, 400);
      const alvo = await achar(); if (!alvo) return json({ ok: true });
      const { error } = await admin.auth.admin.deleteUser(alvo.id);
      if (error) return json({ erro: error.message }, 400);
      return json({ ok: true });
    }
    return json({ erro: "Ação desconhecida." }, 400);
  } catch (e) {
    return json({ erro: String((e as Error)?.message || e) }, 500);
  }
});
