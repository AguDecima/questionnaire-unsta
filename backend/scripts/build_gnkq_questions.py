#!/usr/bin/env python3
"""
Genera backend/data/gnkq-questions.json a partir de GNKQ.docx (tablas Word).

Uso:
  python3 scripts/build_gnkq_questions.py /ruta/a/GNKQ.docx
"""
from __future__ import annotations

import json
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "gnkq-questions.json"

# Mismos encabezados de sección que el documento GNKQ (no son ítems del cuestionario).
GNKQ_SECTIONS = [
    {"id": "1", "title": "¿Qué consejos cree usted que están dando los expertos?"},
    {"id": "2", "title": "Identificación de grupos de alimentos y sus nutrientes"},
    {"id": "3", "title": "Alimentación, enfermedades y control del peso"},
]


def cell_text(tc: ET.Element) -> str:
    texts: list[str] = []
    for p in tc.findall("w:p", NS):
        parts: list[str] = []
        for t in p.findall(".//w:t", NS):
            if t.text:
                parts.append(t.text)
            if t.tail:
                parts.append(t.tail)
        line = "".join(parts).strip()
        if line:
            texts.append(line)
    return " | ".join(texts)


def load_tables(docx_path: Path) -> list[ET.Element]:
    with zipfile.ZipFile(docx_path) as z:
        root = ET.fromstring(z.read("word/document.xml"))
    return root.findall(".//w:tbl", NS)


def add_matrix(questions: list[dict], tables: list[ET.Element], stem: str, section: str, table_index: int) -> None:
    tbl = tables[table_index]
    rows = tbl.findall("w:tr", NS)
    header_cells = [cell_text(tc) for tc in rows[0].findall("w:tc", NS)]
    opts_raw = header_cells[1:]
    option_ids = [f"opt{i}" for i in range(len(opts_raw))]
    options_meta = [{"id": oid, "text": txt} for oid, txt in zip(option_ids, opts_raw)]

    for rj, tr in enumerate(rows[1:]):
        cells = [cell_text(tc) for tc in tr.findall("w:tc", NS)]
        if not cells or not cells[0]:
            continue
        label = cells[0]
        mark_col = None
        for ci, val in enumerate(cells[1:], start=0):
            if val.strip() == "x":
                mark_col = ci
                break
        if mark_col is None:
            continue
        correct_id = option_ids[mark_col]
        questions.append(
            {
                "id": f"gnkq-s{section}-t{table_index}-r{rj}",
                "section": section,
                "stem": stem,
                "itemLabel": label,
                "text": f"{stem} — {label}",
                "options": [dict(o) for o in options_meta],
                "correctOptionId": correct_id,
            }
        )


def add_vertical_single(
    questions: list[dict],
    tables: list[ET.Element],
    stem: str,
    section: str,
    table_index: int,
    id_suffix: str,
) -> None:
    tbl = tables[table_index]
    rows = tbl.findall("w:tr", NS)
    opts = []
    correct = None
    for ri, tr in enumerate(rows):
        cells = [cell_text(tc) for tc in tr.findall("w:tc", NS)]
        if len(cells) >= 2 and cells[0]:
            oid = f"opt{ri}"
            opts.append({"id": oid, "text": cells[0]})
            if cells[1].strip() == "x":
                correct = oid
    questions.append(
        {
            "id": f"gnkq-s{section}-{id_suffix}",
            "section": section,
            "stem": stem,
            "text": stem,
            "options": opts,
            "correctOptionId": correct,
        }
    )


