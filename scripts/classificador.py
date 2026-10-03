"""
MAPA SEGURO — classificação determinística (auditável) de notas oficiais.

Regras de privacidade aplicadas aqui (LGPD: necessidade, finalidade, proporcionalidade):
  * Nenhum texto livre da nota é guardado: nem título, nem trechos, nem nomes, idades ou endereços.
  * Guardamos apenas: categoria, município, bairro (só casos com vítima adulta), datas,
    situação jurídica e o link da fonte oficial.
  * Casos com criança/adolescente: localização SEMPRE generalizada para o município.
  * Rua, número, condomínio e qualquer endereço residencial nunca são extraídos.
"""
from __future__ import annotations

import difflib
import html
import re
import unicodedata

# --------------------------------------------------------------------------- texto
def sem_acento(t: str) -> str:
    t = unicodedata.normalize("NFKD", t or "")
    return "".join(c for c in t if not unicodedata.combining(c))


def norm(t: str) -> str:
    return re.sub(r"\s+", " ", sem_acento(t).lower()).strip()


def html_para_texto(h: str) -> str:
    h = re.sub(r"(?is)<(script|style).*?</\1>", " ", h or "")
    h = re.sub(r"(?i)<br\s*/?>|</p>|</li>|</h\d>", "\n", h)
    h = re.sub(r"<[^>]+>", " ", h)
    return re.sub(r"[ \t\r\f\v]+", " ", html.unescape(h)).strip()


# --------------------------------------------------------------------------- categorias
# Ordem = precedência (a mais grave vence). Cada regra: (id, padrões, exige_sinal)
#   exige_sinal: "mulher" | "crianca" | None
REGRAS = [
    ("feminicidio",              [r"(?<!tentativa de )feminicidio", r"\bmatou (a |sua )?(propria )?(companheira|esposa|mulher|ex-companheira|namorada|ex-namorada|ex-mulher)"], None),
    ("tentativa_feminicidio",    [r"tentativa de feminicidio", r"tentou matar (a |sua )?(propria )?(companheira|esposa|mulher|ex|namorada)", r"atirou contra (a |sua )?(propria )?(companheira|esposa|mulher|namorada|ex)"], None),
    ("violencia_sexual_crianca", [r"estupro de vulneravel", r"estupro de crianca", r"abuso sexual infantil", r"conteudo sexual infantil", r"material de abuso sexual", r"pornografia infantil", r"exploracao sexual", r"(estupr\w*|abus\w* sexual\w*|crimes? sexua\w*|cunho sexual|fotos intimas)"], "crianca"),
    ("outros_crianca",           [r"maus-?tratos", r"tortura", r"homicidio", r"\bmatou\b", r"\bmorte\b", r"espancamento"], "crianca"),
    ("violencia_sexual",         [r"estupr\w*", r"importunacao sexual", r"assedio sexual", r"violencia sexual", r"crimes? sexua\w*", r"imagens intimas", r"fotos intimas", r"registro nao autorizado da intimidade"], None),
    ("descumprimento_mp",        [r"descumpri\w* (de |as |a )?medidas? protetivas?", r"descumprimento de medidas? protetivas?"], None),
    ("perseguicao",              [r"perseguicao", r"perseguir", r"stalking"], "mulher"),
    ("lesao_corporal",           [r"lesao corporal", r"agress\w+", r"espanc\w+", r"agrediu", r"agredir"], "mulher"),
    ("ameaca",                   [r"ameac\w+"], "mulher"),
    ("violencia_domestica",      [r"violencia domestica", r"maria da penha", r"violencia contra a mulher", r"violencia psicologica", r"incendi\w+ .{0,25}(casa|residencia)"], "mulher"),
]

ROTULOS = {
    "feminicidio": "Feminicídio",
    "tentativa_feminicidio": "Tentativa de feminicídio",
    "violencia_sexual_crianca": "Violência sexual contra criança/adolescente",
    "outros_crianca": "Homicídio, tortura ou maus-tratos contra criança/adolescente",
    "violencia_sexual": "Violência sexual",
    "descumprimento_mp": "Descumprimento de medida protetiva",
    "perseguicao": "Perseguição (stalking)",
    "lesao_corporal": "Lesão corporal / agressão",
    "ameaca": "Ameaça",
    "violencia_domestica": "Violência doméstica",
}

