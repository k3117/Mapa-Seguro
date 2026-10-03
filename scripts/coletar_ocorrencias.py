#!/usr/bin/env python3
"""
MAPA SEGURO — coleta de ocorrências em fontes OFICIAIS do Governo de Goiás.

Fonte pública -> coleta -> normalização -> classificação -> deduplicação -> regras de privacidade
-> geocodificação generalizada -> publicação (data/ocorrencias.json + feed.xml)

Fontes: notas oficiais publicadas nos portais (WordPress, API REST pública) da
Polícia Civil (PCGO), Secretaria de Segurança Pública (SSP-GO) e Polícia Militar (PMGO).

Uso:
  python scripts/coletar_ocorrencias.py                 # coleta incremental (padrão: últimos 730 dias)
  python scripts/coletar_ocorrencias.py --dias 90
  SITE_URL=https://usuario.github.io/mapa-seguro/ python scripts/coletar_ocorrencias.py
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import os
import sys
import time
from pathlib import Path
from xml.sax.saxutils import escape

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from classificador import (CLASSIFICADOR_VERSAO, ROTULOS, Localizador, bairro, classificar,  # noqa: E402
                           data_do_fato, html_para_texto, resumo_oficial, situacao)

RAIZ = Path(__file__).resolve().parent.parent
D = RAIZ / "data"
UA = "MapaSeguro/1.0 (plataforma de informacao publica; coleta de notas oficiais)"

SITES = [
    {"sigla": "PCGO", "orgao": "Polícia Civil do Estado de Goiás", "base": "https://goias.gov.br/policiacivil"},
    {"sigla": "SSP-GO", "orgao": "Secretaria de Estado da Segurança Pública de Goiás", "base": "https://goias.gov.br/seguranca"},
    {"sigla": "PMGO", "orgao": "Polícia Militar do Estado de Goiás", "base": "https://goias.gov.br/policiamilitar"},
]
# Somente crimes graves (decisão editorial): ameaça, lesão corporal, perseguição,
# violência doméstica genérica e descumprimento de medida protetiva não entram no mapa.
GRAVES = {"feminicidio", "tentativa_feminicidio", "violencia_sexual", "violencia_sexual_crianca", "outros_crianca"}
DESDE = "2015-01-01"  # início do histórico

TERMOS = [
    "feminicídio", "tentativa de feminicídio", "matou companheira", "matou esposa", "matou a ex",
    "estupro", "estupro de vulnerável", "abuso sexual", "abuso sexual infantil", "exploração sexual",
    "pornografia infantil", "importunação sexual", "violência sexual", "criança", "adolescente",
    "maus-tratos", "tortura criança", "homicídio criança", "Deam", "DPCA",
]
POR_PAGINA = 100
MAX_PAGINAS = 30


def agora_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def ler(nome, padrao):
    p = D / nome
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else padrao


def gravar(nome, obj):
    (D / nome).write_text(json.dumps(obj, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


# ------------------------------------------------------------------ coleta
def buscar_posts(sess: requests.Session, site: dict, termo: str, apos: str, log: list) -> list[dict]:
    posts = []
    for pagina in range(1, MAX_PAGINAS + 1):
        url = f"{site['base']}/wp-json/wp/v2/posts"
        params = {"search": termo, "after": apos, "orderby": "date", "order": "desc", "per_page": POR_PAGINA,
                  "page": pagina, "_fields": "id,date,modified,link,title,content"}
        try:
            r = sess.get(url, params=params, timeout=60)
        except requests.RequestException as e:
            log.append({"nivel": "erro", "site": site["sigla"], "termo": termo, "msg": f"falha de rede: {e}"})
            break
        if r.status_code == 400 and pagina > 1:
            break  # fim da paginação
        if not r.ok:
            log.append({"nivel": "erro", "site": site["sigla"], "termo": termo, "msg": f"HTTP {r.status_code}"})
            break
        lote = r.json()
        posts.extend(lote)
        total_pag = int(r.headers.get("X-WP-TotalPages", "1") or 1)
        time.sleep(0.4)
        if pagina >= total_pag or not lote:
            break
    return posts


# ------------------------------------------------------------------ geocodificação (só bairros)
def distancia_km(a, b, c, d):
    r = 6371
    p1, p2 = math.radians(a), math.radians(c)
    dp, dl = math.radians(c - a), math.radians(d - b)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def geocodificar_bairro(sess, cache: dict, bairro_nome: str, mun: dict, log: list):
    chave = f"{bairro_nome}|{mun['codigo_ibge']}"
    if chave in cache:
        return cache[chave]
    res = None
    try:
        r = sess.get("https://nominatim.openstreetmap.org/search", timeout=30, params={
            "q": f"{bairro_nome}, {mun['nome']}, Goiás, Brasil", "format": "jsonv2", "limit": 1, "countrycodes": "br"})
        time.sleep(1.1)  # política de uso do Nominatim: no máximo 1 requisição por segundo
        if r.ok and r.json():
            j = r.json()[0]
            lat, lon = float(j["lat"]), float(j["lon"])
            tipo = j.get("addresstype") or j.get("type")
            # aceita só áreas (bairro/setor), nunca pontos de endereço/edificação
            if tipo in ("suburb", "neighbourhood", "quarter", "residential", "city_district", "hamlet", "village", "isolated_dwelling") \
                    and distancia_km(lat, lon, mun["lat"], mun["lon"]) <= 30:
                res = {"lat": round(lat, 4), "lon": round(lon, 4), "tipo": tipo}
    except requests.RequestException as e:
        log.append({"nivel": "aviso", "msg": f"geocodificação falhou para {chave}: {e}"})
        return None  # não grava no cache: tenta de novo na próxima execução
    cache[chave] = res
    return res


# ------------------------------------------------------------------ registro
def montar_registro(site, post, loc: Localizador, sess, geocache, log, extracao="conteudo"):
    titulo = html_para_texto(post.get("title", {}).get("rendered", "") if isinstance(post.get("title"), dict) else post.get("title", ""))
    texto = html_para_texto(post.get("content", {}).get("rendered", "")) if isinstance(post.get("content"), dict) else ""
    cls = classificar(titulo, texto)
    if not cls or cls["categoria"] not in GRAVES:
        return None
    mun = loc.municipio(titulo, texto)
    if not mun:
        log.append({"nivel": "info", "msg": f"sem município de Goiás identificado: {post.get('link')}"})
        return None
    data_pub = post["date"][:10]
    sit = situacao(titulo, texto)
    reg = {
        "id": f"{site['sigla'].lower().replace('-', '')}-{post['id']}",
        "categoria": cls["categoria"],
        "categorias_secundarias": cls["secundarias"],
        "publico": cls["publico"],
        "municipio": mun["nome"],
        "codigo_ibge": mun["codigo_ibge"],
        "bairro": None,
        "precisao_local": "municipio",
        "lat": mun["lat"], "lon": mun["lon"],
        "data_publicacao": data_pub,
        "data_fato": data_do_fato(texto, int(data_pub[:4])) if texto else None,
        "status_juridico": sit["status_juridico"],
        "medidas": sit["medidas"],
        "fonte_status": "oficial_confirmada",
        "fontes": [{"orgao": site["orgao"], "sigla": site["sigla"], "url": post["link"], "data_publicacao": data_pub, "tipo": "nota_oficial"}],
        "resumo_oficial": None,
        "classificador": CLASSIFICADOR_VERSAO,
        "extracao": extracao,
        "coletado_em": dt.date.today().isoformat(),
        "modificado_fonte": (post.get("modified") or "")[:19] or None,
    }
    # Privacidade: criança/adolescente (ou vulnerável) -> nunca abaixo do município
    if not cls["envolve_crianca"] and texto:
        b = bairro(texto, mun["nome"])
        if b:
            g = geocodificar_bairro(sess, geocache, b, mun, log)
            reg["bairro"] = b
            if g:
                reg.update({"lat": g["lat"], "lon": g["lon"], "precisao_local": "bairro"})
    # Resumo da própria nota oficial, sem nomes nem endereços; nunca em casos com criança/adolescente
    if not cls["envolve_crianca"] and texto:
        reg["resumo_oficial"] = resumo_oficial(texto, mun["nome"], reg["bairro"])
    return reg


def marcar_duplicidades(regs: list[dict]) -> None:
    """Mesma categoria + município com publicações próximas: funde se fontes diferentes (≤3 dias),
    sinaliza 'possível duplicidade' se mesma fonte (≤10 dias). O administrador decide."""
    regs.sort(key=lambda r: (r["data_publicacao"], r["id"]))
    for r in regs:
        r["possivel_duplicidade"] = []
    removidos = set()
    for i, a in enumerate(regs):
        if a["id"] in removidos:
            continue
        da = dt.date.fromisoformat(a["data_publicacao"])
        for b in regs[i + 1:]:
            if b["id"] in removidos:
                continue
            db = dt.date.fromisoformat(b["data_publicacao"])
            if (db - da).days > 10:
                break
            if a["categoria"] != b["categoria"] or a["codigo_ibge"] != b["codigo_ibge"]:
                continue
            if a["fontes"][0]["sigla"] != b["fontes"][0]["sigla"] and (db - da).days <= 3:
                a["fontes"].extend(b["fontes"]); removidos.add(b["id"])
                a["mesclado_de"] = sorted(set(a.get("mesclado_de", []) + [b["id"]]))
            else:
                a["possivel_duplicidade"].append(b["id"]); b["possivel_duplicidade"].append(a["id"])
    regs[:] = [r for r in regs if r["id"] not in removidos]


DOMINIOS_IMPRENSA = ("g1.globo.com", "opopular.com.br", "maisgoias.com.br", "jornalopcao.com.br", "dm.com.br",
                     "diariodegoias.com.br", "sagresonline.com.br", "tvanhanguera", "metropoles.com", "uol.com.br",
                     "folha.uol.com.br", "estadao.com.br", "cnnbrasil.com.br", "agenciabrasil.ebc.com.br", "r7.com", "band.uol.com.br")


def aplicar_reportagens(regs: list[dict]) -> None:
    """data/reportagens.json: links de reportagens verificados pela administração (curadoria)."""
    cur = ler("reportagens.json", {"casos": {}}).get("casos", {})
    for r in regs:
        links = []
        for x in cur.get(r["id"], {}).get("reportagens", []):
            url = str(x.get("url", ""))
            if url.startswith("https://") and any(d in url for d in DOMINIOS_IMPRENSA):
                links.append({"veiculo": str(x.get("veiculo", ""))[:60], "data": str(x.get("data", ""))[:10], "url": url})
        r["reportagens"] = links[:6]
        r["destaque"] = bool(cur.get(r["id"], {}).get("destaque"))


def aplicar_moderacao(regs: list[dict]) -> list[dict]:
    """data/moderacao.json: ocultar registros e aplicar correções aprovadas (com motivo = auditoria)."""
    mod = ler("moderacao.json", {"ocultar": [], "corrigir": []})
    ocultos = {o["id"] for o in mod.get("ocultar", [])}
    correc = {c["id"]: c for c in mod.get("corrigir", [])}
    PERMITIDOS = {"categoria", "publico", "municipio", "bairro", "status_juridico", "medidas", "data_fato", "precisao_local", "lat", "lon"}
    out = []
    for r in regs:
        if r["id"] in ocultos:
            continue
        if r["id"] in correc:
            c = correc[r["id"]]
            for k, v in c.get("campos", {}).items():
                if k in PERMITIDOS:
                    r[k] = v
            r["fonte_status"] = "corrigida"
            r["correcao"] = {"data": c.get("data"), "motivo": c.get("motivo")}
        if r["publico"] == "criancas_adolescentes" and r.get("bairro"):
            r["bairro"] = None  # regra inviolável
        out.append(r)
    return out


def gerar_feed(regs: list[dict], site_url: str) -> None:
    itens = []
    for r in sorted(regs, key=lambda x: x["data_publicacao"], reverse=True)[:60]:
        titulo = f"{ROTULOS[r['categoria']]} — {r['municipio']}/GO"
        link = f"{site_url.rstrip('/')}/caso.html?id={r['id']}"
        pub = dt.datetime.fromisoformat(r["data_publicacao"]).strftime("%a, %d %b %Y 12:00:00 -0300")
        desc = f"Registro divulgado por {r['fontes'][0]['sigla']} em {r['data_publicacao']}. Situação: {r['status_juridico'].replace('_', ' ')}. Registro não significa condenação."
        itens.append(f"<item><title>{escape(titulo)}</title><link>{escape(link)}</link><guid isPermaLink=\"false\">{escape(r['id'])}</guid><pubDate>{pub}</pubDate><description>{escape(desc)}</description></item>")
    xml = ('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel>'
           "<title>MAPA SEGURO — novos registros oficiais (Goiás)</title>"
           f"<link>{escape(site_url)}</link><description>Ocorrências de violência contra mulheres, crianças e adolescentes divulgadas em fontes oficiais do Governo de Goiás.</description>"
           "<language>pt-br</language>" + "".join(itens) + "</channel></rss>\n")
    (RAIZ / "feed.xml").write_text(xml, encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dias", type=int, default=None, help="padrão: histórico desde 2015")
    args = ap.parse_args()
    site_url = os.environ.get("SITE_URL", "https://k3117.github.io/Mapa-Seguro/")

    municipios = ler("municipios_go.json", {})["municipios"]
    loc = Localizador(municipios)
    # base bruta (um registro por nota oficial, sem fusões); ocorrencias.json é derivado dela a cada execução
    bruta = ler("coleta_bruta.json", {"registros": []})
    por_id = {r["id"]: r for r in bruta.get("registros", [])}
    geocache = ler("geocache.json", {})
    log: list = []
    sess = requests.Session()
    sess.headers["User-Agent"] = UA
    apos = (DESDE if args.dias is None else (dt.date.today() - dt.timedelta(days=args.dias)).isoformat()) + "T00:00:00"

    vistos = 0
    sucesso_rede = False
    for site in SITES:
        posts = {}
        for termo in TERMOS:
            for p in buscar_posts(sess, site, termo, apos, log):
                posts[p["id"]] = p
        if posts:
            sucesso_rede = True
        for p in posts.values():
            vistos += 1
            rid = f"{site['sigla'].lower().replace('-', '')}-{p['id']}"
            ant = por_id.get(rid)
            if (ant and ant.get("extracao") == "conteudo" and ant.get("classificador") == CLASSIFICADOR_VERSAO
                    and ant.get("modificado_fonte") == (p.get("modified") or "")[:19]):
                continue
            reg = montar_registro(site, p, loc, sess, geocache, log)
            if reg:
                por_id[rid] = reg
            elif ant:
                por_id.pop(rid)  # não é (mais) crime grave pelas regras atuais

    brutos = [r for r in por_id.values() if r["data_publicacao"] >= apos[:10] and r["categoria"] in GRAVES]
    gravar("coleta_bruta.json", {"gerado_em": agora_iso(), "registros": sorted(brutos, key=lambda r: r["id"])})
    regs = json.loads(json.dumps(brutos))  # cópia: fusões não alteram a base bruta
    marcar_duplicidades(regs)
    regs = aplicar_moderacao(regs)
    aplicar_reportagens(regs)
    gravar("ocorrencias.json", {
        "_comentario": "Gerado por scripts/coletar_ocorrencias.py a partir de notas oficiais. Nenhum texto, nome ou endereço é armazenado.",
        "gerado_em": agora_iso(),
        "desde": apos[:10],
        "fontes_consultadas": [{"sigla": s["sigla"], "orgao": s["orgao"], "api": f"{s['base']}/wp-json/wp/v2/posts"} for s in SITES],
        "total": len(regs),
        "ocorrencias": sorted(regs, key=lambda r: r["data_publicacao"], reverse=True),
    })
    gravar("geocache.json", geocache)
    gravar("coleta_log.json", {"executado_em": agora_iso(), "posts_analisados": vistos, "registros": len(regs), "eventos": log[-500:]})
    gerar_feed(regs, site_url)
    print(f"posts analisados: {vistos} · registros publicados: {len(regs)} · eventos: {len(log)}")
    return 0 if sucesso_rede or regs else 1


if __name__ == "__main__":
    sys.exit(main())
