"""Extract received IVORIS PDFs, not generated invoices. No database or patient mutation.
BEMA amount columns may be blank: preserve raw rows/amount tokens, never guess their columns.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path
from pypdf import PdfReader

parser = argparse.ArgumentParser()
parser.add_argument('directory', type=Path)
parser.add_argument('--out', type=Path, required=True)
args = parser.parse_args()
records, issues = [], []
for quarter, year in [(4, 2025), (1, 2026), (2, 2026), (3, 2026)]:
    identity_file = args.directory / f'BEMA {quarter}Q{year} alle Patienten mit Patientennummer.pdf'
    identities = {}
    if identity_file.exists():
        identity_hash = hashlib.sha256(identity_file.read_bytes()).hexdigest()
        for page_no, page in enumerate(PdfReader(identity_file).pages, 1):
            for line in (page.extract_text() or '').splitlines():
                match = re.match(r'^(\d+)\. (.+?) (\d{8}) (.+)$', line)
                if match:
                    number, name, patient_number, _ = match.groups()
                    if number in identities:
                        raise ValueError('Duplicate BEMA row identity')
                    identities[number] = (name, patient_number, page_no)
    for schedule, filename in [('BEMA', f'BEMA Betragsliste {quarter}Q{year} alle Patienten.pdf'), ('GOZ', f'GOZ {quarter}Q{year} alle Patienten.pdf')]:
        path = args.directory / filename
        if not path.exists():
            issues.append({'file': filename, 'reason': 'missing_source'})
            continue
        checksum = hashlib.sha256(path.read_bytes()).hexdigest()
        for page_no, page in enumerate(PdfReader(path).pages, 1):
            for line in (page.extract_text() or '').splitlines():
                row = re.match(r'^(\d+)\. (.+)$', line)
                if not row:
                    continue
                number, body = row.groups()
                if schedule == 'BEMA':
                    reference = identities.get(number)
                    if not reference or not body.startswith(reference[0] + ' '):
                        issues.append({'file': filename, 'page': page_no, 'row': number, 'reason': 'identity_pair_mismatch'})
                        continue
                    name, patient_number, identity_page = reference
                    pair = {'file': identity_file.name, 'checksum': identity_hash, 'page': identity_page, 'row': number}
                    amounts = re.findall(r'\b\d+(?:\.\d{3})*,\d{2}\b', body[len(name):])
                else:
                    match = re.match(r'^(.+?) (\d{8}) (\d+) (\d+(?:\.\d{3})*,\d{2}) (\d{5}) (.+)$', body)
                    if not match:
                        issues.append({'file': filename, 'page': page_no, 'row': number, 'reason': 'unparsed_row'})
                        continue
                    name, patient_number, _, amount, _, _ = match.groups()
                    amounts, pair = [amount], None
                records.append({'schedule': schedule, 'quarter': f'{year}-Q{quarter}', 'name': name,
                    'patientNumber': patient_number, 'raw': line, 'amountTokens': amounts,
                    'source': {'system': 'ivoris_pdf', 'recordId': filename, 'version': checksum,
                        'locator': f'page:{page_no}:row:{number}', 'checksum': checksum}, 'identityEvidence': pair})
args.out.parent.mkdir(parents=True, exist_ok=True)
args.out.write_text(json.dumps({'records': records, 'issues': issues}, ensure_ascii=False), encoding='utf8')
args.out.chmod(0o600)
print(json.dumps({'records': len(records), 'issues': len(issues)}))
