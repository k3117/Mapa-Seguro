# MAPA SEGURO — Goiás

Mapa de ocorrências de violência contra **mulheres, crianças e adolescentes** em Goiás (foco em Goiânia), no estilo CrimeMapping/SpotCrime, **somente com fontes oficiais do Governo de Goiás** e com as regras de privacidade (LGPD) do projeto.

---

🌐 **Site:** https://k3117.github.io/Mapa-Seguro/

## Publicar / ativar o site

1. **Settings → Pages → Source: GitHub Actions**.
2. **Settings → Actions → General → Workflow permissions → Read and write permissions** (salvar).
3. **Actions → "Coletar dados oficiais e publicar" → Run workflow**.

Em ~5 minutos o site fica no ar. Depois, **todo dia às 06h10** o GitHub coleta as notas oficiais novas, aplica as regras e republica sozinho.

> ⚠️ Ao enviar arquivos pelo site do GitHub, arraste as **pastas** (não os arquivos soltos): o site depende da estrutura abaixo.

---

## O que o site mostra

| Tela | Conteúdo |
|---|---|
| **Mapa** (`index.html`) | Marcadores por categoria (ícone + cor), agrupamentos com números, legenda permanente, busca por município/bairro, contagem de registros e período. Trilho de filtros: **Resumo, O quê, Onde ("Pesquisar nesta área"), Quando (7/30/90 dias, 6/12/24 meses, ano, personalizado), Relatório (tabela + CSV), Gráficos, Imprimir**. "Receba alertas" = feed RSS. |
| **Caso** (`caso.html?id=…`) | Tipo, data do fato, local aproximado, situação jurídica, resumo neutro, fontes oficiais, possível duplicidade, "Encontrou um erro?", "Pergunte sobre este caso". |
| **Estatísticas** | Totais mensais oficiais da SSP-GO (feminicídio e estupro, 2018→) + contagem dos registros do mapa. |
| **Sobre / Metodologia / Precisa de ajuda?** | Finalidade, fontes, critérios, privacidade, limitações, IA; contatos 190/180/100/192 e DEAM/DPCA. |
| **Assistente** (💬) | Responde só com os dados do site; sabe o caso aberto; mostra as fontes usadas. |

### Legenda
🔴 Feminicídio · 🔴(claro) Tentativa de feminicídio · 🟣 Violência sexual · 🩷 Violência doméstica · 🟠 Lesão corporal/agressão · 🟡 Ameaça · 🔵 Perseguição · 🟤 Violência sexual contra criança/adolescente · 🟢 Outros crimes contra criança/adolescente · ⚪ Descumprimento de medida protetiva · escudo roxo = unidade de atendimento.

---

## De onde vêm os dados (somente oficiais)

| Base | Origem | Uso |
|---|---|---|
| Registros do mapa | Notas oficiais da **Polícia Civil (PCGO)**, **SSP-GO** e **Polícia Militar (PMGO)**, lidas pela API pública dos portais `goias.gov.br` | Um marcador por ocorrência divulgada |
| Estatística agregada | PDFs "Estatísticas Criminais e de Produtividade" da **SSP-GO** (RAI/Odisseu) | Página Estatísticas |
| Unidades de atendimento | Página de Delegacias Especializadas da PCGO | Escudos no mapa |
| Municípios | Códigos/nomes IBGE; coordenadas da sede (conjunto *municipios-brasileiros*, MIT) | Posição quando não há bairro |
| Bairros | OpenStreetMap (Nominatim), só para achar o **centro do bairro** citado na nota | Posição aproximada |

Nada vem de redes sociais, imprensa ou fontes não oficiais.

**Atenção:** as notas oficiais **não cobrem todas as ocorrências** — são os casos que os órgãos divulgaram. O site diz isso no Resumo, nos Gráficos e no Assistente, e aponta para a estatística oficial da SSP-GO quando se quer totais.

---

## Regras de privacidade aplicadas automaticamente

