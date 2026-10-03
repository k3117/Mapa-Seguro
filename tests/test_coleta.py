"""Teste ponta a ponta da coleta com a API do WordPress simulada (sem rede)."""
import json, shutil, sys
from pathlib import Path
import pytest
R = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(R / "scripts"))
import coletar_ocorrencias as C

POSTS = {
 "PCGO": [
  {"id": 1, "date": "2026-09-10T10:00:00", "modified": "2026-09-10T10:00:00", "link": "https://goias.gov.br/policiacivil/a/",
   "title": {"rendered": "PCGO prende em flagrante homem por tentativa de feminicídio contra companheira em Goiânia"},
   "content": {"rendered": "<p>O fato ocorreu em 8 de setembro, no Setor Bueno, em Goiânia. O investigado, João da Silva, 40 anos, foi preso em flagrante. A vítima Maria Aparecida Souza foi socorrida.</p>"}},
  {"id": 2, "date": "2026-09-11T10:00:00", "modified": "2026-09-11T10:00:00", "link": "https://goias.gov.br/policiacivil/b/",
   "title": {"rendered": "PCGO prende investigado por estupro de vulnerável contra enteada em Goiânia"},
   "content": {"rendered": "<p>A criança de 9 anos morava no Jardim América, em Goiânia.</p>"}},
  {"id": 4, "date": "2026-09-12T11:00:00", "modified": "2026-09-12T11:00:00", "link": "https://goias.gov.br/policiacivil/e/",
   "title": {"rendered": "PCGO prende homem por ameaça contra ex-companheira em Goiânia"}, "content": {"rendered": "<p>Preso.</p>"}},
  {"id": 3, "date": "2026-09-12T10:00:00", "modified": "2026-09-12T10:00:00", "link": "https://goias.gov.br/policiacivil/c/",
   "title": {"rendered": "PCGO promove palestra sobre violência doméstica"}, "content": {"rendered": "<p>Evento.</p>"}},
 ],
 "SSP-GO": [
  {"id": 9, "date": "2026-09-11T12:00:00", "modified": "2026-09-11T12:00:00", "link": "https://goias.gov.br/seguranca/d/",
   "title": {"rendered": "Polícia prende homem por tentativa de feminicídio contra companheira em Goiânia"}, "content": {"rendered": "<p>Preso em flagrante em Goiânia.</p>"}},
 ],
 "PMGO": [],
}

class Resp:
    def __init__(self, data, headers=None, status=200): self._d, self.headers, self.status_code = data, headers or {}, status
    ok = property(lambda s: s.status_code < 400)
    def json(self): return self._d

class FakeSess:
    headers = {}
    def get(self, url, params=None, timeout=None):
        if "nominatim" in url:
            return Resp([{"lat": "-16.70", "lon": "-49.27", "addresstype": "suburb"}])
        for s in C.SITES:
            if url.startswith(s["base"]):
                return Resp(POSTS[s["sigla"]] if params.get("page") == 1 else [], {"X-WP-TotalPages": "1"})
        return Resp([], status=404)

def b_ok(regs):
    b = regs["pcgo-2"]
    return b["resumo_oficial"] is None  # criança: sem resumo


@pytest.fixture
def ambiente(tmp_path, monkeypatch):
    d = tmp_path / "data"; d.mkdir()
    shutil.copy(R / "data/municipios_go.json", d)
    monkeypatch.setattr(C, "D", d); monkeypatch.setattr(C, "RAIZ", tmp_path)
    monkeypatch.setattr(C.requests, "Session", FakeSess)
    monkeypatch.setattr(C.time, "sleep", lambda s: None)
    monkeypatch.setattr(C, "TERMOS", ["x"])
    monkeypatch.setattr(sys, "argv", ["x", "--dias", "3650"])
    return d

def test_coleta(ambiente):
    assert C.main() == 0
    out = json.loads((ambiente / "ocorrencias.json").read_text())
    regs = {r["id"]: r for r in out["ocorrencias"]}
    assert "pcgo-3" not in regs and "pcgo-4" not in regs  # institucional e não grave                          # evento institucional ignorado
    a = regs["pcgo-1"]
    assert a["categoria"] == "tentativa_feminicidio" and a["bairro"] == "Setor Bueno" and a["precisao_local"] == "bairro"
    assert a["data_fato"] == "2026-09-08"
    assert a["resumo_oficial"] and "Setor Bueno" in a["resumo_oficial"]
    assert b_ok(regs)
    assert "sspgo-9" not in regs and len(a["fontes"]) == 2  # mesma ocorrência em outra fonte oficial -> fundida
    b = regs["pcgo-2"]
    assert b["categoria"] == "violencia_sexual_crianca" and b["bairro"] is None and b["precisao_local"] == "municipio"
    bruto = json.dumps(out, ensure_ascii=False)
    for proibido in ("João", "Silva", "Maria Aparecida", "morava"):
        assert proibido not in bruto                     # nenhum texto/nome da nota é armazenado
    assert (ambiente.parent / "feed.xml").exists()
    # segunda execução idempotente (não duplica fontes)
    assert C.main() == 0
    out2 = json.loads((ambiente / "ocorrencias.json").read_text())
    assert len({r["id"]: r for r in out2["ocorrencias"]}["pcgo-1"]["fontes"]) == 2

def test_moderacao(ambiente):
    (ambiente / "moderacao.json").write_text(json.dumps({"ocultar": [{"id": "pcgo-2", "motivo": "teste"}],
        "corrigir": [{"id": "pcgo-1", "campos": {"status_juridico": "inquerito"}, "motivo": "teste", "data": "2026-10-01"}]}))
    C.main()
    regs = {r["id"]: r for r in json.loads((ambiente / "ocorrencias.json").read_text())["ocorrencias"]}
    assert "pcgo-2" not in regs and regs["pcgo-1"]["status_juridico"] == "inquerito" and regs["pcgo-1"]["fonte_status"] == "corrigida"
