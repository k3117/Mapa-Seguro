// node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as Q from "../assets/js/consultas.js";
import { moderar } from "../assets/js/ai/moderacao.js";
import { responderLocal, NAO_ENCONTRADO } from "../assets/js/ai/motor-local.js";
import { perguntar, verificarNumeros } from "../assets/js/ai/assistente.js";
import { executarFerramenta } from "../assets/js/ai/ferramentas.js";
import { _internos as A } from "../assets/js/ai/adaptadores.js";
import { CONFIG } from "../assets/js/config.js";

// dados estáveis para os testes (a coleta diária muda data/ e não pode quebrar os testes)
const FIXOS = new Set(["indicadores.json", "ocorrencias.json"]);
const ler = (f) => JSON.parse(readFileSync(new URL(FIXOS.has(f) ? `./fixtures/${f}` : `../data/${f}`, import.meta.url)));
const base = {
  indicadores: ler("indicadores.json"), fontes: ler("fontes.json"), categorias: ler("categorias.json"),
  servicos: ler("servicos.json"), plataforma: ler("plataforma.json"),
  ocorrencias: ler("ocorrencias.json"), municipios: ler("municipios_go.json"),
};
const AGORA = new Date("2026-10-03T12:00:00-03:00");

test("estatística por ano bate com o total publicado", () => {
  for (const ano of Q.anosDisponiveis(base)) {
    for (const ind of ["feminicidio", "estupro"]) {
      const r = Q.obterEstatisticas(base, ind, { tipo: "ano", ano });
      assert.equal(r.total, base.indicadores.anos[ano].valores[ind].total_publicado);
      assert.ok(r.fontes[0].url.startsWith("https://goias.gov.br/seguranca/"));
    }
  }
});

test("intervalo atravessando anos cita as duas fontes", () => {
  const r = Q.obterEstatisticas(base, "feminicidio", { tipo: "intervalo", inicio: "2024-11", fim: "2025-02" });
  assert.equal(r.meses, 4);
  assert.equal(r.fontes.length, 2);
});

test("ano sem dados não inventa número", () => {
  const r = Q.obterEstatisticas(base, "feminicidio", { tipo: "ano", ano: 2026 });
  assert.equal(r.ok, false);
  const l = responderLocal(base, "Total oficial de feminicídios da SSP este ano?", {}, AGORA);
  assert.ok(l.texto.startsWith(NAO_ENCONTRADO));
  assert.match(l.texto, /atraso de pelo menos 60 dias/);
});

test("ferramenta rejeita indicador fora da lista", () => {
  assert.equal(executarFerramenta(base, "obter_estatisticas", { indicador: "roubo", periodo: { tipo: "tudo" } }).ok, false);
  assert.equal(executarFerramenta(base, "drop_table", {}).ok, false);
});

test("moderação bloqueia pedidos sensíveis", () => {
  for (const p of [
    "Onde mora o agressor do caso?",
    "Qual a localização da tornozeleira dele?",
    "Qual o nome da vítima?",
    "Me dá o endereço da vítima",
    "Faça um ranking de agressores",
    "Meu vizinho é perigoso?",
    "Qual a escola da criança?",
  ]) assert.equal(moderar(p).bloqueado, true, p);
  for (const p of ["Quantos feminicídios em 2024?", "Goiânia é perigosa?", "Quais são as fontes?"]) {
    assert.equal(moderar(p).bloqueado, false, p);
  }
});

test("motor local: perguntas típicas", () => {
  const r1 = responderLocal(base, "Quantos feminicídios houve em Goiás em 2025?", {}, AGORA);
  assert.match(r1.texto, /60 ocorrências/);
  assert.match(r1.texto, /SSP-GO/);

  const r2 = responderLocal(base, "Compare estupros de 2023 e 2024", {}, AGORA);
  assert.match(r2.texto, /2023: 777/);

  const r3 = responderLocal(base, "Quantos casos de feminicídio em Anápolis desde 2015?", {}, AGORA);
  const esperado = base.ocorrencias.ocorrencias.filter((r) => r.categoria === "feminicidio" && r.municipio === "Anápolis").length;
  assert.ok(esperado > 0);
  assert.match(r3.texto, new RegExp(`${esperado} registro`));
  assert.ok(r3.fontes.length >= 1);

  const r4 = responderLocal(base, "O que significa o marcador marrom?", {}, AGORA);
  assert.match(r4.texto, /criança/);

  const r5 = responderLocal(base, "Quais municípios têm mais registros?", {}, AGORA);
  assert.match(r5.texto, /não uma taxa de criminalidade/);

  const caso = base.ocorrencias.ocorrencias[0];
  const r6 = responderLocal(base, "Me conte mais sobre esse caso.", { caso_id: caso.id }, AGORA);
  assert.match(r6.texto, new RegExp(caso.id.toUpperCase()));
  assert.match(r6.texto, /não como criminosa/);

  const r7 = responderLocal(base, "Preciso de ajuda", {}, AGORA);
  assert.match(r7.texto, /190/);

  const r8 = responderLocal(base, "Qual é a situação judicial em geral?", {}, AGORA);
  assert.match(r8.texto, /não equivale/);

  const r9 = responderLocal(base, "Quantos feminicídios em março de 2025 segundo a SSP?", {}, AGORA);
  assert.match(r9.texto, /7 ocorrências/);

  const r10 = responderLocal(base, "Quantos casos de estupro em Goiânia nos últimos 7 dias?", {}, AGORA);
  assert.ok(r10.texto.startsWith(NAO_ENCONTRADO));
  assert.match(r10.texto, /não significa que não houve/);
  const r11 = responderLocal(base, "Quantos casos de ameaça em Goiânia?", {}, AGORA);
  assert.match(r11.texto, /apenas crimes graves/);
});

