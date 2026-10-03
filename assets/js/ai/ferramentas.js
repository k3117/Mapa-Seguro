/**
 * Ferramentas controladas do Assistente (function calling).
 * O modelo NUNCA acessa os dados diretamente: ele pede uma ferramenta,
 * os argumentos são validados aqui, e a consulta roda sobre os JSON oficiais.
 */
import * as Q from "../consultas.js";
import * as O from "../ocorrencias.js";

const INDICADORES = ["feminicidio", "estupro"];
const TOPICOS = ["finalidade", "fontes", "classificacao", "localizacao", "atualizacao", "correcoes",
  "privacidade", "investigacao_condenacao", "limitacoes", "mapa", "ia"];
const CORES = ["vermelho", "roxo", "rosa", "laranja", "amarelo", "azul", "marrom", "verde", "branco"];
const CATEGORIAS = ["feminicidio", "tentativa_feminicidio", "violencia_sexual", "violencia_sexual_crianca", "outros_crianca"];
const PERIODOS_OC = ["7d", "30d", "90d", "6m", "12m", "24m", "5a", "ano", "tudo"];

const filtroOcSchema = {
  type: "object",
  properties: {
    categorias: { type: "array", items: { type: "string", enum: CATEGORIAS }, description: "Vazio = todas" },
    municipio: { type: "string", description: "Nome do município de Goiás (ex.: Goiânia)" },
    bairro: { type: "string", description: "Nome do bairro/setor" },
    publico: { type: "string", enum: ["todos", "mulheres", "criancas_adolescentes", "nao_informado"] },
    periodo: { type: "string", enum: PERIODOS_OC, description: "Padrão tudo (desde 2015)" },
    inicio: { type: "string", description: "AAAA-MM-DD (período personalizado)" },
    fim: { type: "string", description: "AAAA-MM-DD (período personalizado)" },
  },
};

const periodoSchema = {
  type: "object",
  description: "Período. Use tipo='ano' com 'ano'; tipo='ultimos' com 'meses'; tipo='intervalo' com 'inicio' e 'fim' (AAAA-MM); ou tipo='tudo'.",
  properties: {
    tipo: { type: "string", enum: ["ano", "ultimos", "intervalo", "tudo"] },
    ano: { type: "integer" },
    meses: { type: "integer" },
    inicio: { type: "string", description: "AAAA-MM" },
    fim: { type: "string", description: "AAAA-MM" },
  },
  required: ["tipo"],
};

/** Declarações (JSON Schema simples, compatível com Gemini e OpenAI). */
export const DECLARACOES = [
  {
    name: "contar_ocorrencias",
    description: "Conta registros do mapa (notas oficiais PCGO/SSP-GO/PMGO) com filtros e devolve totais por categoria, município e situação. Use para 'quantos casos...'.",
    parameters: filtroOcSchema,
  },
  {
    name: "buscar_ocorrencias",
    description: "Lista até 15 registros do mapa (mais recentes) com filtros: categoria, local (aproximado), datas, situação e fonte.",
    parameters: filtroOcSchema,
  },
  {
    name: "obter_caso",
    description: "Detalhes públicos de um registro pelo id (ex.: pcgo-197914). Use quando houver caso_id no contexto da página.",
    parameters: { type: "object", properties: { caso_id: { type: "string" } }, required: ["caso_id"] },
  },
  {
    name: "municipios_com_mais_registros",
    description: "Ranking de MUNICÍPIOS (nunca de pessoas) por número de registros no mapa, com filtros.",
    parameters: filtroOcSchema,
  },
  {
    name: "listar_indicadores",
    description: "Lista os indicadores oficiais disponíveis, anos cobertos e o território (Estado de Goiás). Use para saber o que existe na base.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "obter_estatisticas",
    description: "Estatística OFICIAL AGREGADA da SSP-GO (todo o Estado de Goiás, mensal, 2018 em diante) para feminicídio ou estupro. Use para totais oficiais; para registros do mapa use contar_ocorrencias.",
    parameters: {
      type: "object",
      properties: { indicador: { type: "string", enum: INDICADORES }, periodo: periodoSchema },
      required: ["indicador", "periodo"],
    },
  },
  {
    name: "totais_anuais",
    description: "Totais anuais publicados de um indicador em todos os anos disponíveis.",
    parameters: { type: "object", properties: { indicador: { type: "string", enum: INDICADORES } }, required: ["indicador"] },
  },
  {
    name: "comparar_anos",
    description: "Compara os totais anuais de um indicador entre anos e calcula a variação.",
    parameters: {
      type: "object",
      properties: { indicador: { type: "string", enum: INDICADORES }, anos: { type: "array", items: { type: "integer" } } },
      required: ["indicador", "anos"],
    },
  },
  {
    name: "listar_categorias",
    description: "Lista as categorias do mapa (mulheres, crianças/adolescentes, medidas protetivas) com suas cores.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "explicar_legenda",
    description: "Explica o significado das cores da legenda do mapa. Sem 'cor', explica todas.",
    parameters: { type: "object", properties: { cor: { type: "string", enum: CORES } } },
  },
  {
    name: "listar_fontes",
    description: "Lista as fontes oficiais usadas pela plataforma, com órgão, link e ressalvas.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "listar_servicos",
    description: "Lista unidades públicas de atendimento em Goiânia (delegacias especializadas), com endereço e telefone oficiais.",
    parameters: { type: "object", properties: { publico: { type: "string", enum: ["mulheres", "criancas_adolescentes"] } } },
  },
  {
    name: "info_plataforma",
    description: "Textos oficiais da plataforma sobre um tópico (finalidade, metodologia, privacidade, limitações, IA etc.).",
    parameters: { type: "object", properties: { topico: { type: "string", enum: TOPICOS } }, required: ["topico"] },
  },
  {
    name: "contatos_emergencia",
    description: "Contatos de emergência e canais oficiais de ajuda.",
    parameters: { type: "object", properties: {} },
  },
];

