/** Ícones próprios do MAPA SEGURO (SVG, desenho original). */

const G = {
  mulher: '<circle cx="12" cy="9" r="4.6" fill="none" stroke="C" stroke-width="2.2"/><path d="M12 13.6V21M8.6 17.6h6.8" stroke="C" stroke-width="2.2" stroke-linecap="round"/>',
  mulher_alerta: '<circle cx="10.5" cy="9" r="4.2" fill="none" stroke="C" stroke-width="2.1"/><path d="M10.5 13.2V20M7.4 16.8h6.2" stroke="C" stroke-width="2.1" stroke-linecap="round"/><path d="M19 5v7" stroke="C" stroke-width="2.2" stroke-linecap="round"/><circle cx="19" cy="15.6" r="1.3" fill="C"/>',
  mao: '<path d="M8 12V6.5a1.4 1.4 0 0 1 2.8 0V11m0-5.8V4.6a1.4 1.4 0 0 1 2.8 0V11m0-5.3a1.4 1.4 0 0 1 2.8 0V12m0-3.3a1.4 1.4 0 0 1 2.8 0V15c0 3.6-2.7 6-6 6h-1c-2.2 0-3.6-1-4.8-2.8L5 14.6a1.5 1.5 0 0 1 2.5-1.6L8 13.7" fill="none" stroke="C" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  casa: '<path d="M4 11.5 12 5l8 6.5" fill="none" stroke="C" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.5 10.5V19h11v-8.5" fill="none" stroke="C" stroke-width="2.2" stroke-linejoin="round"/><path d="M10.5 19v-4.5h3V19" fill="C"/>',
  impacto: '<path d="m12 3 1.9 5.2 5.4-1.6-3.2 4.6 4.4 3.3-5.5.4.6 5.6-3.6-4.2-3.6 4.2.6-5.6-5.5-.4 4.4-3.3-3.2-4.6 5.4 1.6Z" fill="C"/>',
  balao: '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4h0A2.5 2.5 0 0 1 4 13.5Z" fill="none" stroke="C" stroke-width="2"/><path d="M12 7v4.2" stroke="C" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="13.6" r="1.2" fill="C"/>',
  olho: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" fill="none" stroke="C" stroke-width="2"/><circle cx="12" cy="12" r="3.2" fill="C"/>',
  crianca: '<circle cx="12" cy="6" r="2.8" fill="C"/><path d="M12 9.5c-2.6 0-4.4 1.6-4.4 4V15h2v6h4.8v-6h2v-1.5c0-2.4-1.8-4-4.4-4Z" fill="C"/>',
  escudo: '<path d="M12 3 5 6v5.5c0 4.6 3 8.3 7 9.5 4-1.2 7-4.9 7-9.5V6l-7-3Z" fill="none" stroke="C" stroke-width="2.1" stroke-linejoin="round"/><path d="m8.2 8.2 7.6 7.6" stroke="C" stroke-width="2.1" stroke-linecap="round"/>',
  atendimento: '<path d="M12 3 5 6v5.5c0 4.6 3 8.3 7 9.5 4-1.2 7-4.9 7-9.5V6l-7-3Z" fill="C"/><path d="M12 8v6M9 11h6" stroke="#4b2a7b" stroke-width="2" stroke-linecap="round"/>',
};

export function glifo(nome, cor = "#fff", tam = 18) {
  const g = (G[nome] || G.impacto).replaceAll('"C"', `"${cor}"`);
  return `<svg width="${tam}" height="${tam}" viewBox="0 0 24 24" aria-hidden="true">${g}</svg>`;
}

/** Marcador em forma de gota (estilo pino), com glifo da categoria. */
export function pinoHTML(cat, tam = 34) {
  const borda = cat.cor.toLowerCase() === "#ffffff" ? "#1b1b1b" : "rgba(0,0,0,.35)";
  return `<div class="pino" style="--c:${cat.cor};--b:${borda};width:${tam}px;height:${tam}px">${glifo(cat.icone, cat.cor_icone, Math.round(tam * 0.55))}</div>`;
}

/** Bolinha com glifo para listas e legenda. */
export function selo(cat, tam = 22) {
  const borda = cat.cor.toLowerCase() === "#ffffff" ? "#1b1b1b" : "transparent";
  return `<span class="selo-cat" style="background:${cat.cor};border-color:${borda};width:${tam}px;height:${tam}px">${glifo(cat.icone, cat.cor_icone, Math.round(tam * 0.7))}</span>`;
}
