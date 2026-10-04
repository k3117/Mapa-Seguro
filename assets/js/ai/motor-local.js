/**
 * Motor local do Assistente (sem LLM, custo zero).
 * Classifica a pergunta -> chama as MESMAS ferramentas controladas -> monta a resposta
 * com modelos de texto fixos. Também é o fallback quando o provedor de IA falha.
 */
import { executarFerramenta, fontesDoResultado } from "./ferramentas.js";
import { formatarNumero as n, MESES_LONGOS } from "../consultas.js";
import { bairrosConhecidos, avisoDefasagem } from "../ocorrencias.js";

export const NAO_ENCONTRADO = "Não encontrei essa informação nas fontes utilizadas pelo Mapa Seguro.";

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const MESES_N = MESES_LONGOS.map((m) => norm(m));

/* categorias do mapa (ordem = precedência na detecção) */
const CAT_RE = [
  ["tentativa_feminicidio", /tentativas? de feminic/],
  ["feminicidio", /feminic/],
  ["violencia_sexual_crianca", /(estupro de vulneravel|abuso sexual infantil|exploracao sexual|pornografia infantil|violencia sexual contra (as )?crianc|abuso sexual de crianc|estupro de crianc)/],
  ["outros_crianca", /(maus.?tratos|abandono de incapaz|crimes? contra (as )?crianc|violencia contra (as )?crianc|crianc\w* e adolescent)/],
  ["violencia_sexual", /(estupro|violencia sexual|importunacao|assedio sexual|crimes? sexua)/],
  ["descumprimento_mp", /(medidas? protetiv|descumprimento)/],
  ["perseguicao", /(perseguic|stalking)/],
  ["lesao_corporal", /(lesao corporal|agress)/],
  ["ameaca", /ameac/],
  ["violencia_domestica", /(violencia domestica|maria da penha|violencia contra a mulher|violencia psicologica)/],
];

const TOPICOS = [
  { re: /(nao|so) permite concluir|o que (o mapa|o site)? ?nao (mostra|permite|diz)|ausencia de registro|nao (significa|representa) todas/, topico: "nao_permite" },
  { re: /(site|mapa|projeto|plataforma) (e )?oficial|e do governo|do governo de goias\?|independente|quem (faz|mantem|criou)/, topico: "finalidade" },
  { re: /finalidade|objetivo|para que serve|o que e (o )?(mapa seguro|site|plataforma)|sobre o site/, topico: "finalidade" },
  { re: /privacidade|lgpd|dados pessoais|meus dados|anonim/, topico: "privacidade" },
  { re: /metodolog|como (os dados )?(sao|e) classific|classificac/, topico: "classificacao" },
  { re: /atualiz|defasagem|atraso/, topico: "atualizacao" },
  { re: /corrig|correc|\berro\b|contest/, topico: "correcoes" },
  { re: /limitac|limite dos dados|o que (nao )?tem|o que falta/, topico: "limitacoes" },
  { re: /condenac|condenad|investigac|acusad|processo|culpad|\breu\b|criminoso|judicia|juridic/, topico: "investigacao_condenacao" },
  { re: /inteligencia artificial|\bia\b|como (voce|vc) funciona|assistente funciona|chatbot/, topico: "ia" },
  { re: /localizac|precis|endereco|por que (o ponto|o marcador)|onde fica o ponto/, topico: "localizacao" },
  { re: /como funciona o mapa|como usar o mapa|o mapa mostra|circulos? com numero|numeros? no mapa/, topico: "mapa" },
];

const CORES = ["vermelho", "roxo", "rosa", "laranja", "amarelo", "azul", "marrom", "verde", "branco"];
const ROT = {
  feminicidio: "feminicídio", tentativa_feminicidio: "tentativa de feminicídio", violencia_sexual: "violência sexual",
    violencia_sexual_crianca: "violência sexual contra criança/adolescente", outros_crianca: "homicídio, tortura ou maus-tratos contra criança/adolescente",
  descumprimento_mp: "descumprimento de medida protetiva",
};