const NOMES = new Set(DECLARACOES.map((d) => d.name));

function validarPeriodo(p) {
  if (!p || typeof p !== "object") return { tipo: "ultimos", meses: 12 };
  const tipo = ["ano", "ultimos", "intervalo", "tudo"].includes(p.tipo) ? p.tipo : "ultimos";
  const out = { tipo };
  if (tipo === "ano") out.ano = Number.parseInt(p.ano, 10);
  if (tipo === "ultimos") out.meses = Math.max(1, Math.min(240, Number.parseInt(p.meses, 10) || 12));
  if (tipo === "intervalo") {
    out.inicio = /^\d{4}-\d{2}$/.test(p.inicio) ? p.inicio : "";
    out.fim = /^\d{4}-\d{2}$/.test(p.fim) ? p.fim : "";
  }
  return out;
}

const ind = (x) => (INDICADORES.includes(x) ? x : null);

function validarFiltroOc(a = {}) {
  const f = {};
  const cats = (Array.isArray(a.categorias) ? a.categorias : []).filter((c) => CATEGORIAS.includes(c));
  if (cats.length) f.categorias = cats;
  if (typeof a.municipio === "string" && a.municipio.trim()) f.municipio = a.municipio.trim().slice(0, 60);
  if (typeof a.bairro === "string" && a.bairro.trim()) f.bairro = a.bairro.trim().slice(0, 60);
  if (["mulheres", "criancas_adolescentes", "nao_informado"].includes(a.publico)) f.publico = a.publico;
  if (/^\d{4}-\d{2}-\d{2}$/.test(a.inicio || "") && /^\d{4}-\d{2}-\d{2}$/.test(a.fim || "")) f.periodo = { inicio: a.inicio, fim: a.fim };
  else f.periodo = PERIODOS_OC.includes(a.periodo) ? a.periodo : "tudo";
  return f;
}

