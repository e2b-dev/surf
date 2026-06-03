export const DOWNLOAD_EXPORT_PATH = "/tmp/paychex-downloads.zip";
export const ADP_EXPORT_DIR = "/tmp/paychex-adp-export";

const DOWNLOAD_EXTENSIONS = [".csv", ".xls", ".xlsx", ".pdf", ".txt", ".zip"];

export function buildPaychexToAdpConverterScript(): string {
  return String.raw`
from __future__ import annotations

import csv
import json
import os
import re
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import xml.etree.ElementTree as ET

OUTPUT_COLUMNS = [
    "Co Code",
    "Batch ID",
    "File #",
    "Employee Name",
    "Temp Dept",
    "Temp Rate",
    "Reg Hours",
    "O/T Hours",
]

FIELD_ALIASES = {
    "file_number": [
        "file #",
        "file no",
        "file number",
        "employee id",
        "employee number",
        "employee no",
        "payroll id",
        "payroll number",
        "worker id",
        "paychex id",
    ],
    "employee_name": [
        "employee name",
        "name",
        "worker name",
        "full name",
    ],
    "first_name": ["first name", "given name"],
    "last_name": ["last name", "family name", "surname"],
    "company_code": ["co code", "company code"],
    "batch_id": ["batch id", "batch number"],
    "temp_dept": [
        "temp dept",
        "department",
        "department code",
        "dept",
        "home department",
        "labor department",
        "cost center",
    ],
    "temp_rate": ["temp rate", "hourly rate", "rate", "pay rate", "regular rate"],
    "reg_hours": [
        "reg hours",
        "regular hours",
        "regular",
        "hours",
        "worked hours",
        "total regular hours",
    ],
    "ot_hours": [
        "o/t hours",
        "ot hours",
        "overtime hours",
        "overtime",
    ],
}


def normalize_header(value: str) -> str:
    return re.sub(r"[^a-z0-9#]+", " ", value.strip().lower()).strip()


def canonical_headers(headers: list[str]) -> dict[str, str]:
    normalized = {normalize_header(header): header for header in headers}
    result: dict[str, str] = {}

    for key, aliases in FIELD_ALIASES.items():
        for alias in aliases:
            header = normalized.get(normalize_header(alias))
            if header:
                result[key] = header
                break

    return result


def get_value(row: dict[str, str], headers: dict[str, str], key: str) -> str:
    header = headers.get(key)
    if not header:
        return ""
    return str(row.get(header, "")).strip()


def parse_decimal(value: str) -> Decimal:
    cleaned = re.sub(r"[^0-9.\-]", "", value or "")
    if cleaned in {"", "-", ".", "-."}:
        return Decimal("0")
    try:
        return Decimal(cleaned)
    except InvalidOperation:
        return Decimal("0")


def format_decimal(value: str) -> str:
    amount = parse_decimal(value)
    if amount == 0:
        return ""
    return f"{amount.quantize(Decimal('0.01'))}"


def format_company_code(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_]", "", value or "ccc")[:3]
    if not cleaned:
        cleaned = "ccc"
    return cleaned.ljust(3, "_")


def employee_name(row: dict[str, str], headers: dict[str, str]) -> str:
    full_name = get_value(row, headers, "employee_name")
    if full_name:
        return full_name
    return " ".join(
        part
        for part in [
            get_value(row, headers, "first_name"),
            get_value(row, headers, "last_name"),
        ]
        if part
    )


def csv_rows(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        return list(csv.DictReader(handle))


def xlsx_shared_strings(root: ET.Element, namespace: str) -> list[str]:
    values: list[str] = []
    for item in root.findall(f".//{{{namespace}}}si"):
        values.append("".join(text.text or "" for text in item.findall(f".//{{{namespace}}}t")))
    return values


def xlsx_column_index(cell_ref: str) -> int:
    letters = re.sub(r"[^A-Z]", "", cell_ref.upper())
    index = 0
    for letter in letters:
        index = index * 26 + (ord(letter) - ord("A") + 1)
    return max(index - 1, 0)


def xlsx_rows(path: Path) -> list[dict[str, str]]:
    with ZipFile(path) as archive:
        workbook = archive.read("xl/worksheets/sheet1.xml")
        namespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
        shared: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            shared_root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            shared = xlsx_shared_strings(shared_root, namespace)

    root = ET.fromstring(workbook)
    table: list[list[str]] = []
    for row in root.findall(f".//{{{namespace}}}row"):
        values: list[str] = []
        for cell in row.findall(f"{{{namespace}}}c"):
            index = xlsx_column_index(cell.attrib.get("r", "A1"))
            while len(values) <= index:
                values.append("")
            value = cell.find(f"{{{namespace}}}v")
            text = value.text if value is not None and value.text is not None else ""
            if cell.attrib.get("t") == "s" and text:
                text = shared[int(text)]
            values[index] = text
        table.append(values)

    if not table:
        return []

    headers = table[0]
    return [
        {headers[index]: value for index, value in enumerate(row) if index < len(headers)}
        for row in table[1:]
    ]


def source_rows(download_dir: Path) -> list[tuple[str, dict[str, str]]]:
    rows: list[tuple[str, dict[str, str]]] = []
    for path in sorted(download_dir.iterdir()):
        suffix = path.suffix.lower()
        if suffix == ".csv":
            rows.extend((path.name, row) for row in csv_rows(path))
        elif suffix == ".xlsx":
            rows.extend((path.name, row) for row in xlsx_rows(path))
        elif suffix == ".zip":
            with ZipFile(path) as archive:
                for name in sorted(archive.namelist()):
                    if not name.lower().endswith(".csv") or name.endswith("/"):
                        continue
                    with archive.open(name) as member:
                        text = member.read().decode("utf-8-sig")
                    reader = csv.DictReader(text.splitlines())
                    rows.extend((f"{path.name}:{name}", row) for row in reader)
    return rows


def convert(download_dir: Path, output_dir: Path) -> int:
    output_dir.mkdir(parents=True, exist_ok=True)
    company_code = format_company_code(os.getenv("PAYCHEX_ADP_COMPANY_CODE", "ccc"))
    batch_id = os.getenv("PAYCHEX_ADP_BATCH_ID", "PAYCHEX").strip() or "PAYCHEX"
    output_name = f"PR{company_code}EPI.csv"
    output_path = output_dir / output_name
    manifest = {
        "adp_format": "Workforce Now Paydata CSV",
        "output": output_name,
        "sources": [],
        "rows_written": 0,
        "rows_skipped": 0,
        "notes": [
            "Company code defaults to ccc unless PAYCHEX_ADP_COMPANY_CODE is set.",
            "Batch ID defaults to PAYCHEX unless PAYCHEX_ADP_BATCH_ID is set.",
            "Confirm tenant-specific ADP hours and earnings codes before import.",
        ],
    }

    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=OUTPUT_COLUMNS, lineterminator="\n")
        writer.writeheader()

        for source, row in source_rows(download_dir):
            headers = canonical_headers(list(row.keys()))
            file_number = get_value(row, headers, "file_number")
            reg_hours = format_decimal(get_value(row, headers, "reg_hours"))
            ot_hours = format_decimal(get_value(row, headers, "ot_hours"))
            if not file_number or (not reg_hours and not ot_hours):
                manifest["rows_skipped"] += 1
                continue

            row_company = format_company_code(get_value(row, headers, "company_code") or company_code)
            row_batch = get_value(row, headers, "batch_id") or batch_id
            writer.writerow(
                {
                    "Co Code": row_company,
                    "Batch ID": row_batch,
                    "File #": file_number,
                    "Employee Name": employee_name(row, headers),
                    "Temp Dept": get_value(row, headers, "temp_dept"),
                    "Temp Rate": format_decimal(get_value(row, headers, "temp_rate")),
                    "Reg Hours": reg_hours,
                    "O/T Hours": ot_hours,
                }
            )
            manifest["rows_written"] += 1
            if source not in manifest["sources"]:
                manifest["sources"].append(source)

    (output_dir / "conversion_manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    print(f"PAYCHEX_ADP_EXPORT={output_path}")
    print(f"PAYCHEX_ADP_ROWS={manifest['rows_written']}")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("usage: paychex_to_adp.py DOWNLOAD_DIR OUTPUT_DIR", file=sys.stderr)
        raise SystemExit(64)
    raise SystemExit(convert(Path(sys.argv[1]), Path(sys.argv[2])))
`.trim();
}

