#!/usr/bin/env python3
"""
Validação executada em todo push/PR antes de publicar (equivale à "revisão por regras").
Falha se algum dado violar as regras do MAPA SEGURO.
"""
import json
import re
import sys
from pathlib import Path

D = Path(__file__).resolve().parent.parent / "data"
erros: list[str] = []


def carregar(nome):
    return json.loads((D / nome).read_text(encoding="utf-8"))


fontes = carregar("fontes.json")
ind = carregar("indicadores.json")
cat = carregar("categorias.json")
serv = carregar("servicos.json")

# 1. Toda fonte precisa ser oficial e ter URL gov.br / IBGE
for f in fontes["fontes"]:
    if f.get("tipo_fonte") != "oficial":
        erros.append(f"fonte não oficial: {f['id']}")
    url = f.get("pagina_oficial", "")
    if not re.match(r"https://([a-z0-9.-]+\.)?(go\.gov\.br|goias\.gov\.br|ibge\.gov\.br)/", url):
        erros.append(f"fonte fora de domínio oficial: {f['id']} {url}")

# 2. Indicadores: 12 meses, soma confere, URL do PDF oficial
for ano, a in ind["anos"].items():
    if not a["pdf_url"].startswith("https://goias.gov.br/seguranca/"):
        erros.append(f"{ano}: PDF fora do site oficial da SSP-GO")
    for k, v in a["valores"].items():
        if k not in ind["indicadores"]:
            erros.append(f"{ano}: indicador desconhecido {k}")
        if len(v["mensal"]) != 12 or sum(v["mensal"]) != v["total_publicado"]:
            erros.append(f"{ano}/{k}: soma mensal não confere com total publicado")
        if any((not isinstance(x, int)) or x < 0 for x in v["mensal"]):
            erros.append(f"{ano}/{k}: valor inválido")

# 3. Categorias só podem apontar para indicadores existentes
ids_ind = set(ind["indicadores"])
ids_cat = {c["id"] for c in cat["categorias"]}
for c in cat["categorias"]:
    if c.get("indicador_ssp") is not None and c["indicador_ssp"] not in ids_ind:
        erros.append(f"categoria {c['id']} aponta para indicador inexistente")

# 3b. Registros do mapa (ocorrências): regras de privacidade e origem
oc = carregar("ocorrencias.json")
CAMPOS_OK = {"id", "categoria", "categorias_secundarias", "publico", "municipio", "codigo_ibge", "bairro", "precisao_local",
             "lat", "lon", "data_publicacao", "data_fato", "status_juridico", "medidas", "fonte_status", "fontes", "extracao",
             "coletado_em", "modificado_fonte", "possivel_duplicidade", "mesclado_de", "correcao"}
for r in oc["ocorrencias"]:
    extra = set(r) - CAMPOS_OK
    if extra:
        erros.append(f"{r['id']}: campos não permitidos {sorted(extra)}")
    if r["categoria"] not in ids_cat:
        erros.append(f"{r['id']}: categoria inválida")
    if r["status_juridico"] not in cat["status_juridico"]:
        erros.append(f"{r['id']}: status jurídico inválido")
    if r["publico"] == "criancas_adolescentes" and (r.get("bairro") or r["precisao_local"] != "municipio"):
        erros.append(f"{r['id']}: caso com criança/adolescente com localização abaixo do município")
    if not (-19.6 <= r["lat"] <= -12.3 and -53.3 <= r["lon"] <= -45.9):
        erros.append(f"{r['id']}: coordenada fora de Goiás")
    for f in r["fontes"]:
        if not re.match(r"https://goias\.gov\.br/(policiacivil|seguranca|policiamilitar)/", f["url"]):
            erros.append(f"{r['id']}: fonte fora dos portais oficiais")
    if r.get("bairro") and re.search(r"\b(rua|avenida|quadra|lote|n[º°]|apto|condom)", r["bairro"], re.I):
        erros.append(f"{r['id']}: bairro parece endereço")

# 4. Serviços: só unidades públicas com fonte oficial; nenhum campo de pessoa
PROIBIDOS = {"cpf", "nome_vitima", "nome_investigado", "residencia", "tornozeleira"}
for s in serv["servicos"]:
    if PROIBIDOS & set(s):
        erros.append(f"serviço {s['id']} contém campo proibido")
    if s["tipo"] not in {"delegacia_mulher", "delegacia_crianca", "centro_atendimento", "conselho_tutelar"}:
        erros.append(f"serviço {s['id']} com tipo não permitido")

if erros:
    print("VALIDAÇÃO FALHOU:")
    for e in erros:
        print(" -", e)
    sys.exit(1)
print(f"Validação OK: {len(ind['anos'])} anos SSP, {len(cat['categorias'])} categorias, {len(oc['ocorrencias'])} registros, {len(serv['servicos'])} serviços.")
