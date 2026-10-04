<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
<xsl:output method="html" encoding="UTF-8" indent="yes"/>
<xsl:template match="/rss/channel">
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Alertas (RSS) — MAPA SEGURO</title>
  <style>
    body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#f5f3ef;color:#1f1b24;line-height:1.5}
    header{background:#fff;border-bottom:1px solid #e3ded6;padding:14px 16px}
    header a{color:#4b2a7b;font-weight:800;text-decoration:none;letter-spacing:.04em}
    .faixa{background:#b3261e;color:#fff;text-align:center;padding:6px 16px;font-size:14px}
    .faixa a{color:#fff;font-weight:700}
    main{max-width:760px;margin:0 auto;padding:20px 16px 48px}
    h1{font-size:24px;margin:0 0 8px}
    .caixa{background:#fff;border:1px solid #e3ded6;border-radius:12px;padding:14px 16px;margin:14px 0}
    .caixa code{background:#f1edf7;padding:2px 6px;border-radius:6px;word-break:break-all}
    ul{list-style:none;padding:0;margin:0}
    li{background:#fff;border:1px solid #e3ded6;border-radius:12px;padding:12px 16px;margin:10px 0}
    li a{color:#4b2a7b;font-weight:700}
    .peq{font-size:13px;color:#5d5666}
  </style>
</head>
<body>
  <header><a href="index.html">MAPA SEGURO</a> &#160;<span class="peq">· Goiânia/GO · dados oficiais</span></header>
  <div class="faixa">Em perigo agora? Ligue <a href="tel:190">190</a> · Central de Atendimento à Mulher <a href="tel:180">180</a></div>
  <main>
    <h1>Alertas de novos registros</h1>
    <p>Esta é a página do <strong>feed RSS</strong> do MAPA SEGURO: a lista dos 60 registros mais recentes divulgados em notas oficiais. Ela é atualizada todo dia.</p>
    <div class="caixa">
      <strong>Como receber os alertas</strong>
      <p class="peq">Copie o endereço desta página e cole num aplicativo leitor de RSS (por exemplo, Feedly ou Inoreader) ou num serviço que envia RSS por e-mail. Sempre que houver registro novo, ele aparece lá.</p>
      <p class="peq">Prefere ver com filtros por cidade e tipo de crime? <a href="alertas.html">Abra a página de alertas</a> · <a href="index.html">Voltar ao mapa</a></p>
    </div>
    <ul>
      <xsl:for-each select="item">
        <li>
          <a href="{link}"><xsl:value-of select="title"/></a>
          <div class="peq"><xsl:value-of select="description"/></div>
        </li>
      </xsl:for-each>
    </ul>
    <p class="peq">Nomes, idades e endereços não são publicados. Investigação ou prisão não significa condenação.</p>
  </main>
</body>
</html>
</xsl:template>
</xsl:stylesheet>
