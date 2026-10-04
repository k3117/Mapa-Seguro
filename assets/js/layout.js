/** Cabeçalho, faixa de emergência e rodapé comuns a todas as páginas. */
import { CONFIG } from "./config.js";

const PAGINAS = [
  ["index.html", "Mapa"],
  ["estatisticas.html", "Estatísticas"],
  ["sobre.html", "Sobre"],
  ["metodologia.html", "Metodologia"],
  ["emergencia.html", "Onde buscar ajuda", "ajuda"],
];

const LOGO = `<svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2 4 7v8c0 7.5 5.1 13.4 12 15 6.9-1.6 12-7.5 12-15V7L16 2Z" fill="var(--brand)"/><path d="M16 9a5 5 0 0 0-5 5c0 3.6 5 8.5 5 8.5s5-4.9 5-8.5a5 5 0 0 0-5-5Zm0 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" fill="var(--brand-ink)"/></svg>`;

export function montarLayout() {
  const atual = location.pathname.split("/").pop() || "index.html";
  const topo = document.getElementById("topo");
  if (topo) {
    topo.className = "topo";
    topo.innerHTML = `
      <a class="pular" href="#principal">Pular para o conteúdo</a>
      <div class="topo-in">
        <a class="marca" href="index.html">${LOGO}<span>${CONFIG.nome}<small>Projeto independente baseado em fontes públicas oficiais</small></span></a>
        <button class="menu-btn" aria-expanded="false" aria-controls="nav-principal">Menu</button>
        <nav id="nav-principal" class="nav" aria-label="Principal">
          ${PAGINAS.map(([href, txt, cls]) => `<a href="${href}" class="${cls || ""}" ${href === atual ? 'aria-current="page"' : ""}>${txt}</a>`).join("")}
        </nav>
      </div>
      <div class="faixa-emergencia" role="note">Em perigo agora? Ligue <a href="tel:190">190</a> · Central de Atendimento à Mulher <a href="tel:180">180</a> · Direitos Humanos <a href="tel:100">100</a></div>`;
    const btn = topo.querySelector(".menu-btn");
    const nav = topo.querySelector(".nav");
    btn.addEventListener("click", () => {
      const ab = nav.classList.toggle("aberta");
      btn.setAttribute("aria-expanded", String(ab));
    });
  }
  const rod = document.getElementById("rodape");
  if (rod) {
    rod.className = "rodape";
    rod.innerHTML = `<p>O Mapa Seguro é um projeto independente e não é um site oficial do Governo de Goiás. O mapa reúne registros divulgados por órgãos oficiais, e não todas as ocorrências policiais. A ausência de registro não significa ausência de crime, e um registro não significa condenação.</p>
      <p><a href="sobre.html">Sobre</a> · <a href="metodologia.html">Metodologia</a> · <a href="sobre.html#privacidade">Privacidade</a> · <a href="emergencia.html">Onde buscar ajuda</a></p>`;
  }
}

/** Link para abrir uma Issue pré-preenchida no repositório (correções / feedback). */
export function linkIssue(template, titulo, campos = {}) {
  if (!CONFIG.repositorio || CONFIG.repositorio.startsWith("SEU-USUARIO")) return null;
  const p = new URLSearchParams({ template, title: titulo, ...campos });
  return `https://github.com/${CONFIG.repositorio}/issues/new?${p}`;
}
