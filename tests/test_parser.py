"""Testes do parser (python -m pytest tests/). Usam PDFs sintéticos, não dados reais."""
import io, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from reportlab.pdfgen import canvas
from atualizar_dados import extrair_linhas

def pdf_texto(linhas):
    buf = io.BytesIO(); c = canvas.Canvas(buf); y = 800
    for l in linhas:
        c.drawString(30, y, l); y -= 18
    c.save(); return buf.getvalue()

def test_texto_ok():
    r = extrair_linhas(pdf_texto(["DEMONSTRATIVO - ANO 2023",
        "FEMINICÍDIO 6 7 0 3 8 8 1 7 6 3 6 1 56",
        "ESTUPRO 60 55 70 62 69 64 55 53 62 64 78 85 777"]))
    assert r["ano"] == 2023
    assert r["linhas"]["feminicidio"]["total_publicado"] == 56
    assert r["linhas"]["estupro"]["mensal"][11] == 85

def test_soma_divergente_rejeitada():
    r = extrair_linhas(pdf_texto(["FEMINICÍDIO 6 7 0 3 8 8 1 7 6 3 6 1 99",
                                  "ESTUPRO 60 55 70 62 69 64 55 53 62 64 78 85 777"]))
    assert "feminicidio" not in r["linhas"]
    assert "estupro" in r["linhas"]

def test_celulas_coladas_rejeitadas():
    # 12 números em vez de 13 (células mescladas) -> não aceita
    r = extrair_linhas(pdf_texto(["FEMINICÍDIO 6 7 0 3 8 8 1 7 6 3 6 156"]))
    assert r["linhas"] == {}

def test_milhar_com_ponto():
    r = extrair_linhas(pdf_texto(["ESTUPRO 100 100 100 100 100 100 100 100 100 100 100 100 1.200"]))
    assert r["linhas"]["estupro"]["total_publicado"] == 1200
