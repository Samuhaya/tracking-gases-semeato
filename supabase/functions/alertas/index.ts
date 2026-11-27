// Tracking Gases Semeato — alerta de tanque abaixo de 30% (roda de hora em hora pelo pg_cron).
// Avisa por notificação no celular: ADMs recebem todos; cada responsável recebe só a fábrica dele.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SITE = "https://samuhaya.github.io/tracking-gases-semeato/";

/* Medidor em polegadas (tanques criogênicos): converte para % pela tabela ou pela leitura de tanque cheio */
function polParaPct(t: any, pol: number): number | null {
  const pts: number[][] = [];
  String(t?.tabelaPol || "").split(/[;\n]+/).forEach((x) => { const m = x.replace(/,/g, ".").match(/(-?[\d.]+)\s*[:=]\s*(-?[\d.]+)/); if (m) pts.push([Number(m[1]), Number(m[2])]); });
  let p = pts.sort((a, b) => a[0] - b[0]);
  if (p.length < 2 && Number(t?.polCheio) > 0) p = [[0, 0], [Number(t.polCheio), 100]];
  if (p.length < 2 || isNaN(pol)) return null;
  if (pol <= p[0][0]) return Math.max(0, p[0][1]);
  for (let i = 1; i < p.length; i++) { const [x0, y0] = p[i - 1], [x1, y1] = p[i]; if (pol <= x1) return Math.min(100, Math.max(0, y0 + (y1 - y0) * (pol - x0) / ((x1 - x0) || 1))); }
  const [xa, ya] = p[p.length - 2], [xb, yb] = p[p.length - 1];
  return Math.min(100, Math.max(0, yb + (yb - ya) * (pol - xb) / ((xb - xa) || 1)));
}

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-key") !== Deno.env.get("CRON_KEY")) return json({ erro: "proibido" }, 403);
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    webpush.setVapidDetails(SITE, Deno.env.get("VAPID_PUBLIC")!, Deno.env.get("VAPID_PRIVATE")!);
    const get = async (col: string) => ((await sb.from("docs").select("id,data").eq("col", col)).data || []) as { id: string; data: any }[];
    const [tanques, unidades, gases, cfgs] = await Promise.all([get("tanques"), get("unidades"), get("gases"), get("config")]);
    const cfg = (id: string) => (cfgs.find((c) => c.id === id) || { data: {} }).data || {};
    const avisados: Record<string, string> = { ...(cfg("alertas30").avisados || {}) };
    const antes = JSON.stringify(avisados);
    const novos: any[] = [];
    for (const t of tanques) {
      const d = t.data || {};
      if (d.exemplo) continue;
      let n = Number(d.nivel);
      if ((d.nivel === "" || d.nivel === null || d.nivel === undefined || isNaN(n)) && d.nivelPol !== "" && d.nivelPol !== null && d.nivelPol !== undefined) n = polParaPct(d, Number(d.nivelPol));
      if (n === null || isNaN(n)) continue;
      if (n < 30) { if (!avisados[t.id]) novos.push({ id: t.id, ...d, n }); }
      else delete avisados[t.id];
    }
    const salvar = async () => { if (JSON.stringify(avisados) !== antes) await sb.from("docs").upsert({ col: "config", id: "alertas30", data: { avisados, exemplo: false } }); };
    if (!novos.length) { await salvar(); return json({ novos: 0 }); }

    const nomeU = (id: string) => (unidades.find((u) => u.id === id)?.data?.nome) || id;
    const nomeG = (id: string) => (gases.find((g) => g.id === id)?.data?.nome) || id;
    const fdata = (s: string) => (s ? s.slice(8, 10) + "/" + s.slice(5, 7) : "");
    const linha = (t: any) => `${nomeU(t.unidadeId)} · ${nomeG(t.gasId)}${t.uso ? " (" + t.uso + ")" : ""}: ${Math.round(t.n)}%` + (t.ultimaLeitura ? ` (leitura de ${fdata(t.ultimaLeitura)})` : "");

    const lista: any[] = Array.isArray(cfg("usuarios").lista) ? cfg("usuarios").lista : [];
    const { data: donos } = await sb.from("donos").select("email");
    const adms = new Set<string>([...(donos || []).map((d: any) => String(d.email).toLowerCase()), ...lista.filter((u) => u?.papel === "adm" && u?.ativo !== false).map((u) => String(u.email).toLowerCase())]);
    const resp: Record<string, string[]> = {};
    lista.filter((u) => u?.papel !== "adm" && u?.ativo !== false && u?.fabricaId).forEach((u) => { (resp[u.fabricaId] ||= []).push(String(u.email).toLowerCase()); });

    const uidDe: Record<string, string> = {};
    for (let page = 1; page <= 10; page++) {
      const { data } = await sb.auth.admin.listUsers({ page, perPage: 200 });
      (data?.users || []).forEach((u) => { if (u.email) uidDe[u.email.toLowerCase()] = u.id; });
      if (!data || data.users.length < 200) break;
    }
    const { data: subs } = await sb.from("docs").select("col,id,data").like("col", "registros/%/push");
    const subsDe: Record<string, any[]> = {};
    (subs || []).forEach((s: any) => { const uid = String(s.col).split("/")[1]; (subsDe[uid] ||= []).push(s); });

    let enviados = 0;
    const enviar = async (email: string, linhas: string[]) => {
      const uid = uidDe[email]; if (!uid) return;
      for (const s of subsDe[uid] || []) {
        try {
          await webpush.sendNotification(s.data.sub, JSON.stringify({ title: "Tanque abaixo de 30%", body: linhas.join("\n"), url: SITE, tag: "alerta30" }));
          enviados++;
        } catch (e: any) {
          if (e?.statusCode === 404 || e?.statusCode === 410) await sb.from("docs").delete().eq("col", s.col).eq("id", s.id);
        }
      }
    };
    for (const email of adms) await enviar(email, novos.map(linha));
    for (const [fab, emails] of Object.entries(resp)) {
      const daFab = novos.filter((t) => t.unidadeId === fab);
      if (daFab.length) for (const email of emails) if (!adms.has(email)) await enviar(email, daFab.map(linha));
    }
    if (enviados > 0) novos.forEach((t) => { avisados[t.id] = t.ultimaLeitura || "sem data"; });
    await salvar();
    return json({ novos: novos.length, enviados });
  } catch (e) {
    return json({ erro: String((e as Error)?.message || e) }, 500);
  }
});
