/** Gráficos SVG acessíveis (série única, sem eixo duplo), com dica ao passar o mouse/foco. */
import { esc } from "./dados.js";

let dica;
function mostrarDica(txt, x, y) {
  if (!dica) { dica = document.createElement("div"); dica.className = "dica"; dica.setAttribute("role", "status"); document.body.append(dica); }
  dica.textContent = txt;
  dica.style.display = "block";
  const w = dica.offsetWidth;
  dica.style.left = `${Math.min(window.innerWidth - w - 8, Math.max(8, x - w / 2))}px`;
  dica.style.top = `${y - 40}px`;
}
const esconderDica = () => { if (dica) dica.style.display = "none"; };

function escalaY(max) {
  const passos = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  const alvo = max / 4;
  const passo = passos.find((p) => p >= alvo) || Math.ceil(alvo);
  const topo = Math.max(passo, Math.ceil(max / passo) * passo);
  const ticks = [];
  for (let v = 0; v <= topo; v += passo) ticks.push(v);
  return { topo, ticks };
}

/**
 * Barras verticais. dados: [{rotulo, valor, dica}]
 */
export function graficoBarras(container, dados, opcoes = {}) {
  const { titulo, descricao, rotuloValor = "registros" } = opcoes;
  const W = Math.max(300, (container.clientWidth || 792) - 32), H = opcoes.altura || 260, m = { t: 12, r: 8, b: 34, l: 40 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const max = Math.max(1, ...dados.map((d) => d.valor));
  const { topo, ticks } = escalaY(max);
  const bw = iw / dados.length;
  const larg = Math.max(2, Math.min(28, bw - 2));
  const y = (v) => m.t + ih - (v / topo) * ih;
  const passoRot = Math.max(1, Math.ceil(dados.length / Math.max(2, Math.floor(iw / 62))));

  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(titulo)}">`;
  for (const t of ticks) {
    s += `<line class="grade-l" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/>`;
    s += `<text class="eixo" x="${m.l - 6}" y="${y(t) + 4}" text-anchor="end">${t.toLocaleString("pt-BR")}</text>`;
  }
  dados.forEach((d, i) => {
    const x = m.l + i * bw + (bw - larg) / 2;
    const h = Math.max(0, m.t + ih - y(d.valor));
    const r = Math.min(4, larg / 2, h);
    // barra com topo arredondado, base reta
    const path = h > 0
      ? `M${x},${m.t + ih} V${y(d.valor) + r} q0,-${r} ${r},-${r} H${x + larg - r} q${r},0 ${r},${r} V${m.t + ih} Z`
      : "";
    s += `<g class="alvo" tabindex="0" data-i="${i}" aria-label="${esc(d.rotulo)}: ${d.valor} ${esc(rotuloValor)}">
      <rect x="${m.l + i * bw}" y="${m.t}" width="${bw}" height="${ih}" fill="transparent"/>
      ${path ? `<path class="barra" d="${path}"/>` : ""}</g>`;
    if (i % passoRot === 0) s += `<text class="eixo" x="${m.l + i * bw + bw / 2}" y="${H - m.b + 16}" text-anchor="middle">${esc(d.rotulo)}</text>`;
  });
  s += `<line class="base-l" x1="${m.l}" x2="${W - m.r}" y1="${m.t + ih}" y2="${m.t + ih}"/></svg>`;

  const tabela = `<details><summary>Ver tabela</summary><div class="tabela-wrap"><table class="tabela"><thead><tr><th>Período</th><th>${esc(rotuloValor)}</th></tr></thead><tbody>${dados.map((d) => `<tr><td>${esc(d.rotulo)}</td><td>${d.valor.toLocaleString("pt-BR")}</td></tr>`).join("")}</tbody></table></div></details>`;
  container.innerHTML = `<h3>${esc(titulo)}</h3>${descricao ? `<p class="rotulo-peq">${esc(descricao)}</p>` : ""}${s}${tabela}`;

  container.querySelectorAll(".alvo").forEach((g) => {
    const d = dados[Number(g.dataset.i)];
    const txt = d.dica || `${d.rotulo}: ${d.valor.toLocaleString("pt-BR")} ${rotuloValor}`;
    const on = (ev) => {
      g.querySelector(".barra")?.classList.add("ativa");
      const b = g.getBoundingClientRect();
      mostrarDica(txt, ev.clientX ?? b.left + b.width / 2, ev.clientY ?? b.top);
    };
    const off = () => { g.querySelector(".barra")?.classList.remove("ativa"); esconderDica(); };
    g.addEventListener("mousemove", on);
    g.addEventListener("mouseleave", off);
    g.addEventListener("focus", () => { const b = g.getBoundingClientRect(); on({ clientX: b.left + b.width / 2, clientY: b.top + 20 }); });
    g.addEventListener("blur", off);
  });
}
