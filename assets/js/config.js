/**
 * Configuração do MAPA SEGURO (único arquivo que você precisa editar para publicar).
 * NUNCA coloque chaves de API aqui: este arquivo é público no GitHub Pages.
 */
export const CONFIG = {
  nome: "Mapa Seguro",
  cidadeFoco: { nome: "Goiânia", uf: "GO", lat: -16.6869, lon: -49.2648 },

  // Repositório GitHub (usuario/repositorio) — usado nos botões
  // "Encontrou um erro?" e "Resposta incorreta", que abrem uma Issue pré-preenchida.
  repositorio: "k3117/Mapa-Seguro",

  mapa: {
    // Camada base do OpenStreetMap (gratuita; respeite a política de uso de tiles)
    tiles: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    atribuicao: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    // Contorno de Goiás: arquivo local gerado pela rotina; se não existir, busca na API do IBGE
    malhaLocal: "data/goias.geojson",
    malhaIbge: "https://servicodados.ibge.gov.br/api/v3/malhas/estados/52?formato=application/vnd.geo%2Bjson&qualidade=minima",
  },

  ia: {
    /**
     * modo:
     *  "local" — sem LLM. Respostas montadas diretamente dos dados (sempre funciona, custo zero).
     *  "proxy" — LLM via seu Cloudflare Worker gratuito (pasta /worker), que guarda a chave em segredo.
     *            RECOMENDADO para produção.
     *  "byok"  — cada visitante cola a própria chave (fica só na aba, em sessionStorage). Útil para testes.
     * Em qualquer modo, se o LLM falhar, o Assistente cai automaticamente para o modo local.
     */
    modo: "local",
    proxyUrl: "", // ex.: "https://mapa-seguro-ia.SEU-SUBDOMINIO.workers.dev"
    permitirByok: true, // mostra a opção "usar minha chave Gemini" nas configurações do chat

    // Usados no modo "byok" (no modo "proxy" o Worker decide provedor e modelo)
    provedor: "gemini",            // "gemini" | "openai_compat"
    modelo: "gemini-2.5-flash",    // confira os modelos do nível gratuito em ai.google.dev
    baseUrlOpenAICompat: "",       // ex.: endpoint compatível com OpenAI, se provedor = "openai_compat"

    limites: { intervaloMinMs: 2500, maxPerguntasPorSessao: 40, maxCaracteres: 600 },
  },
};