SINAL_MULHER = r"\b(mulher|mulheres|companheira|ex-companheira|esposa|ex-esposa|namorada|ex-namorada|ex-mulher|vitima mulher|maria da penha|deam|violencia domestica|feminicidio|gestante|ofendida|a vitima|da vitima, (sua|uma))\b"
SINAL_CRIANCA = r"\b(crianca|criancas|adolescente|adolescentes|infantil|infanto|menor de idade|menores|menina|menino|bebe|recem-nascid\w+|enteada|enteado|filha|filho|filhas|filhos|sobrinha|neta|neto|estudante de \d+ anos)\b"
IDADE_CRIANCA = r"\b(\d{1,2}) anos\b"

VERBO_OCORRENCIA = r"\b(prend\w*|pres[oa]s?|prisao|prisoes|flagrante|captur\w+|cumpre\w*|cumpriu|mandado|busca e apreensao|indici\w+|investig\w+|deflagr\w+|autu\w+|apreend\w+|conduz\w+|denunci\w+|condenad\w+)\b"
INSTITUCIONAL = r"\b(palestra|curso|formatura|homenag\w+|solenidade|viaturas?|entrega|campanha|licitacao|cooperacao|evento|capacitacao|seminario|inaugur\w+|mobiliario|agosto lilas|outubro rosa|semana|workshop|treinamento|aula|projeto)\b"


def classificar(titulo: str, texto: str = "") -> dict | None:
    """Retorna {categoria, secundarias, publico} ou None se a nota não é uma ocorrência relevante."""
    t_tit = norm(titulo)
    t_all = norm(f"{titulo}\n{texto}")
    if re.search(INSTITUCIONAL, t_tit) and not re.search(r"\b(prend|pres[oa]|prisao|flagrante)", t_tit):
        return None
    if not re.search(VERBO_OCORRENCIA, t_all):
        return None

    crianca = bool(re.search(SINAL_CRIANCA, t_all))
    if not crianca:
        for m in re.finditer(IDADE_CRIANCA, t_all):
            janela = t_all[max(0, m.start() - 60): m.end() + 10]
            if int(m.group(1)) < 14 and re.search(r"vitima|menin|garot|crianca", janela):
                crianca = True
    # "estupro de vulnerável" sem sinal de criança pode envolver adulto vulnerável (ex.: pessoa sedada)
    crianca_titulo = bool(re.search(SINAL_CRIANCA, t_tit))
    mulher = bool(re.search(SINAL_MULHER, t_all))

    achadas = []
    for cid, padroes, exige in REGRAS:
        # a categoria principal é decidida pelo título; o corpo só complementa
        for base, origem in ((t_tit, "titulo"), (t_all, "texto")):
            if any(re.search(p, base) for p in padroes):
                if exige == "crianca" and not (crianca_titulo if origem == "titulo" else crianca):
                    continue
                if exige == "mulher" and not mulher:
                    continue
                achadas.append((cid, origem))
                break
    if not achadas:
        return None
    no_titulo = [c for c, o in achadas if o == "titulo"]
    principal = no_titulo[0] if no_titulo else achadas[0][0]
    secundarias = sorted({c for c, _ in achadas if c != principal}, key=[r[0] for r in REGRAS].index)
    if principal in ("violencia_sexual_crianca", "outros_crianca"):
        publico = "criancas_adolescentes"
    elif principal == "violencia_sexual" and not mulher:
        publico = "nao_informado"
    else:
        publico = "mulheres"
    # qualquer sinal de criança envolvida protege a localização
    envolve_crianca = publico == "criancas_adolescentes" or crianca or "vulneravel" in t_all
    return {"categoria": principal, "secundarias": secundarias, "publico": publico, "envolve_crianca": envolve_crianca}


# --------------------------------------------------------------------------- situação
def situacao(titulo: str, texto: str = "") -> dict:
    t = norm(f"{titulo}\n{texto}")
    medidas = []
    if re.search(r"flagrante", t): medidas.append("prisão em flagrante")
    if re.search(r"preventiv", t): medidas.append("prisão preventiva")
    if re.search(r"temporari", t): medidas.append("prisão temporária")
    if re.search(r"busca e apreensao", t): medidas.append("busca e apreensão")
    if not medidas and re.search(r"\b(prend\w*|pres[oa]|prisao|captur\w+)", t): medidas.append("prisão")
    if re.search(r"\bcondenad[oa] (a|pelo|pela|por) .{0,40}(feminicidio|estupro|violencia|lesao|ameaca)", t):
        status = "condenacao"
    elif re.search(r"denunciad[oa] pelo ministerio publico|denuncia (foi )?recebida", t):
        status = "denuncia_recebida"
    elif re.search(r"\bindici\w+|inquerito (foi )?(concluido|relatado|remetido)", t):
        status = "inquerito"
    else:
        status = "investigacao"
    return {"status_juridico": status, "medidas": medidas}


