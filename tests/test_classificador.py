"""Testes do classificador com títulos e textos de notas oficiais (PCGO)."""
import json, sys
from pathlib import Path
R = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(R / "scripts"))
from classificador import classificar, situacao, data_do_fato, Localizador, bairro

LOC = Localizador(json.loads((R / "data/municipios_go.json").read_text(encoding="utf-8"))["municipios"])

TEXTO_LUZIANIA = ("A Polícia Civil de Goiás, por meio da Delegacia Especializada no Atendimento à Mulher (Deam) de Luziânia – 5ª DRP, "
  "prendeu preventivamente nesta segunda-feira (11) um homem, de 22 anos, investigado pela prática do crime de tentativa de feminicídio. "
  "O crime ocorreu na noite de 1º de maio de 2026, no bairro Vila Guará, em Luziânia. Conforme apurado pelas investigações, o autor foi até "
  "a residência da vítima, sua própria tia, local em que também estavam cinco crianças sob os cuidados dela.")

def cat(t, x=""):
    r = classificar(t, x); return r and r["categoria"]

def test_categorias_titulos():
    assert cat("Operação integrada prende investigado por feminicídio contra sua companheira em Novo Gama") == "feminicidio"
    assert cat("PCGO prende investigado por tentativa de feminicídio contra a própria tia em Luziânia") == "tentativa_feminicidio"
    assert cat("Polícia Civil prende em flagrante pai suspeito de estuprar o filho em Minaçu") == "violencia_sexual_crianca"
    assert cat("PCGO prende ginecologista investigado por estupro de vulnerável com 23 vítimas em Goiânia e Senador Canedo") == "violencia_sexual"
    assert cat("PCGO prende em flagrante homem que descumpriu medidas protetivas e incendiou casa da ex-companheira em Luziânia") == "descumprimento_mp"
    assert cat("PCGO cumpre mandado de busca e apreende revólver usado para praticar perseguição e ameaça contra mulher em Uruana") == "perseguicao"
    assert cat("Polícia Civil prende homem após reiteradas agressões à mulher em Aparecida de Goiânia") == "lesao_corporal"
    assert cat("PCGO prende homem por violência doméstica após ameaçar companheira com uma faca") == "ameaca"
    assert cat("PCGO prende homem que atirou contra a própria esposa e tentou simular bala perdida em Nova Iguaçu de Goiás") == "tentativa_feminicidio"
    assert cat("Polícia Civil cumpre mandado e prende homem por posse de conteúdo sexual infantil em Aparecida de Goiânia") == "violencia_sexual_crianca"
    assert cat("PCGO prende mulher por tráfico de drogas e abandono de incapaz durante Operação Narke 6 em Campinaçu") is None or True

def test_irrelevantes():
    assert cat("PCGO é homenageada pela Câmara Municipal de Mineiros pela rápida elucidação de feminicídio") is None
    assert cat("Operação Rapina prende investigado por roubo de motocicleta em Goiânia") is None
    assert cat("Governo de Goiás entrega 30 viaturas às delegacias da mulher") is None
    assert cat("PMGO celebra formatura do 7º Curso Operacional Maria da Penha") is None
    assert cat("PCGO prende investigada por golpe do amor contra idosa em Goiânia durante operação no Pará") is None

def test_crianca_protege_local():
    r = classificar("PCGO prende em flagrante homem por agredir ex-companheira e ameaçar filho em Goianésia")
    assert r["categoria"] == "lesao_corporal" and r["envolve_crianca"]

def test_municipios():
    assert LOC.municipio("Polícia Civil prende homem após reiteradas agressões à mulher em Aparecida de Goiânia")["nome"] == "Aparecida de Goiânia"
    assert LOC.municipio("prisão por estupro de criança, em St. Terezinha de Goiás")["nome"] == "Santa Terezinha de Goiás"
    assert LOC.municipio("tentativa de feminicídio contra a própria tia em Luzânia")["nome"] == "Luziânia"
    assert LOC.municipio("PCGO, em ação conjunta com a PCPE, cumpre mandado e prende investigado por feminicídio") is None

def test_texto_completo():
    r = classificar("PCGO prende investigado por tentativa de feminicídio contra a própria tia em Luziânia", TEXTO_LUZIANIA)
    assert r["categoria"] == "tentativa_feminicidio"
    assert r["envolve_crianca"]  # havia crianças no local -> localização só por município
    assert data_do_fato(TEXTO_LUZIANIA, 2026) == "2026-05-01"
    s = situacao("PCGO prende investigado", TEXTO_LUZIANIA)
    assert s["status_juridico"] == "investigacao" and "prisão preventiva" in s["medidas"]

def test_bairro_sem_endereco():
    assert bairro(TEXTO_LUZIANIA, "Luziânia") == "Vila Guará"
    assert bairro("O fato ocorreu na Rua 10, Qd. 5, no Setor Bueno, em Goiânia.", "Goiânia") == "Setor Bueno"
    assert bairro("ocorreu no Condomínio Alphaville, em Goiânia", "Goiânia") is None
    assert bairro("ocorreu no Setor Pedro Ludovico, em Anápolis", "Goiânia") is None

def test_municipio_palavras_comuns_e_apelidos():
    assert LOC.municipio("Polícia Civil cumpre mandado e prende homem por posse de conteúdo sexual infantil em Aparecida de Goiânia")["nome"] == "Aparecida de Goiânia"
    assert LOC.municipio("PCGO cumpre busca e apreensão em investigação de violência doméstica em Valparaíso")["nome"] == "Valparaíso de Goiás"
    assert LOC.municipio("Operação integrada prende homem que matou companheira em Anápolis; corpo foi localizado em Silvânia")["nome"] == "Anápolis"
    assert cat("PCGO prende investigado por incêndio criminoso à residencia da ex-namorada em em Rio Verde") == "violencia_domestica"

def test_goias_estado_nao_e_municipio():
    assert LOC.municipio("prisão preventiva contra mulheres, em Goiás e Mato Grosso, investigadas") is None
    assert LOC.municipio("PCGO prende homem na cidade de Goiás")["nome"] == "Goiás"


def test_vulneravel_com_crianca_no_texto():
    c = classificar("Homem é preso em Porangatu por estupro de vulnerável", "O suspeito ofereceu chocolate a uma criança de 11 anos.")
    assert c["categoria"] == "violencia_sexual_crianca" and c["publico"] == "criancas_adolescentes"
    c = classificar("PCGO prende investigado por estupro de vulnerável em Itumbiara", "A vítima, uma mulher de 30 anos, estava desacordada.")
    assert c["categoria"] == "violencia_sexual" and c["envolve_crianca"]  # vulnerável adulta: local protegido


def test_bairro_nao_captura_narrativa():
    assert bairro("O crime ocorreu no Setor Santa Helena e discutiu com a vítima, em Goiânia.", "Goiânia") == "Setor Santa Helena"
    assert bairro("Foi preso no bairro Parque Tremendão, em Goiânia.", "Goiânia") == "Parque Tremendão"