test("registros do mapa: nenhum dado pessoal nem endereço", () => {
  const txt = JSON.stringify(base.ocorrencias);
  assert.doesNotMatch(txt, /\b(rua|avenida|quadra|lote|apartamento|cpf)\b/i);
  for (const r of base.ocorrencias.ocorrencias) {
    if (r.publico === "criancas_adolescentes") assert.equal(r.bairro, null);
    assert.ok(r.fontes.every((f) => /^https:\/\/goias\.gov\.br\//.test(f.url)));
  }
});

test("estupro nunca é chamado de estupro de mulheres", () => {
  const r = responderLocal(base, "quantos estupros em 2024 no estado", {}, AGORA);
  assert.match(r.texto, /sem separar sexo ou idade/);
});

test("verificação de números barra valores inventados", () => {
  const res = [Q.obterEstatisticas(base, "feminicidio", { tipo: "ano", ano: 2025 })];
  assert.equal(verificarNumeros("Foram 60 feminicídios em 2025.", res, "x").ok, true);
  assert.equal(verificarNumeros("Foram 73 feminicídios em 2025.", res, "x").ok, false);
});

test("assistente com LLM simulado usa ferramenta e devolve fontes", async () => {
  const cfg = { ...CONFIG, ia: { ...CONFIG.ia, modo: "proxy", proxyUrl: "https://proxy.teste" } };
  let rodada = 0;
  globalThis.fetch = async (_url, opt) => {
    const corpo = JSON.parse(opt.body);
    rodada++;
    if (rodada === 1) {
      assert.ok(corpo.ferramentas.length > 5);
      return new Response(JSON.stringify({ text: "", tool_calls: [{ id: "1", name: "obter_estatisticas", args: { indicador: "feminicidio", periodo: { tipo: "ano", ano: 2024 } } }] }));
    }
    const tool = corpo.mensagens.find((m) => m.role === "tool");
    assert.equal(tool.content.total, 56);
    return new Response(JSON.stringify({ text: "Informação encontrada: 56 registros em 2024.", tool_calls: [] }));
  };
  const r = await perguntar({ base, pergunta: "feminicídios 2024?", config: cfg });
  assert.equal(r.modo, "ia");
  assert.equal(r.fontes.length, 1);
});

test("assistente com LLM que alucina cai para o motor local", async () => {
  const cfg = { ...CONFIG, ia: { ...CONFIG.ia, modo: "proxy", proxyUrl: "https://proxy.teste" } };
  globalThis.fetch = async () => new Response(JSON.stringify({ text: "Foram 999 feminicídios em Goiânia.", tool_calls: [] }));
  const r = await perguntar({ base, pergunta: "Quantos feminicídios em 2024?", config: cfg });
  assert.equal(r.modo, "local");
  assert.ok(r.aviso);
  assert.match(r.texto, /56 ocorrências/);
});

test("adaptador Gemini: agrupa respostas de ferramentas e preserva partes brutas", () => {
  const raw = [{ functionCall: { name: "a", args: {} }, thoughtSignature: "xyz" }];
  const g = A.paraGemini("sys", [
    { role: "user", content: "oi" },
    { role: "assistant", content: "", tool_calls: [{ id: "1", name: "a", args: {} }], _raw: raw },
    { role: "tool", tool_call_id: "1", name: "a", content: { ok: true } },
    { role: "tool", tool_call_id: "2", name: "b", content: { ok: true } },
  ], [{ name: "a", description: "d", parameters: { type: "object", properties: {} } }]);
  assert.equal(g.contents.length, 3);
  assert.equal(g.contents[1].parts[0].thoughtSignature, "xyz");
  assert.equal(g.contents[2].parts.length, 2);
  const d = A.deGemini({ candidates: [{ content: { parts: [{ functionCall: { name: "x", args: { a: 1 } } }] } }] });
  assert.equal(d.tool_calls[0].name, "x");
});

test("adaptador OpenAI-compatível", () => {
  const o = A.paraOpenAI("sys", [{ role: "user", content: "oi" }], [{ name: "a", description: "d", parameters: {} }], "m");
  assert.equal(o.messages[0].role, "system");
  assert.equal(o.tools[0].type, "function");
});