export function buildSandboxDownloadsArchiveCommand(): string {
  const extensionPredicates = DOWNLOAD_EXTENSIONS.map(
    (extension) => `-iname '*${extension}'`
  ).join(" -o ");

  return `
set -e
DOWNLOAD_DIR="$HOME/Downloads"
EXPORT_PATH="${DOWNLOAD_EXPORT_PATH}"
ADP_EXPORT_DIR="${ADP_EXPORT_DIR}"
CONVERTER_PATH="/tmp/paychex_to_adp.py"
rm -f "$EXPORT_PATH"
rm -rf "$ADP_EXPORT_DIR"
if [ ! -d "$DOWNLOAD_DIR" ]; then
  echo "NO_DOWNLOAD_DIR"
  exit 2
fi
cd "$DOWNLOAD_DIR"
find . -maxdepth 1 -type f ! -name '*.crdownload' \\( ${extensionPredicates} \\) -print0 > /tmp/paychex-downloads.list
if [ ! -s /tmp/paychex-downloads.list ]; then
  echo "NO_DOWNLOADS"
  exit 3
fi
cat > "$CONVERTER_PATH" <<'PY'
${buildPaychexToAdpConverterScript()}
PY
python3 "$CONVERTER_PATH" "$DOWNLOAD_DIR" "$ADP_EXPORT_DIR"
python3 - <<'PY'
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

download_dir = Path.home() / "Downloads"
export_path = Path("/tmp/paychex-downloads.zip")
adp_export_dir = Path("/tmp/paychex-adp-export")
entries = [entry for entry in Path("/tmp/paychex-downloads.list").read_bytes().split(b"\\0") if entry]

with ZipFile(export_path, "w", ZIP_DEFLATED) as archive:
    for entry in entries:
        path = download_dir / entry.decode()
        archive.write(path, arcname=path.name)
    if adp_export_dir.exists():
        for path in sorted(adp_export_dir.iterdir()):
            if path.is_file():
                archive.write(path, arcname=f"adp/{path.name}")
PY
echo "PAYCHEX_ADP_EXPORT_DIR=$ADP_EXPORT_DIR"
echo "PAYCHEX_EXPORT_ARCHIVE=$EXPORT_PATH"
`.trim();
}