def build_questions(docx_path: Path) -> list[dict]:
    tables = load_tables(docx_path)
    questions: list[dict] = []

    add_matrix(
        questions,
        tables,
        "¿Recomiendan las GAPA que la gente consuma más, la misma cantidad o menos de los siguientes alimentos? (Marque una casilla por alimento).",
        "1",
        0,
    )
    add_vertical_single(
        questions,
        tables,
        "¿Cuántas porciones de frutas y verduras por día aconsejan consumir las GAPA? (Marque una).",
        "1",
        1,
        "porciones-fruta-verdura",
    )
    add_matrix(
        questions,
        tables,
        "¿Cuáles de estos tipos de grasas recomiendan las GAPA que se consuman menos? (Marque una casilla por cada opción)",
        "1",
        2,
    )
    add_vertical_single(
        questions,
        tables,
        "¿Qué recomiendan las GAPA con respecto al consumo de lácteos? (Marque una)",
        "1",
        3,
        "lacteos",
    )
    add_vertical_single(
        questions,
        tables,
        "¿Cuántas veces por semana se recomienda consumir pescados grasos (por ejemplo: atún, caballa, etc.) según las GAPA? (Marque una)",
        "1",
        4,
        "pescado",
    )
    add_vertical_single(
        questions,
        tables,
        "¿Cuál es la cantidad máxima recomendada para el consumo de bebidas alcohólicas por día según las GAPA? (Marque una)",
        "1",
        5,
        "alcohol",
    )
    add_vertical_single(
        questions,
        tables,
        "¿Qué recomiendan las GAPA en cuanto a patrones alimentarios? (Marque una)",
        "1",
        6,
        "patrones",
    )
    add_vertical_single(
        questions,
        tables,
        "Según las GAPA es válido reemplazar las porciones recomendadas de fruta por el jugo de estas mismas. (Marque una)",
        "1",
        7,
        "jugo-fruta",
    )
    add_vertical_single(
        questions,
        tables,
        "Según la Gráfica de la Alimentación Diaria de las GAPA, ¿Qué proporción o cantidad diaria se recomienda consumir del grupo de legumbres, cereales, papa, pan y pastas? (Marque una)",
        "1",
        8,
        "grafica-legumbres",
    )

    add_matrix(
        questions,
        tables,
        "¿Cree usted que estos alimentos y bebidas suelen tener alto, bajo o nulo contenido de azúcar agregado? (Marque una casilla por alimento)",
        "2",
        9,
    )
    add_matrix(
        questions,
        tables,
        "¿Cree usted que estos alimentos son típicamente altos o bajos en sodio? (Marque una casilla por alimento)",
        "2",
        10,
    )
    add_matrix(
        questions,
        tables,
        "¿Cree usted que estos alimentos son típicamente altos o bajos en fibra? (Marque una casilla por alimento)",
        "2",
        11,
    )
    add_matrix(
        questions,
        tables,
        "¿Cree usted que estos alimentos son una buena fuente de proteína? (Marque una casilla por alimento)",
        "2",
        12,
    )
    add_matrix(
        questions,
        tables,
        "¿Cuáles de los siguientes alimentos contienen almidón? (Marque una casilla por alimento)",
        "2",
        13,
    )
    add_matrix(
        questions,
        tables,
        "¿Cuál es el tipo de grasa predominante presente en cada uno de estos alimentos? (Marque una casilla por alimento)",
        "2",
        14,
    )
    add_vertical_single(
        questions,
        tables,
        "¿Cuál de estos alimentos posee grasas trans? (Marque una)",
        "2",
        15,
        "grasas-trans",
    )
    add_vertical_single(
        questions,
        tables,
        "La cantidad de calcio en un vaso de leche entera comparado con un vaso de leche descremada es (marque una):",
        "2",
        16,
        "calcio-leche",
    )
    add_vertical_single(
        questions,
        tables,
        "¿Cuál de los siguientes nutrientes tiene más calorías por el mismo peso de alimento? (Marque una)",
        "2",
        17,
        "calorias-nutriente",
    )
    add_vertical_single(
        questions,
        tables,
        "En comparación con los alimentos mínimamente procesados, los alimentos ultraprocesados son (marque una):",
        "2",
        18,
        "ultraprocesados",
    )

    add_vertical_single(
        questions,
        tables,
        "¿Cuál de estas enfermedades está relacionada con una baja ingesta de fibra? (Marque una)",
        "3",
        19,
        "fibra-enfermedad",
    )
    add_vertical_single(
        questions,
        tables,
        "¿Cuál de estas enfermedades está relacionada con cuánto azúcar consume la gente? (Marque una)",
        "3",
        20,
        "azucar-enfermedad",
    )
    add_vertical_single(
        questions,
        tables,
        "¿Cuál de estas enfermedades está relacionada con cuánto sodio o sal consume la gente? (Marque una)",
        "3",
        21,
        "sodio-enfermedad",
    )
    add_vertical_single(
        questions,
        tables,
        "¿Qué recomiendan las GAPA para reducir el riesgo de cáncer? (Marque una)",
        "3",
        22,
        "gapa-cancer",
    )
    add_vertical_single(
        questions,
        tables,
        "¿Qué recomiendan las GAPA para prevenir enfermedades cardiovasculares? (Marque una)",
        "3",
        23,
        "gapa-cardiovascular",
    )
    add_vertical_single(
        questions,
        tables,
        "¿Qué recomiendan las GAPA para prevenir la Diabetes 2? (Marque una)",
        "3",
        24,
        "gapa-diabetes",
    )
    add_vertical_single(
        questions,
        tables,
        "¿Cuál de estos alimentos es más probable que eleve el colesterol sanguíneo? (Marque una)",
        "3",
        25,
        "colesterol",
    )
    add_vertical_single(
        questions,
        tables,
        "¿Cuál de estos alimentos tiende a elevar más rápidamente la glucemia después de comer? (Marque una)",
        "3",
        26,
        "glucemia",
    )
    add_vertical_single(
        questions,
        tables,
        "Para mantener un peso saludable la gente debería eliminar completamente las grasas de su dieta. (Marque una)",
        "3",
        27,
        "peso-sin-grasas",
    )
    add_vertical_single(
        questions,
        tables,
        "Para mantener un peso saludable la gente debería comer una dieta alta en proteínas. (Marque una)",
        "3",
        28,
        "peso-proteinas",
    )
    add_vertical_single(
        questions,
        tables,
        "Comer pan siempre causa aumento de peso. (Marque una)",
        "3",
        29,
        "pan-peso",
    )
    add_vertical_single(
        questions,
        tables,
        "La fibra puede disminuir las probabilidades de aumentar de peso. (Marque una)",
        "3",
        30,
        "fibra-peso",
    )
    add_matrix(
        questions,
        tables,
        "¿Cuáles de las siguientes conductas ayudan a mantener un peso saludable? (Marque una por cada afirmación)",
        "3",
        31,
    )
    add_vertical_single(
        questions,
        tables,
        "Si alguien tiene un IMC de 20 kg/m² ¿Cuál sería su estado nutricional? (Marque una)",
        "3",
        32,
        "imc-20",
    )
    add_vertical_single(
        questions,
        tables,
        "Si alguien tiene un IMC de 30 kg/m² ¿Cuál sería su estado nutricional? (Marque una)",
        "3",
        33,
        "imc-30",
    )

    # Tabla 34 incompleta en el DOCX (opciones vacías). Completar manualmente si el Word se corrige.
    questions.append(
        {
            "id": "gnkq-s3-forma-corporal",
            "section": "3",
            "stem": "¿Cuál de las siguientes formas corporales incrementa el riesgo de enfermedad cardiovascular? (Marque una)",
            "text": "¿Cuál de las siguientes "
            "formas corporales incrementa el riesgo de enfermedad cardiovascular? (Marque una)",
            "note": "En el DOCX la tabla de esta pregunta no contiene el texto de las opciones. "
            "Revisar el documento original y actualizar este JSON si hace falta.",
            "options": [
                {"id": "opt0", "text": "Mayor grasa abdominal o distribución central (androide)"},
                {"id": "opt1", "text": "Mayor acumulación periférica (p. ej., caderas y muslos)"},
                {"id": "opt2", "text": "Ambas presentan el mismo riesgo cardiovascular"},
                {"id": "opt3", "text": "No estoy seguro/a"},
            ],
            "correctOptionId": "opt0",
        }
    )

    return questions


def main() -> None:
    if len(sys.argv) < 2:
        print("Uso: python3 scripts/build_gnkq_questions.py /ruta/a/GNKQ.docx", file=sys.stderr)
        sys.exit(1)

    docx = Path(sys.argv[1])
    if not docx.is_file():
        print(f"No se encontro el archivo: {docx}", file=sys.stderr)
        sys.exit(1)

    built = build_questions(docx)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {"sections": GNKQ_SECTIONS, "questions": built}
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"OK: {OUT} ({len(built)} preguntas, {len(GNKQ_SECTIONS)} secciones)")


if __name__ == "__main__":
    main()
