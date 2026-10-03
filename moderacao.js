/**
 * Camada de moderação: executa ANTES de qualquer chamada ao modelo.
 * Bloqueia pedidos de dados pessoais/sensíveis, localização de pessoas,
 * identificação de vítimas, dados de crianças, perfilamento e previsão de risco.
 */

export const RESPOSTA_BLOQUEIO =
  "Não posso fornecer esse tipo de informação. Posso, porém, apresentar as informações públicas e não sensíveis disponíveis no MAPA SEGURO.";

const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const REGRAS = [
  { motivo: "localizacao_tornozeleira", re: /tornozeleir|monitoramento eletronico|rastre(ar|amento) (de |do |da )?(agressor|preso|investigado|pessoa)/ },
  { motivo: "localizacao_tempo_real", re: /(tempo real|agora mesmo|neste momento|onde (ele|ela|o agressor|a vitima|o suspeito|o investigado) (esta|anda|fica))/ },
  { motivo: "endereco_privado", re: /(onde (mora|reside|vive)|mora onde|endereco (residencial|de casa|da casa|dele|dela|do agressor|da vitima|do suspeito|do investigado|do acusado|do reu|de (um|uma|o|a) (pessoa|homem|mulher))|casa (do|da) (agressor|vitima|suspeito|investigado|acusado))/ },
  { motivo: "identificacao_vitima", re: /((nome|identidade|foto|telefone|cpf|rg|perfil|instagram|facebook|escola|trabalho|familia|parente)s? d[aoe]s? (vitima|crianca|menor|adolescente)|quem (e|foi|era) a vitima|identific(ar|ação|acao|a) (a|da|das|os|as)? ?vitima)/ },
  { motivo: "dados_pessoais", re: /\b(cpf|rg|placa do carro|numero de telefone|whatsapp) (d[eao]|desse|dessa|deste|desta)\b/ },
  { motivo: "perfilamento", re: /(ranking|lista|mapa|cadastro) (de|dos) (agressores|criminosos|estupradores|pessoas perigosas|suspeitos|investigados)|(ele|ela|essa pessoa|esse homem|meu vizinho|meu ex|fulano) (e|eh|sera|vai ser) (perigos[oa]|um risco)|risco (de|que) (ele|ela|essa pessoa|o vizinho|fulano)|vai (reincidir|voltar a agredir|matar)|reincidencia d[eo] |indice de periculosidade|pontuacao de risco/ },
  { motivo: "acusacao_pessoa", re: /(fulano|meu vizinho|meu ex|esse homem|essa pessoa|ele|ela) (e|eh) (criminoso|estuprador|agressor|assassino|feminicida)\??/ },
];

/** Retorna {bloqueado:boolean, motivo?, resposta?} */
export function moderar(texto) {
  const t = norm(texto || "");
  for (const r of REGRAS) {
    if (r.re.test(t)) return { bloqueado: true, motivo: r.motivo, resposta: RESPOSTA_BLOQUEIO };
  }
  return { bloqueado: false };
}

/** Detecta tentativa de injeção de instruções (registrada; a pergunta segue tratada como dado). */
export function pareceInjecao(texto) {
  const t = norm(texto || "");
  return /(ignore|esqueca|desconsidere|ignora) (todas |as |suas )*(instrucoes|regras)|voce agora e|system prompt|prompt do sistema|modo desenvolvedor|jailbreak/.test(t);
}
