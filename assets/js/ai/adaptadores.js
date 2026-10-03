/**
 * Adaptadores de provedor de IA (agnóstico).
 * Formato neutro usado pelo MAPA SEGURO:
 *   mensagens: [{role:"user",content}, {role:"assistant",content,tool_calls:[{id,name,args}],_raw?},
 *               {role:"tool",tool_call_id,name,content:{...}}]
 *   ferramentas: [{name,description,parameters}]
 *   resposta:   {text, tool_calls:[{id,name,args}], _raw?}
 * Este arquivo é importado pelo navegador (modo byok) e pelo Cloudflare Worker (modo proxy).
 */

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/* ------------------------------------------------------------------ Gemini */
function paraGemini(sistema, mensagens, ferramentas) {
  const contents = [];
  for (const m of mensagens) {
    if (m.role === "user") {
      contents.push({ role: "user", parts: [{ text: String(m.content) }] });
    } else if (m.role === "assistant") {
      // Reenvia as partes originais (preserva thoughtSignature exigida por modelos recentes)
      const parts = Array.isArray(m._raw) && m._raw.length
        ? m._raw
        : [
            ...(m.content ? [{ text: m.content }] : []),
            ...(m.tool_calls || []).map((c) => ({ functionCall: { name: c.name, args: c.args || {} } })),
          ];
      contents.push({ role: "model", parts });
    } else if (m.role === "tool") {
      const part = { functionResponse: { name: m.name, response: { resultado: m.content } } };
      const ultimo = contents[contents.length - 1];
      if (ultimo && ultimo.role === "user" && ultimo.parts.every((p) => p.functionResponse)) ultimo.parts.push(part);
      else contents.push({ role: "user", parts: [part] });
    }
  }
  const corpo = {
    systemInstruction: { parts: [{ text: sistema }] },
    contents,
    generationConfig: { temperature: 0.1, maxOutputTokens: 1200 },
  };
  if (ferramentas?.length) corpo.tools = [{ functionDeclarations: ferramentas }];
  return corpo;
}

function deGemini(json) {
  const cand = json?.candidates?.[0];
  const parts = cand?.content?.parts || [];
  const text = parts.filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text).join("").trim();
  const tool_calls = parts
    .filter((p) => p.functionCall)
    .map((p, i) => ({ id: `g${Date.now()}_${i}`, name: p.functionCall.name, args: p.functionCall.args || {} }));
  if (!parts.length && json?.promptFeedback?.blockReason) {
    return { text: "", tool_calls: [], bloqueado: json.promptFeedback.blockReason };
  }
  return { text, tool_calls, _raw: parts };
}

export async function chamarGemini({ chave, modelo, sistema, mensagens, ferramentas, fetchFn = fetch }) {
  const r = await fetchFn(`${GEMINI_BASE}/${encodeURIComponent(modelo)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": chave },
    body: JSON.stringify(paraGemini(sistema, mensagens, ferramentas)),
  });
  if (!r.ok) throw new Error(`Gemini HTTP ${r.status}`);
  return deGemini(await r.json());
}

/* ----------------------------------------------------- OpenAI-compatível */
function paraOpenAI(sistema, mensagens, ferramentas, modelo) {
  const messages = [{ role: "system", content: sistema }];
  for (const m of mensagens) {
    if (m.role === "user") messages.push({ role: "user", content: String(m.content) });
    else if (m.role === "assistant") {
      const msg = { role: "assistant", content: m.content || null };
      if (m.tool_calls?.length) {
        msg.tool_calls = m.tool_calls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.args || {}) } }));
      }
      messages.push(msg);
    } else if (m.role === "tool") {
      messages.push({ role: "tool", tool_call_id: m.tool_call_id, content: JSON.stringify(m.content) });
    }
  }
  const corpo = { model: modelo, messages, temperature: 0.1, max_tokens: 1200 };
  if (ferramentas?.length) corpo.tools = ferramentas.map((f) => ({ type: "function", function: f }));
  return corpo;
}

function deOpenAI(json) {
  const msg = json?.choices?.[0]?.message || {};
  const tool_calls = (msg.tool_calls || []).map((c) => {
    let args = {};
    try { args = JSON.parse(c.function?.arguments || "{}"); } catch { /* argumentos inválidos -> vazio */ }
    return { id: c.id, name: c.function?.name, args };
  });
  return { text: (msg.content || "").trim(), tool_calls };
}

export async function chamarOpenAICompat({ chave, modelo, baseUrl, sistema, mensagens, ferramentas, fetchFn = fetch }) {
  const r = await fetchFn(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${chave}` },
    body: JSON.stringify(paraOpenAI(sistema, mensagens, ferramentas, modelo)),
  });
  if (!r.ok) throw new Error(`Provedor HTTP ${r.status}`);
  return deOpenAI(await r.json());
}

/** Ponto único de chamada por provedor. */
export function chamarProvedor(provedor, opcoes) {
  if (provedor === "gemini") return chamarGemini(opcoes);
  if (provedor === "openai_compat") return chamarOpenAICompat(opcoes);
  throw new Error(`Provedor não suportado: ${provedor}`);
}

export const _internos = { paraGemini, deGemini, paraOpenAI, deOpenAI };