- **Nenhum texto da nota é guardado**: nem título, nem nomes, idades, profissões, ruas, números, quadras, lotes ou condomínios. Cada registro tem só: categoria, município, bairro (quando permitido), datas, situação jurídica e link oficial.
- **Criança/adolescente ou vítima vulnerável → sempre só o município** (nunca bairro). O validador recusa a publicação se isso for violado.
- Ponto do mapa = **centro do bairro** ou **sede do município**, nunca endereço. A busca aceita apenas município/bairro; endereço, pessoa, vítima e tornozeleira são bloqueados.
- Situação jurídica neutra: *investigado / indiciado / réu / condenado*. Ninguém é chamado de criminoso sem condenação.
- Sem ranking de pessoas, índice de periculosidade ou previsão de risco. O ranking existente é de **municípios** e vem com o aviso de que contagem de notas não é taxa de criminalidade.
- Se dados novos violarem qualquer regra (`scripts/validar_dados.py`), a publicação usa a versão anterior.

---

## Administração (sem painel próprio — tudo pelo GitHub)

- **Ocultar ou corrigir um registro**: edite `data/moderacao.json` no GitHub e salve (commit). Exemplo:
  ```json
  {
    "ocultar":  [ { "id": "pcgo-123456", "motivo": "nota sem relação com violência contra mulher", "data": "2026-10-03" } ],
    "corrigir": [ { "id": "pcgo-197914", "campos": { "status_juridico": "denuncia_recebida" }, "motivo": "denúncia recebida pelo TJGO (link)", "data": "2026-10-03" } ]
  }
  ```
  Campos corrigíveis: categoria, publico, municipio, bairro, status_juridico, medidas, data_fato, precisao_local, lat, lon. O registro passa a exibir "Corrigida após revisão".
- **Correções do público** chegam como *Issues* (modelo "Informar correção"). Rótulos: `pendente`, `em análise`, `corrigida`, `rejeitada`. Nada muda sozinho.
- **Auditoria**: o histórico de commits guarda quem alterou, o quê, valor anterior/novo, data e motivo. A coleta diária registra eventos em `data/coleta_log.json`.
- **Duplicidades**: o mesmo fato em órgãos diferentes é unificado; suspeitas na mesma fonte aparecem como "Possível duplicidade" no caso para você decidir (ocultando uma delas).

---

## Assistente de IA (opcional, gratuito)

Funciona **sem configurar nada** (modo local: respostas montadas direto dos dados). Para usar o **Google Gemini (nível gratuito)** sem expor a chave:

1. Gere uma chave no Google AI Studio.
2. Crie conta gratuita na Cloudflare e, na pasta `worker/`:
   ```bash
   npm i -g wrangler && wrangler login
      wrangler secret put AI_API_KEY
   wrangler deploy
   ```
3. Em `assets/js/config.js`: `modo: "proxy"` e `proxyUrl: "https://mapa-seguro-ia.SEU-SUBDOMINIO.workers.dev"`.

Proteções: o modelo só chama funções controladas (contar/buscar registros, obter caso, estatísticas SSP, fontes, legenda, ajuda) — nunca SQL nem dados brutos; moderação antes do modelo; todo número da resposta é conferido com os resultados das ferramentas (se não bater, a resposta é descartada); conteúdo das fontes é tratado como dado, não instrução. Trocar de provedor: `AI_PROVEDOR`/`AI_MODELO` no Worker (Gemini ou qualquer API compatível com OpenAI).

---

## Estrutura

```
index.html caso.html estatisticas.html sobre.html metodologia.html emergencia.html 404.html feed.xml
assets/css/       style.css, mapa.css
assets/js/        pagina-*.js, ocorrencias.js (consultas do mapa), consultas.js (SSP), icones.js, chat.js, config.js
assets/js/ai/     assistente.js (RAG + ferramentas), ferramentas.js, motor-local.js, moderacao.js, adaptadores.js, prompt-sistema.js
data/             ocorrencias.json, indicadores.json, categorias.json, municipios_go.json, servicos.json, fontes.json, plataforma.json, moderacao.json
scripts/          coletar_ocorrencias.py, classificador.py, atualizar_dados.py, geocodificar_servicos.py, validar_dados.py
worker/           proxy de IA (Cloudflare Workers)
.github/          workflow diário + modelos de Issue
tests/            testes (Python e Node) com dados fixos
```

Licenças de terceiros: Leaflet (BSD-2) e Leaflet.markercluster (MIT), em `vendor/`.

Testar no computador: `python3 -m http.server 8000` e abra `http://localhost:8000`.

### Expandir para outras cidades/estados
Adicione o portal oficial em `SITES` (`scripts/coletar_ocorrencias.py`), a lista de municípios do estado em `data/municipios_*.json` e o domínio permitido em `validar_dados.py`. A arquitetura não muda.

