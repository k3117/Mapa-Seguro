#!/usr/bin/env python3
"""
MAPA SEGURO — rotina de ingestão de dados oficiais.

Fluxo: fonte pública -> coleta -> normalização -> validação -> publicação.

O que faz:
  1. Lê data/fontes.json (registro de fontes oficiais).
  2. (Opcional) Procura novos PDFs anuais na página oficial da SSP-GO.
  3. Baixa cada PDF, extrai as linhas FEMINICÍDIO e ESTUPRO.
  4. Confere: 12 valores mensais + soma == total publicado no PDF.
  5. Só grava em data/indicadores.json o que passou na conferência.
     Se algo falhar, mantém o valor anterior e registra em data/ingestao_log.json.
  6. Baixa o contorno de Goiás da API do IBGE (data/goias.geojson).

Uso:
  python scripts/atualizar_dados.py               # tudo
  python scripts/atualizar_dados.py --sem-descoberta
  python scripts/atualizar_dados.py --pdf-local arquivo.pdf --ano 2025   # testar parser
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import io
import json
import re
import sys
import unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DADOS = RAIZ / "data"
USER_AGENT = "MapaSeguro/1.0 (+https://github.com; ingestao de dados publicos oficiais)"

# Linhas a extrair: id interno -> padrão do rótulo oficial (sem acento, maiúsculo)
INDICADORES = {
    "feminicidio": r"^FEMINICIDIO$",
    "estupro": r"^ESTUPRO$",
}

PAGINA_SSP = "https://goias.gov.br/seguranca/estatisticas/"
URL_IBGE_GO = ("https://servicodados.ibge.gov.br/api/v3/malhas/estados/52"
               "?formato=application/vnd.geo+json&qualidade=minima")


# ----------------------------------------------------------------- utilidades
def sem_acento(txt: str) -> str:
    txt = unicodedata.normalize("NFKD", txt or "")
    return "".join(c for c in txt if not unicodedata.combining(c)).upper().strip()


def numero(tok: str) -> int | None:
    tok = (tok or "").strip().replace(".", "").replace(" ", "")
    return int(tok) if re.fullmatch(r"\d+", tok) else None


def hoje() -> str:
    return dt.date.today().isoformat()


def baixar(url: str) -> bytes:
    import requests
    r = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=60)
    r.raise_for_status()
    return r.content


# ----------------------------------------------------------------- parser PDF
def _validar(valores: list[int | None]) -> tuple[list[int], int] | None:
    if len(valores) != 13 or any(v is None for v in valores):
        return None
    mensal, total = valores[:12], valores[12]
    return (mensal, total) if sum(mensal) == total else None


def extrair_linhas(pdf_bytes: bytes) -> dict:
    """Retorna {indicador: {"mensal": [...12], "total_publicado": n}} só com linhas válidas,
    o ano detectado e a data de consulta informada no rodapé (quando houver)."""
    import pdfplumber

    achados: dict[str, dict] = {}
    texto_total = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for pagina in pdf.pages:
            texto_total.append(pagina.extract_text() or "")
            # 1ª tentativa: tabelas estruturadas
            for tabela in pagina.extract_tables() or []:
                for linha in tabela:
                    if not linha:
                        continue
                    rotulo = sem_acento(linha[0] or "")
                    for ind, padrao in INDICADORES.items():
                        if ind in achados or not re.match(padrao, rotulo):
                            continue
                        ok = _validar([numero(c) for c in linha[1:14]])
                        if ok:
                            achados[ind] = {"mensal": ok[0], "total_publicado": ok[1], "via": "tabela"}

    texto = "\n".join(texto_total)
    # 2ª tentativa: texto linha a linha (exatamente 13 números após o rótulo)
    for bruta in texto.splitlines():
        linha = sem_acento(bruta)
        m = re.match(r"^([A-Z ]+?)\s+((?:\d{1,3}(?:\.\d{3})*\s+){12}\d{1,3}(?:\.\d{3})*)$", linha)
        if not m:
            continue
        rotulo = m.group(1).strip()
        for ind, padrao in INDICADORES.items():
            if ind in achados or not re.match(padrao, rotulo):
                continue
            ok = _validar([numero(t) for t in m.group(2).split()])
            if ok:
                achados[ind] = {"mensal": ok[0], "total_publicado": ok[1], "via": "texto"}

    ano = None
    m = re.search(r"ANO\s+(20\d{2})", sem_acento(texto))
    if m:
        ano = int(m.group(1))
    consulta = None
    m = re.search(r"DATA DE CONSULTA\s*-?\s*(?:DATA)?\s*(\d{2})/(\d{2})/(\d{4})", sem_acento(texto))
    if m:
        consulta = f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    return {"ano": ano, "data_consulta_fonte": consulta, "linhas": achados}


# ----------------------------------------------------------------- descoberta
def descobrir_pdfs(fonte: dict, log: list) -> None:
    """Procura na página oficial links de PDFs anuais ainda não registrados."""
    try:
        html = baixar(fonte["pagina_oficial"]).decode("utf-8", "replace")
    except Exception as e:  # noqa: BLE001
        log.append({"nivel": "aviso", "msg": f"descoberta falhou: {e}"})
        return
    conhecidas = {a["url"] for a in fonte["arquivos"]}
    for url in set(re.findall(r'href="(https://goias\.gov\.br/seguranca/wp-content/uploads/[^"]+\.pdf)"', html)):
        nome = sem_acento(url.rsplit("/", 1)[-1])
        anos = re.findall(r"20\d{2}", nome)
        # só demonstrativos anuais de um único ano (ignora consolidados de vários anos)
        if "ESTATISTICA" not in nome or len(set(anos)) != 1 or url in conhecidas:
            continue
        ano = int(anos[0])
        fonte["arquivos"] = [a for a in fonte["arquivos"] if a["ano"] != ano]
        fonte["arquivos"].append({"ano": ano, "url": url})
        log.append({"nivel": "info", "msg": f"novo PDF oficial registrado para {ano}: {url}"})
    fonte["arquivos"].sort(key=lambda a: -a["ano"])


# ----------------------------------------------------------------- principal
def processar_ssp(fontes: dict, indicadores: dict, log: list, descobrir: bool) -> None:
    fonte = next(f for f in fontes["fontes"] if f["id"] == "ssp-go-estatisticas-criminais")
    if descobrir:
        descobrir_pdfs(fonte, log)

    for arq in fonte["arquivos"]:
        ano, url = arq["ano"], arq["url"]
        chave = str(ano)
        try:
            pdf = baixar(url)
        except Exception as e:  # noqa: BLE001
            log.append({"nivel": "erro", "ano": ano, "msg": f"download falhou: {e}"})
            continue
        resultado = extrair_linhas(pdf)
        if resultado["ano"] and resultado["ano"] != ano:
            log.append({"nivel": "erro", "ano": ano, "msg": f"PDF declara ano {resultado['ano']}; ignorado"})
            continue
        faltando = [i for i in INDICADORES if i not in resultado["linhas"]]
        if faltando:
            log.append({"nivel": "erro", "ano": ano,
                        "msg": f"linhas não extraídas ou soma não confere: {faltando}; valores anteriores mantidos"})
            continue

        anterior = indicadores["anos"].get(chave, {})
        novos_valores = {i: {"mensal": v["mensal"], "total_publicado": v["total_publicado"]}
                         for i, v in resultado["linhas"].items()}
        if anterior.get("valores") and anterior["valores"] != novos_valores:
            log.append({"nivel": "auditoria", "ano": ano, "msg": "valores alterados pela fonte oficial",
                        "valor_anterior": anterior["valores"], "valor_novo": novos_valores})
        indicadores["anos"][chave] = {
            "pdf_url": url,
            "pdf_sha256": hashlib.sha256(pdf).hexdigest(),
            "data_consulta_fonte": resultado["data_consulta_fonte"] or anterior.get("data_consulta_fonte"),
            "data_coleta": hoje(),
            "metodo_extracao": "pdfplumber",
            "conferencia_automatica": "ok",
            "valores": novos_valores,
        }
        log.append({"nivel": "info", "ano": ano, "msg": "conferido e atualizado",
                    "via": {i: v["via"] for i, v in resultado["linhas"].items()}})


def baixar_malha_ibge(log: list) -> None:
    try:
        geo = json.loads(baixar(URL_IBGE_GO))
        assert geo.get("type") in ("FeatureCollection", "Feature")
        (DADOS / "goias.geojson").write_text(json.dumps(geo, separators=(",", ":")), encoding="utf-8")
        log.append({"nivel": "info", "msg": "malha IBGE de Goiás atualizada"})
    except Exception as e:  # noqa: BLE001
        log.append({"nivel": "aviso", "msg": f"malha IBGE não atualizada: {e}"})


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sem-descoberta", action="store_true")
    ap.add_argument("--pdf-local")
    ap.add_argument("--ano", type=int)
    args = ap.parse_args()

    if args.pdf_local:  # modo teste do parser
        res = extrair_linhas(Path(args.pdf_local).read_bytes())
        print(json.dumps(res, ensure_ascii=False, indent=1))
        return 0 if len(res["linhas"]) == len(INDICADORES) else 1

    fontes = json.loads((DADOS / "fontes.json").read_text(encoding="utf-8"))
    indicadores = json.loads((DADOS / "indicadores.json").read_text(encoding="utf-8"))
    log: list = []

    processar_ssp(fontes, indicadores, log, descobrir=not args.sem_descoberta)
    baixar_malha_ibge(log)

    indicadores["gerado_em"] = hoje()
    (DADOS / "fontes.json").write_text(json.dumps(fontes, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (DADOS / "indicadores.json").write_text(json.dumps(indicadores, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    (DADOS / "ingestao_log.json").write_text(
        json.dumps({"executado_em": dt.datetime.now(dt.timezone.utc).isoformat(), "eventos": log},
                   ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    for ev in log:
        print(f"[{ev['nivel']}] {ev.get('ano', '')} {ev['msg']}")
    erros = [e for e in log if e["nivel"] == "erro"]
    ssp = next(f for f in fontes["fontes"] if f["id"] == "ssp-go-estatisticas-criminais")
    return 1 if erros and len(erros) == len(ssp["arquivos"]) else 0


if __name__ == "__main__":
    sys.exit(main())
