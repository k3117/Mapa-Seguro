/**
 * MAPA SEGURO — proxy de IA (Cloudflare Workers, plano gratuito).
 *
 * Por quê: o GitHub Pages é estático e público; a chave da API não pode ir para o navegador.
 * Este Worker guarda a chave como segredo e só repassa conversas no formato do Assistente.
 *
 * Proteções:
 *  - Origem permitida (ORIGENS_PERMITIDAS) + CORS restrito
 *  - Prompt de sistema imposto pelo Worker (o cliente não pode trocá-lo)
 *  - Somente ferramentas da lista oficial; modelo fixo por variável de ambiente
 *  - Limites de tamanho e de requisições por IP (por minuto)
 *  - Log opcional e anônimo em KV (sem IP) para o painel de IA
 *
 * Segredos/variáveis (wrangler secret put / wrangler.toml):
 *   AI_API_KEY (segredo)  AI_PROVEDOR=gemini|openai_compat  AI_MODELO=gemini-2.5-flash
 *   AI_BASE_URL (só openai_compat)  ORIGENS_PERMITIDAS="https://usuario.github.io"
 *   ADMIN_TOKEN (segredo, opcional, para GET /admin/logs)  LOGS (binding KV, opcional)
 */
import { chamarProvedor } from "../assets/js/ai/adaptadores.js";
import { PROMPT_SISTEMA } from "../assets/js/ai/prompt-sistema.js";
import { DECLARACOES } from "../assets/js/ai/ferramentas.js";

const FERRAMENTAS_OK = new Map(DECLARACOES.map((d) => [d.name, d]));
const LIMITE_POR_MINUTO = 12;
const MAX_CORPO = 48_000;
const contagem = new Map(); // por isolate; para limite global use Cloudflare Rate Limiting

function cors(origem, env) {
  const ok = (env.ORIGENS_PERMITIDAS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const permitido = ok.includes(origem) ? origem : ok[0] || "null";
  return {
    "Access-Control-Allow-Origin": permitido,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
  };
}

const resp = (obj, status, h) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...h } });

function excedeuLimite(ip) {
  const agora = Math.floor(Date.now() / 60000);
  const chave = `${ip}:${agora}`;
  const n = (contagem.get(chave) || 0) + 1;
  contagem.set(chave, n);
  if (contagem.size > 5000) contagem.clear();
  return n > LIMITE_POR_MINUTO;
}

function sanitizarMensagens(msgs) {
  if (!Array.isArray(msgs) || msgs.length === 0 || msgs.length > 30) return null;
  const out = [];
  for (const m of msgs) {
    if (m.role === "user" && typeof m.content === "string") out.push({ role: "user", content: m.content.slice(0, 2000) });
    else if (m.role === "assistant") {
      out.push({
        role: "assistant",
        content: typeof m.content === "string" ? m.content.slice(0, 4000) : "",
        tool_calls: (m.tool_calls || []).filter((c) => FERRAMENTAS_OK.has(c.name)).slice(0, 4),
        _raw: Array.isArray(m._raw) ? m._raw.slice(0, 8) : undefined,
      });
    } else if (m.role === "tool" && FERRAMENTAS_OK.has(m.name)) {
      out.push({ role: "tool", tool_call_id: String(m.tool_call_id || ""), name: m.name, content: m.content });
    }
  }
  return out;
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const origem = req.headers.get("Origin") || "";
    const h = cors(origem, env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });

    // Painel de IA (somente leitura, protegido por token)
    if (req.method === "GET" && url.pathname === "/admin/logs") {
      if (!env.ADMIN_TOKEN || req.headers.get("Authorization") !== `Bearer ${env.ADMIN_TOKEN}`) return resp({ erro: "nao_autorizado" }, 401, h);
      if (!env.LOGS) return resp({ erro: "kv_nao_configurado" }, 501, h);
      const lista = await env.LOGS.list({ prefix: url.searchParams.get("prefixo") || "", limit: 200 });
      const itens = await Promise.all(lista.keys.map(async (k) => ({ chave: k.name, ...(await env.LOGS.get(k.name, "json")) })));
      return resp({ itens }, 200, h);
    }

    if (req.method !== "POST") return resp({ erro: "metodo" }, 405, h);
    const ok = (env.ORIGENS_PERMITIDAS || "").split(",").map((s) => s.trim());
    if (!ok.includes(origem)) return resp({ erro: "origem_nao_permitida" }, 403, h);
    const ip = req.headers.get("CF-Connecting-IP") || "?";
    if (excedeuLimite(ip)) return resp({ erro: "limite" }, 429, h);
    const bruto = await req.text();
    if (bruto.length > MAX_CORPO) return resp({ erro: "corpo_grande" }, 413, h);
    let corpo;
    try { corpo = JSON.parse(bruto); } catch { return resp({ erro: "json" }, 400, h); }

    // Feedback 👍/👎 (opcional, anônimo)
    if (url.pathname === "/feedback") {
      if (env.LOGS) {
        const f = { tipo: "feedback", util: !!corpo.util, motivos: (corpo.motivos || []).slice(0, 5).map(String), pergunta: String(corpo.pergunta || "").slice(0, 600), resposta: String(corpo.resposta || "").slice(0, 2000), em: new Date().toISOString() };
        ctx.waitUntil(env.LOGS.put(`feedback:${Date.now()}:${crypto.randomUUID().slice(0, 8)}`, JSON.stringify(f), { expirationTtl: 60 * 60 * 24 * 180 }));
      }
      return resp({ ok: true }, 200, h);
    }

    if (url.pathname !== "/chat") return resp({ erro: "rota" }, 404, h);
    const mensagens = sanitizarMensagens(corpo.mensagens);
    if (!mensagens) return resp({ erro: "mensagens" }, 400, h);

    try {
      const r = await chamarProvedor(env.AI_PROVEDOR || "gemini", {
        chave: env.AI_API_KEY,
        modelo: env.AI_MODELO || "gemini-2.5-flash",
        baseUrl: env.AI_BASE_URL || "",
        sistema: PROMPT_SISTEMA,                  // imposto pelo servidor
        mensagens,
        ferramentas: [...FERRAMENTAS_OK.values()], // lista oficial, não a do cliente
      });
      if (env.LOGS) {
        const ultima = [...mensagens].reverse().find((m) => m.role === "user");
        const reg = { tipo: "chat", pergunta: (ultima?.content || "").split("\n\n[Contexto")[0].slice(0, 600), ferramentas: (r.tool_calls || []).map((c) => c.name), resposta: (r.text || "").slice(0, 2000), sem_resposta: !r.text && !(r.tool_calls || []).length, em: new Date().toISOString() };
        ctx.waitUntil(env.LOGS.put(`chat:${Date.now()}:${crypto.randomUUID().slice(0, 8)}`, JSON.stringify(reg), { expirationTtl: 60 * 60 * 24 * 90 }));
      }
      return resp(r, 200, h);
    } catch (e) {
      if (env.LOGS) ctx.waitUntil(env.LOGS.put(`erro:${Date.now()}`, JSON.stringify({ tipo: "erro", msg: String(e.message).slice(0, 300), em: new Date().toISOString() }), { expirationTtl: 60 * 60 * 24 * 30 }));
      return resp({ erro: "provedor" }, 502, h);
    }
  },
};