function detectarCategorias(t) {
  const out = [];
  let resto = t;
  for (const [id, re] of CAT_RE) {
    if (re.test(resto)) { out.push(id); resto = resto.replace(re, " "); }
  }
  if (/\bcrianc|adolescen|infantil/.test(t) && !out.some((c) => c.endsWith("crianca"))) out.push("violencia_sexual_crianca", "outros_crianca");
  return out;
}

function detectarMunicipio(base, t) {
  const muns = [...base.municipios.municipios].sort((a, b) => b.nome.length - a.nome.length);
  for (const m of muns) {
    const k = norm(m.nome);
    // "Goiás" é o estado, exceto quando explicitamente a cidade de Goiás
    if (k === "goias" && !/(cidade|municipio) de goias|goias velho/.test(t)) continue;
    if (new RegExp(`(^|[^a-z])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(t)) {
      // evita palavras comuns ("posse", "formosa"...) sem preposição de lugar
      if (k.split(" ").length === 1 && !new RegExp(`(em|de|no|na|para|municipio de|cidade de) ${k}`).test(t)) continue;
      return m.nome;
    }
  }
  // "Aparecida" sozinha = Aparecida de Goiânia (forma usual nas notas e na fala)
  if (/(em|de|no|na|para) aparecida\b(?! do rio)/.test(t)) return "Aparecida de Goiânia";
  return null;
}

function detectarBairro(base, t) {
  const b = bairrosConhecidos(base).sort((x, y) => y.bairro.length - x.bairro.length).find((x) => t.includes(norm(x.bairro)));
  return b ? b.bairro : null;
}

/** Período para os registros do mapa. */
function periodoMapa(t, agora) {
  const y = agora.getFullYear();
  const dias = t.match(/ultim[oa]s? (\d{1,3}) dias/);
  if (dias) {
    const d = Number(dias[1]);
    if (d <= 7) return { periodo: "7d" };
    if (d <= 30) return { periodo: "30d" };
    if (d <= 90) return { periodo: "90d" };
  }
  if (/ultima semana|7 dias/.test(t)) return { periodo: "7d" };
  if (/ultimo mes|30 dias|mes passado/.test(t)) return { periodo: "30d" };
  if (/(3|tres) meses|90 dias|trimestre/.test(t)) return { periodo: "90d" };
  if (/(6|seis) meses|semestre/.test(t)) return { periodo: "6m" };
  if (/(12|doze) meses|ultimo ano/.test(t)) return { periodo: "12m" };
  if (/(24|vinte e quatro) meses|dois anos|2 anos/.test(t)) return { periodo: "24m" };
  if (/ano atual|este ano|esse ano|neste ano/.test(t)) return { periodo: "ano" };
  if (/ano passado/.test(t)) return { inicio: `${y - 1}-01-01`, fim: `${y - 1}-12-31` };
  const desde = t.match(/(?:desde|a partir de) (20\d{2})/);
  if (desde) return { inicio: `${desde[1]}-01-01`, fim: agora.toISOString().slice(0, 10) };
  const entre = t.match(/(?:de|entre) (20\d{2}) (?:a|e|ate) (20\d{2})/);
  if (entre) return { inicio: `${entre[1]}-01-01`, fim: `${entre[2]}-12-31` };
  const anos = [...t.matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1]));
  const mesIdx = MESES_N.findIndex((m) => new RegExp(`\\b${m}\\b`).test(t));
  if (mesIdx >= 0 && anos.length === 1) {
    const mm = String(mesIdx + 1).padStart(2, "0");
    const ult = new Date(anos[0], mesIdx + 1, 0).getDate();
    return { inicio: `${anos[0]}-${mm}-01`, fim: `${anos[0]}-${mm}-${ult}` };
  }
  if (anos.length === 1) return { inicio: `${anos[0]}-01-01`, fim: `${anos[0]}-12-31` };
  if (/(5|cinco) anos/.test(t)) return { periodo: "5a" };
  if (/desde|todos|total geral|historic/.test(t)) return { periodo: "tudo" };
  return null;
}

/** Período para a estatística agregada SSP-GO (mensal). */
function periodoSSP(t, agora) {
  const anoAtual = agora.getFullYear();
  const anos = [...t.matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1]));
  const ult = t.match(/ultim[oa]s? (\d{1,3}) mes/);
  if (ult) return { tipo: "ultimos", meses: Number(ult[1]) };
  if (/ano atual|este ano|esse ano|neste ano/.test(t)) return { tipo: "ano", ano: anoAtual };
  if (/ano passado/.test(t)) return { tipo: "ano", ano: anoAtual - 1 };
  const mesIdx = MESES_N.findIndex((m) => new RegExp(`\\b${m}\\b`).test(t));
  if (mesIdx >= 0 && anos.length === 1) {
    const ym = `${anos[0]}-${String(mesIdx + 1).padStart(2, "0")}`;
    return { tipo: "intervalo", inicio: ym, fim: ym };
  }
  if (anos.length === 1) return { tipo: "ano", ano: anos[0] };
  return { tipo: "ultimos", meses: 12 };
}

const dataBR = (d) => (d ? d.split("-").reverse().join("/") : "não informada");

function textoCaso(c) {
  return [
    `Registro ${c.id.toUpperCase()}: ${c.categoria.toLowerCase()} em ${c.local}, divulgado em nota oficial publicada em ${dataBR(c.data_publicacao)}.`,
    c.data_fato ? `- Data do fato: ${dataBR(c.data_fato)}` : "- Data do fato: não informada na nota.",
    `- Situação jurídica: ${c.situacao}${c.medidas.length ? ` (${c.medidas.join(", ")})` : ""}`,
    `- Localização: ${c.precisao}`,
    c.reportagens.length ? `- Reportagens cadastradas: ${c.reportagens.length}` : "",
    "",
    c.termo_pessoa === "condenado"
      ? "Contexto: a nota informa que a pessoa foi condenada. O Mapa Seguro não verifica se a condenação é definitiva."
      : `Contexto: é um registro policial. A pessoa citada é tratada como "${c.termo_pessoa}", de acordo com a fase informada na nota, e não como criminosa.`,
    "Atenção: o Mapa Seguro não guarda nomes, idades nem endereços. Os detalhes divulgados pelo órgão estão na nota oficial, com link abaixo.",
  ].filter((x) => x !== "").join("\n");
}

/**
 * Responde localmente. contexto (opcional): {pagina, caso_id, filtros, indicador, periodo}
 * Retorna {texto, fontes, ferramentas}
 */
export function responderLocal(base, pergunta, contexto = {}, agora = new Date()) {
  const t = norm(pergunta);
  const usadas = [];
  const usar = (nome, args) => { usadas.push({ nome, args }); return executarFerramenta(base, nome, args); };
  const fim = (texto, fontes = []) => ({ texto, fontes: dedup(fontes), ferramentas: usadas });

  // 1. emergência / onde buscar ajuda
  if (/emergenc|socorro|estou em perigo|corro risco|me ajud|preciso de ajuda|onde (posso )?(denunciar|registrar|pedir ajuda)|como denunciar|delegacia da mulher|deam\b|dpca\b/.test(t)) {
    const c = usar("contatos_emergencia", {});
    const s = usar("listar_servicos", {});
    return fim([c.aviso, "", ...c.contatos.map((x) => `- ${x.numero}, ${x.nome}: ${x.quando}`), "",
      "Unidades públicas de atendimento em Goiânia (endereços oficiais da Polícia Civil):",
      ...s.servicos.map((x) => `- ${x.nome}: ${x.endereco}. Tel.: ${x.telefones.join(", ")}`)].join("\n"), fontesDoResultado(s));
  }

  // 2. saudação
  if (/^(oi|ola|bom dia|boa tarde|boa noite|ajuda|help|o que (voce|vc) (faz|pode)|como (te )?usar)\b/.test(t.trim())) {
    return fim("Olá! Posso consultar os registros do mapa (notas oficiais da Polícia Civil, SSP-GO e PM de Goiás) e as estatísticas oficiais da SSP-GO, explicar a legenda, as fontes, a metodologia e os canais de ajuda.\n\nExemplos: \"Quantos casos de feminicídio em Goiânia nos últimos 12 meses?\", \"Quais municípios têm mais registros de feminicídio?\", \"Quantos feminicídios houve em Goiás em 2025?\", \"O que significa o marcador marrom?\".");
  }

  // 2b. categorias fora do escopo (só crimes graves)
  if (/\b(ameac|lesao corporal|agress|perseguic|stalking|violencia domestica|medidas? protetiv|descumprimento)/.test(t) && !/feminic|estupr|sexual|crianc/.test(t)) {
    return fim("O MAPA SEGURO reúne apenas crimes graves: feminicídio, tentativa de feminicídio, violência sexual, violência sexual contra criança/adolescente e homicídio, tortura ou maus-tratos contra criança/adolescente. Ameaça, lesão corporal, perseguição, violência doméstica sem esses crimes e descumprimento de medida protetiva não estão na base.\n\nSe você precisa de ajuda, ligue 180 (Central de Atendimento à Mulher) ou 190 em emergência.");
  }

  // 2c. por que não há registros recentes
  if (/por ?que (nao|so) (tem|ha|aparece)|sem (casos|registros|notas) (novos|recentes)|(nao|nada) (foi )?atualiz|ultim[oa] (atualizacao|nota|registro)|depois de (junho|julho)|desde (junho|julho)/.test(t)) {
    const av = avisoDefasagem(base, agora);
    return fim(av || "Os registros são atualizados automaticamente todos os dias com as notas oficiais publicadas pela PCGO, SSP-GO e PMGO. Nem toda ocorrência vira nota oficial, por isso alguns períodos têm poucos registros.");
  }

  // 2d. termos jurídicos
  const GLOSSARIO = [
    [/investigad/, "Investigado: pessoa apontada pela polícia como possível autora durante a investigação. Ainda não há acusação formal nem condenação."],
    [/indiciad|inquerito/, "Indiciado: ao concluir o inquérito, a polícia indica formalmente quem considera autor. O inquérito vai ao Ministério Público, que decide se denuncia. Ainda não é condenação."],
    [/\breu\b|denuncia/, "Réu: pessoa que responde a processo depois que a Justiça recebe a denúncia do Ministério Público. Ainda não é condenação."],
    [/condenad|condenacao|sentenca/, "Condenado: pessoa com sentença judicial de condenação. Só nessa etapa alguém pode ser tratado como autor do crime; antes disso vale a presunção de inocência."],
    [/flagrante/, "Prisão em flagrante: prisão no momento do crime ou logo depois. É uma medida da fase policial e não significa condenação."],
    [/preventiva|temporaria/, "Prisão preventiva ou temporária: prisão decidida por um juiz durante a investigação ou o processo, para proteger a vítima ou a investigação. Não é condenação."],
  ];
  if (/(o que (e|significa|quer dizer)|diferenca entre|significado)/.test(t)) {
    const itens = GLOSSARIO.filter(([re]) => re.test(t)).map(([, txt]) => txt);
    if (itens.length) return fim(itens.join("\n\n") + "\n\nO MAPA SEGURO usa sempre o termo da fase informada na nota oficial e nunca chama ninguém de criminoso sem condenação.");
  }

  // 2e. "lugar perigoso" / segurança de bairro: não fazemos avaliação de risco
  if (/perigos|insegur|(mais|menos) segur|evitar|risco de (andar|morar)|devo (morar|ir)/.test(t)) {
    return fim("O MAPA SEGURO não classifica bairros ou cidades como perigosos ou seguros. Os registros são notas oficiais divulgadas pela polícia, que não cobrem todas as ocorrências: mais registros num lugar pode refletir mais divulgação ou mais delegacias, não mais risco.\n\nPosso informar quantos registros há num município ou período (ex.: \"Quantos casos em Goiânia em 2025?\"). Em emergência, ligue 190; para orientação, 180.");
  }

  // 3. caso aberto na página / id citado
  const idCitado = (t.match(/\b((?:pcgo|sspgo|pmgo)-\d+)\b/) || [])[1];
  if (idCitado || (contexto.caso_id && /(esse|este|desse|deste|nesse|neste|o) caso|me (conte|explique|fale)|situac|quando (ocorreu|aconteceu)|fontes?|oficial|detalhe|o que aconteceu|explique/.test(t))) {
    const r = usar("obter_caso", { caso_id: idCitado || contexto.caso_id });
    if (!r.ok) return fim(NAO_ENCONTRADO);
    return fim(textoCaso(r.caso), fontesDoResultado(r));
  }

  // 4. legenda
  const cor = CORES.find((c) => new RegExp(`\\b${c}\\b`).test(t));
  if (cor || /legenda|cores|icone|simbolo/.test(t)) {
    const r = usar("explicar_legenda", { cor: cor || undefined });
    if (!r.ok) return fim(NAO_ENCONTRADO);
    return fim(`${r.itens.map((i) => `- ${i.cor}: ${i.significado}`).join("\n")}\n\n${r.observacao}`);
  }

  const cats = detectarCategorias(t);
  const municipio = detectarMunicipio(base, t);
  const bairro = detectarBairro(base, t);

  // 5. fontes
  if (/fonte|de onde vem|origem dos dados/.test(t) && !cats.length) {
    const r = usar("listar_fontes", {});
    const p = usar("info_plataforma", { topico: "fontes" });
    return fim(`${p.texto}\n\n${r.fontes.map((f) => `- ${f.titulo}, ${f.orgao}`).join("\n")}`, fontesDoResultado(r));
  }

  // 5b. diferença entre o mapa e a estatística oficial
  if (/diferen|nao bate|maior|menor|compar/.test(t) && /estatistic|ssp|oficial|numero/.test(t) && /mapa|registro/.test(t)) {
    return fim("A estatística da SSP-GO conta todas as ocorrências registradas no sistema da polícia. O mapa conta apenas os casos que os órgãos divulgaram em notas no site oficial. A maior parte das ocorrências não vira nota, por isso o número do mapa é menor e não serve para medir a quantidade de crimes. As duas bases não devem ser comparadas como se fossem equivalentes.\n\nAtenção: a SSP-GO informa que seus dados podem mudar conforme o andamento das investigações.");
  }

  // 6. tópicos institucionais (sem pedido de números)
  const top = TOPICOS.find((x) => x.re.test(t));
  if (top && !cats.length && !/quant|numero|total|casos|registros/.test(t)) {
    const r = usar("info_plataforma", { topico: top.topico });
    return fim(r.ok ? r.texto : NAO_ENCONTRADO);
  }

  // 7. ranking de municípios
  if (/(quais|que) (municipios|cidades|regioes|lugares|bairros)|(municipio|cidade|regiao|bairro)s? com mais|onde (ha|tem|ocorre)m? mais|mais (casos|registros|ocorrencias)/.test(t)) {
    const per = periodoMapa(t, agora) || { periodo: "tudo" };
    const r = usar("municipios_com_mais_registros", { categorias: cats, ...per });
    if (!r.total) return fim(`${NAO_ENCONTRADO}\n\nNão há registros no mapa para esses filtros (${r.periodo}).`);
    return fim(`Municípios com mais registros no mapa${cats.length ? ` de ${cats.map((c) => ROT[c]).join(", ")}` : ""}, de ${r.periodo}:\n${r.municipios.slice(0, 10).map((m) => `- ${m.chave}: ${m.total}`).join("\n")}\n\nContexto: é a contagem de notas oficiais divulgadas, não uma taxa de criminalidade; municípios maiores e com delegacias especializadas tendem a divulgar mais.\nAtenção: as notas não cobrem todas as ocorrências e não indicam que um lugar é mais ou menos seguro.${/bairro/.test(t) ? " Não há ranking por bairro: a maioria das notas não informa bairro." : ""}`, fontesDoResultado(r));
  }

  // 8. estatística oficial agregada SSP-GO
  const ind = cats.includes("feminicidio") ? "feminicidio" : /\bestupro/.test(t) && !/vulneravel|crianc/.test(t) ? "estupro" : null;
  const querSSP = ind && !municipio && !bairro && (/ssp|estatistic|oficial|goias|estado|\b20\d{2}\b|por ano|cada ano|compar|varia|aument|diminu/.test(t));
  if (querSSP) {
    const anos = [...t.matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1]));
    let res, corpo;
    if (/compar|varia|aument|diminu|cresc|caiu|queda|evolu/.test(t) && anos.length >= 2) {
      res = usar("comparar_anos", { indicador: ind, anos });
      if (!res.ok) return fim(NAO_ENCONTRADO);
      const v = res.variacao ? `\nEntre ${res.variacao.de} e ${res.variacao.para}: ${res.variacao.diferenca > 0 ? "+" : ""}${n(res.variacao.diferenca)}${res.variacao.percentual !== null ? ` (${res.variacao.percentual > 0 ? "+" : ""}${String(res.variacao.percentual).replace(".", ",")}%)` : ""}.` : "";
      corpo = `Estatística oficial da SSP-GO para o Estado de Goiás, ${res.rotulo.toLowerCase()}:\n${res.anos.map((a) => `- ${a.ano}: ${a.total === null ? "sem dado publicado" : n(a.total)}`).join("\n")}${v}\n\nContexto: ocorrências registradas, não condenações.\nAtenção: sem recorte por município; números sujeitos a revisão pela SSP-GO.`;
    } else if (/por ano|cada ano|ano a ano|historic|todos os anos|serie/.test(t)) {
      res = usar("totais_anuais", { indicador: ind });
      corpo = `Estatística oficial da SSP-GO para o Estado de Goiás, ${res.rotulo.toLowerCase()} por ano:\n${res.anos.map((a) => `- ${a.ano}: ${n(a.total)}`).join("\n")}\n\nContexto: ocorrências registradas, não condenações.\nAtenção: sem recorte por município.`;
    } else {
      res = usar("obter_estatisticas", { indicador: ind, periodo: periodoSSP(t, agora) });
      if (!res.ok) {
        corpo = res.motivo === "ano_indisponivel" || res.motivo === "fora_da_cobertura"
          ? `${NAO_ENCONTRADO}\n\nA estatística oficial da SSP-GO está publicada de ${res.primeiro.replace("-", "/")} a ${res.ultimo.replace("-", "/")} (a SSP-GO publica com atraso de pelo menos 60 dias).`
          : NAO_ENCONTRADO;
      } else {
        corpo = `Segundo a estatística oficial da SSP-GO, foram registradas ${n(res.total)} ocorrências de ${res.rotulo.toLowerCase()} no Estado de Goiás (${res.periodo.descricao}).${res.meses > 1 ? `\n- Média mensal: ${String(res.media_mensal).replace(".", ",")}\n- Mês com mais registros: ${res.maior_mes.mes} (${n(res.maior_mes.valor)})` : ""}\n\nContexto: ocorrências registradas no sistema RAI, não condenações.${ind === "estupro" ? " O indicador reúne todas as vítimas, sem separar sexo ou idade." : ""}\nAtenção: a estatística agregada não informa município nem bairro.`;
      }
    }
    return fim(corpo, fontesDoResultado(res));
  }

  // 9. registros do mapa (contagem / lista)
  const pedeNumero = /quant|numero|total|estatistic|registr|casos|ocorrencias|houve|teve|aconteceram|existem|ha casos|lista|liste|mostre|quais casos|ultimos casos|recentes/.test(t);
  if (cats.length || municipio || bairro || pedeNumero) {
    const per = periodoMapa(t, agora) || (contexto.filtros?.periodo && typeof contexto.filtros.periodo === "string" ? { periodo: contexto.filtros.periodo } : { periodo: "tudo" });
    const filtro = { categorias: cats, municipio: municipio || undefined, bairro: bairro || undefined, ...per };
    if (/lista|liste|mostre|quais (foram|sao) os casos|quais casos|ultimos casos|recentes/.test(t)) {
      const r = usar("buscar_ocorrencias", filtro);
      if (!r.total) return fim(`${NAO_ENCONTRADO}\n\nNão há registros no mapa com esses filtros (${r.periodo}).`);
      return fim(`${r.total} ${r.total === 1 ? "registro" : "registros"} no mapa${cats.length ? ` de ${cats.map((c) => ROT[c]).join(", ")}` : ""}${municipio ? ` em ${municipio}` : ""}${bairro ? ` (${bairro})` : ""}, de ${r.periodo}. Os mais recentes:\n${r.registros.map((x) => `- ${dataBR(x.data_publicacao)} · ${x.categoria} · ${x.local} · ${x.situacao} (#${x.id.toUpperCase()})`).join("\n")}\n\nContexto: cada item é uma nota oficial; abra o caso no mapa para ver a fonte.\nAtenção: as notas não cobrem todas as ocorrências; registro não é condenação.`, fontesDoResultado(r));
    }
    const r = usar("contar_ocorrencias", filtro);
    let txt;
    if (!r.total) {
      txt = `${NAO_ENCONTRADO}\n\nNão há registros no mapa${cats.length ? ` de ${cats.map((c) => ROT[c]).join(", ")}` : ""}${municipio ? ` em ${municipio}` : ""}${bairro ? ` no bairro ${bairro}` : ""} no período ${r.periodo}. Isso não significa que não houve ocorrências: o mapa reúne apenas casos divulgados em notas oficiais.${r.periodo && avisoDefasagem(base, agora) ? "\n\n" + avisoDefasagem(base, agora) : ""}`;
    } else {
      txt = `${r.total} ${r.total === 1 ? "registro" : "registros"} no mapa${cats.length ? ` de ${cats.map((c) => ROT[c]).join(", ")}` : ""}${municipio ? ` em ${municipio}` : " no Estado de Goiás"}${bairro ? ` (bairro ${bairro})` : ""}, de ${r.periodo}.`;
      if (r.por_categoria.length > 1) txt += `\n${r.por_categoria.map((x) => `- ${x.categoria}: ${x.total}`).join("\n")}`;
      if (!municipio && r.por_municipio.length > 1) txt += `\nMunicípios com mais registros: ${r.por_municipio.slice(0, 5).map((x) => `${x.chave} (${x.total})`).join(", ")}.`;
      txt += `\nSituação: ${r.por_situacao.map((x) => `${x.situacao} (${x.total})`).join(", ")}.`;
      txt += `\n\nContexto: são notas oficiais da Polícia Civil, SSP-GO ou PM sobre ocorrências; registro não é condenação.\nAtenção: as notas não cobrem todas as ocorrências; a contagem não é taxa de criminalidade.`;
      if (ind && !municipio) txt += " Para o total oficial do Estado, pergunte pela estatística da SSP-GO (ex.: \"total oficial de feminicídios em 2025\").";
    }
    return fim(txt, fontesDoResultado(r));
  }

  return fim(`${NAO_ENCONTRADO}\n\nPosso ajudar com: registros do mapa por categoria, município e período; estatísticas oficiais da SSP-GO; legenda; fontes; metodologia; privacidade e canais de ajuda.`);
}

function dedup(fontes) {
  const vistos = new Set();
  return fontes.filter((f) => (vistos.has(f.url) ? false : vistos.add(f.url)));
}

export const _internos = { detectarCategorias, detectarMunicipio, periodoMapa };
