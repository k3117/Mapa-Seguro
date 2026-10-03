#!/usr/bin/env python3
"""
Geocodifica as UNIDADES PÚBLICAS de atendimento de data/servicos.json usando o
Nominatim (OpenStreetMap), respeitando a política de uso (1 requisição/segundo,
User-Agent identificado). Só preenche coordenadas ainda vazias.

Nunca use este script para endereços de pessoas.
"""
import json
import time
from pathlib import Path

import requests

ARQ = Path(__file__).resolve().parent.parent / "data" / "servicos.json"
UA = "MapaSeguro/1.0 (geocodificacao de unidades publicas de atendimento)"
# Caixa aproximada do município de Goiânia, para descartar resultados fora da cidade
GOIANIA_BBOX = (-16.86, -49.45, -16.45, -49.08)  # lat_min, lon_min, lat_max, lon_max


def main() -> None:
    dados = json.loads(ARQ.read_text(encoding="utf-8"))
    alterou = False
    for s in dados["servicos"]:
        if s.get("lat") is not None:
            continue
        r = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": s["consulta_geocodificacao"], "format": "jsonv2", "limit": 1, "countrycodes": "br"},
            headers={"User-Agent": UA}, timeout=30,
        )
        time.sleep(1.1)
        if not r.ok or not r.json():
            print(f"[aviso] sem resultado: {s['id']}")
            continue
        res = r.json()[0]
        lat, lon = float(res["lat"]), float(res["lon"])
        if not (GOIANIA_BBOX[0] <= lat <= GOIANIA_BBOX[2] and GOIANIA_BBOX[1] <= lon <= GOIANIA_BBOX[3]):
            print(f"[aviso] resultado fora de Goiânia descartado: {s['id']}")
            continue
        s["lat"], s["lon"] = round(lat, 5), round(lon, 5)
        s["precisao_coordenada"] = f"nominatim:{res.get('addresstype') or res.get('type')}"
        alterou = True
        print(f"[ok] {s['id']} -> {s['lat']},{s['lon']} ({s['precisao_coordenada']})")
    if alterou:
        ARQ.write_text(json.dumps(dados, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