/** Executa uma ferramenta com argumentos validados. Nunca lança: retorna {ok:false,...}. */
export function executarFerramenta(base, nome, args = {}) {
  if (!NOMES.has(nome)) return { ok: false, erro: "ferramenta_desconhecida" };
  try {
    switch (nome) {
      case "contar_ocorrencias":
      case "buscar_ocorrencias":
      case "municipios_com_mais_registros": {
        const f = validarFiltroOc(args);
        const lista = O.filtrar(base, f);
        const iv = O.intervaloDoPeriodo(f.periodo);
        const comum = {
          ok: true,
          periodo: O.descreverIntervalo(iv),
          filtros_aplicados: { categorias: f.categorias || "todas", municipio: f.municipio || "todo o estado", bairro: f.bairro || null, publico: f.publico || "todos" },
          total: lista.length,
          observacao: "Registros = notas oficiais divulgadas (PCGO, SSP-GO, PMGO). Não representam todas as ocorrências nem condenações.",
        };
        const fontes = [...new Map(lista.flatMap((r) => r.fontes).map((x) => [x.url, x])).values()].slice(0, 8)
          .map((x) => ({ titulo: `Nota oficial — ${x.orgao} (${x.data_publicacao.split("-").reverse().join("/")})`, orgao: x.orgao, url: x.url, data_consulta_fonte: x.data_publicacao }));
        if (nome === "contar_ocorrencias") {
          return { ...comum, por_categoria: O.contarPor(lista, "categoria").map((x) => ({ categoria: Q.categoria(base, x.chave)?.rotulo, total: x.total })),
            por_municipio: O.contarPor(lista, "municipio").slice(0, 10), por_situacao: O.contarPor(lista, "status_juridico").map((x) => ({ situacao: base.categorias.status_juridico[x.chave], total: x.total })), fontes };
        }
        if (nome === "municipios_com_mais_registros") return { ...comum, municipios: O.contarPor(lista, "municipio").slice(0, 15), fontes };
        const ult = [...lista].sort((a, b) => b.data_publicacao.localeCompare(a.data_publicacao)).slice(0, 15);
        return { ...comum, registros: ult.map((r) => { const p = O.resumoPublico(base, r); delete p.fontes; return { ...p, fonte: r.fontes[0].sigla }; }), fontes: ult.map((r) => O.resumoPublico(base, r).fontes[0]) };
      }
      case "obter_caso": {
        const r = O.obterCaso(base, String(args.caso_id || "").toLowerCase().trim());
        if (!r) return { ok: false, erro: "caso_nao_encontrado" };
        const pub = O.resumoPublico(base, r);
        return { ok: true, caso: pub, fontes: [...pub.fontes, ...pub.reportagens.map((x) => ({ titulo: `Reportagem — ${x.veiculo} (${x.data.split("-").reverse().join("/")})`, url: x.url, orgao: x.veiculo }))],
          observacao: "A plataforma não armazena nomes, idades, endereços nem texto da nota. Para detalhes, a pessoa deve abrir a fonte oficial." };
      }
      case "listar_indicadores":
        return {
          ok: true,
          territorio: "Estado de Goiás (sem recorte por município)",
          anos: Q.anosDisponiveis(base),
          indicadores: Q.listarIndicadores(base).map((i) => ({ id: i.id, rotulo: i.rotulo, nome_oficial: i.nome_oficial, nota: i.nota })),
          ultimo_mes_disponivel: Q.rotuloMesLongo(Q.mesesDisponiveis(base, "feminicidio").at(-1)),
        };
      case "obter_estatisticas":
        if (!ind(args.indicador)) return { ok: false, erro: "indicador_invalido", validos: INDICADORES };
        return Q.obterEstatisticas(base, args.indicador, validarPeriodo(args.periodo));
      case "totais_anuais":
        if (!ind(args.indicador)) return { ok: false, erro: "indicador_invalido", validos: INDICADORES };
        return Q.totaisAnuais(base, args.indicador);
      case "comparar_anos":
        if (!ind(args.indicador)) return { ok: false, erro: "indicador_invalido", validos: INDICADORES };
        return Q.compararAnos(base, args.indicador, (Array.isArray(args.anos) ? args.anos : []).slice(0, 10).map((a) => Number.parseInt(a, 10)).filter(Number.isFinite));
      case "listar_categorias":
        return { ok: true, categorias: Q.listarCategorias(base).map((c) => ({ id: c.id, rotulo: c.rotulo, grupo: c.grupo_rotulo, cor: c.nome_cor })),
          nota: "Os registros do mapa vêm de notas oficiais. Estatísticas mensais agregadas da SSP-GO existem apenas para feminicídio e estupro (total)." };
      case "explicar_legenda":
        return Q.explicarLegenda(base, CORES.includes(args.cor) ? args.cor : "");
      case "listar_fontes":
        return { ok: true, fontes: Q.listarFontes(base) };
      case "listar_servicos":
        return Q.listarServicos(base, ["mulheres", "criancas_adolescentes"].includes(args.publico) ? args.publico : undefined);
      case "info_plataforma":
        return Q.infoPlataforma(base, TOPICOS.includes(args.topico) ? args.topico : "");
      case "contatos_emergencia":
        return Q.contatosEmergencia(base);
    }
  } catch (e) {
    return { ok: false, erro: "falha_interna" };
  }
  return { ok: false, erro: "nao_tratado" };
}

/** Extrai citações (fontes) de um resultado de ferramenta, de forma determinística. */
export function fontesDoResultado(res) {
  const out = [];
  const add = (f) => f && f.url && out.push({ title: f.titulo, url: f.url, orgao: f.orgao, date: f.data_consulta_fonte || null });
  (res?.fontes || []).forEach(add);
  return out;
}