# --------------------------------------------------------------------------- datas
MESES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]


def data_do_fato(texto: str, ano_publicacao: int) -> str | None:
    t = norm(texto)
    m = re.search(r"\b(?:no dia |em |na noite de |na madrugada de |na manha de |na tarde de )?(\d{1,2})(?:º|o)? de (" + "|".join(MESES) + r")(?: de (\d{4}))?", t)
    if not m:
        return None
    dia, mes = int(m.group(1)), MESES.index(m.group(2)) + 1
    ano = int(m.group(3)) if m.group(3) else ano_publicacao
    if not (1 <= dia <= 31) or not (2000 <= ano <= ano_publicacao):
        return None
    return f"{ano:04d}-{mes:02d}-{dia:02d}"


# --------------------------------------------------------------------------- local
def _chave_mun(nome: str) -> str:
    n = norm(nome)
    n = re.sub(r"^st\.? ", "santa ", n)
    return n


class Localizador:
    def __init__(self, municipios: list[dict]):
        self.mun = municipios
        self.por_chave = {_chave_mun(m["nome"]): m for m in municipios}
        # apelidos usuais: "Valparaíso" = "Valparaíso de Goiás", "Águas Lindas" = "Águas Lindas de Goiás"...
        for m in municipios:
            k = _chave_mun(m["nome"])
            if k.endswith(" de goias"):
                curto = k[: -len(" de goias")]
                if curto not in self.por_chave and len(curto) > 5:
                    self.por_chave[curto] = m
        # nomes mais longos primeiro (ex.: "Aparecida de Goiânia" antes de "Goiânia")
        # "Goiás" isolado quase sempre é o estado; a cidade só vale como "cidade/município de Goiás"
        self.ordem = sorted((k for k in self.por_chave if k != "goias"), key=len, reverse=True)

    def normalizar(self, nome: str) -> dict | None:
        k = _chave_mun(nome)
        if k in self.por_chave:
            return self.por_chave[k]
        prox = difflib.get_close_matches(k, self.por_chave.keys(), n=1, cutoff=0.88)
        return self.por_chave[prox[0]] if prox else None

    def municipios_no_texto(self, texto: str) -> list[dict]:
        t = " " + re.sub(r"\bst\.? ", "santa ", norm(texto)) + " "
        achados, usados = [], []
        for k in self.ordem:
            for m in re.finditer(r"(?<![\w-])" + re.escape(k) + r"(?![\w-])", t):
                if any(a <= m.start() < b for a, b in usados):
                    continue
                usados.append((m.start(), m.end()))
                achados.append((m.start(), self.por_chave[k]))
        achados.sort(key=lambda x: x[0])
        vistos, out = set(), []
        for _, m in achados:
            if m["codigo_ibge"] not in vistos:
                vistos.add(m["codigo_ibge"]); out.append(m)
        return out

    def _apos_em(self, texto_norm: str) -> dict | None:
        """Primeiro município que aparece logo depois de 'em' / 'no município de' / 'cidade de'."""
        t = re.sub(r"\bst\.? ", "santa ", texto_norm)
        if re.search(r"\b(cidade|municipio) de goias\b|goias velho", t) and "goias" in self.por_chave:
            return self.por_chave["goias"]
        for m in re.finditer(r"\b(?:em|no municipio de|na cidade de|municipio de|cidade de)\s+(?:em\s+)?", t):
            resto = t[m.end(): m.end() + 50]
            for k in self.ordem:
                if resto == k or re.match(re.escape(k) + r"(?![\w-])", resto):
                    return self.por_chave[k]
        return None

    def municipio(self, titulo: str, texto: str = "") -> dict | None:
        """Município da ocorrência. Ordem: 'em X' no título; 'em X' no texto; qualquer menção no título;
        no título, tolera pequenos erros de digitação no trecho final 'em <Nome>'."""
        achado = self._apos_em(norm(titulo)) or (self._apos_em(norm(texto)) if texto else None)
        if achado:
            return achado
        tit = self.municipios_no_texto(titulo)
        if tit:
            return tit[0]
        m = re.search(r"\bem ([A-ZÁ-Ú][\wÀ-ú'. -]{2,40})$", titulo.strip())
        return self.normalizar(m.group(1)) if m else None


PREFIXOS_BAIRRO = r"(?:setor|bairro|jardim|jd\.?|residencial|res\.?|vila|parque|conjunto|loteamento|chacaras?|nucleo)"
PROIBIDO_BAIRRO = r"\b(rua|avenida|av\.|alameda|travessa|quadra|qd\.?|lote|lt\.?|numero|n[º°o]\.?|apartamento|apto|bloco|casa|condominio|fazenda|sitio|chacara \d)\b"


def bairro(texto: str, municipio_nome: str) -> str | None:
    """Extrai o nome do bairro/setor citado junto ao município. Nunca rua/número/condomínio."""
    if not texto:
        return None
    padrao = re.compile(
        r"\b(?:no|na|do|da|ao)\s+(" + PREFIXOS_BAIRRO + r"\s+[A-ZÁ-Úa-zá-ú0-9][\wÀ-ú'-]*(?:\s+(?:[A-ZÁ-Ú0-9IVX][\wÀ-ú'-]*|d[aoe]s?|e))*)",
        re.IGNORECASE,
    )
    mun_n = norm(municipio_nome)
    for m in padrao.finditer(texto):
        nome = m.group(1).strip(" -,.")
        janela = norm(texto[m.start(): m.end() + 90])
        if re.search(PROIBIDO_BAIRRO, norm(nome)):
            continue
        if len(nome.split()) > 6 or len(nome) < 6:
            continue
        # deve estar associado ao município da ocorrência (mesma frase)
        if mun_n not in janela and mun_n not in norm(texto[max(0, m.start() - 160): m.start()]):
            continue
        nome = re.sub(r"^(bairro)\s+", "", nome, flags=re.IGNORECASE)
        nome = re.sub(r"^jd\.?\s", "Jardim ", nome, flags=re.IGNORECASE)
        nome = re.sub(r"^res\.?\s", "Residencial ", nome, flags=re.IGNORECASE)
        # capitaliza de forma padronizada
        nome = " ".join(w if w.lower() in ("de", "da", "do", "das", "dos", "e") else (w if w.isupper() and len(w) <= 4 else w[:1].upper() + w[1:]) for w in nome.split())
        return nome
    return None


# --------------------------------------------------------------------------- resumo oficial (sem dados pessoais)
CLASSIFICADOR_VERSAO = 3
RE_ENDERECO = re.compile(r"\b(rua|avenida|av\.|alameda|travessa|quadra|qd\.?|lote|lt\.?|n[º°o]\.?\s*\d|apartamento|apto|bloco|condom[ií]nio|cep)\b", re.I)
RE_NOME_EXPLICITO = re.compile(r"identificad[oa] como|conhecid[oa] (como|por)|de nome|chamad[oa] de|vulgo|apelidad[oa]", re.I)
RE_NOME_PROPRIO = re.compile(r"\b[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+(?:\s+(?:d[aoe]s?|e)\s+|\s+)[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+")
PERMITIDOS_CAPS = re.compile(r"Pol[íi]cia|Delegacia|Deam|Dpca|Civil|Militar|Justiça|Poder|Judici|Minist|Público|Goiás|Goi[aâ]nia|Secretaria|Segurança|Estado|Operação|Tribunal|Conselho|Tutelar|Instituto|Médico|Legal|Grupo|Batalhão|Regional|Especializada|Atendimento|Mulher|Criança|Adolescente|Distrito|Federal|Brasil")


def resumo_oficial(texto: str, municipio: str, bairro_txt: str | None, max_chars: int = 420) -> str | None:
    """Até 2 frases da nota oficial, descartando qualquer frase com endereço ou possível nome próprio de pessoa."""
    if not texto:
        return None
    locais = {norm(municipio)} | ({norm(bairro_txt)} if bairro_txt else set())
    frases = re.split(r"(?<=[.!?])\s+", re.sub(r"\s+", " ", texto).strip())
    out = []
    for f in frases:
        if len(f) < 30 or RE_ENDERECO.search(f) or RE_NOME_EXPLICITO.search(f) or "“" in f or '"' in f:
            continue
        suspeito = False
        for m in RE_NOME_PROPRIO.finditer(f):
            trecho = m.group(0)
            if trecho in ("Maria da Penha",) or PERMITIDOS_CAPS.search(trecho) or norm(trecho) in locais or any(norm(trecho) in l or l in norm(trecho) for l in locais):
                continue
            if m.start() == 0 and len(trecho.split()) == 2 and trecho.split()[0] in ("Segundo", "Conforme", "Após", "Durante", "Ainda", "Na", "No", "Em", "De", "Diante"):
                continue
            suspeito = True
            break
        if suspeito:
            continue
        out.append(f)
        if len(out) == 2 or sum(len(x) for x in out) > max_chars:
            break
    txt = " ".join(out)
    if len(txt) > max_chars:
        txt = txt[:max_chars].rsplit(" ", 1)[0] + "…"
    return txt or None
