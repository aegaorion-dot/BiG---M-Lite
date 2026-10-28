"""Read-only R&D; pypdf is an optional pinned local tool, never a runtime dependency."""
import hashlib, json, pathlib, sys
root = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / '.tools' / 'pdf'))
from pypdf import PdfReader
research = root / 'research' / 'country-pack-fabric'
out = research / 'pdf-text'
out.mkdir(exist_ok=True)
rows = [json.loads(line) for line in (research / 'observations.jsonl').read_text(encoding='utf-8').splitlines()]
seen, results = set(), []
for row in rows:
    a = row.get('artifact', {})
    digest = a.get('rawContentHash')
    if a.get('sourceType') != 'PDF' or digest in seen or a.get('httpStatus') != 200:
        continue
    seen.add(digest)
    raw = (research / 'captures' / a['rawStorageRef']).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == digest
    try:
        reader = PdfReader(research / 'captures' / a['rawStorageRef'])
        pages = [page.extract_text() or '' for page in reader.pages]
        text = '\n\f\n'.join(pages)
        ref = f'pdf-text/{digest}.txt'
        (research / ref).write_bytes(text.encode('utf-8'))
        empty = [i+1 for i, p in enumerate(pages) if not p.strip()]
        results.append({'rawContentHash': digest, 'sourceId': row['sourceId'], 'sourceUrl': row['url'],
                        'extractor': 'pypdf/6.12.2', 'pages': len(pages), 'textCharacters': len(text),
                        'pagesWithoutText': empty, 'ocrAssessment': 'OCR_REVIEW_REQUIRED' if empty else 'TEXT_EXTRACTED_ALL_PAGES',
                        'textRef': ref, 'textHash': hashlib.sha256(text.encode()).hexdigest(),
                        'metadata': {str(k): str(v) for k,v in (reader.metadata or {}).items()},
                        'warning': 'Text extraction is candidate evidence; reading order, tables, commencement and legal force require review.'})
    except Exception as error:
        results.append({'rawContentHash': digest, 'error': str(error), 'ocrAssessment': 'REVIEW_REQUIRED'})
(research / 'pdf-observations.json').write_text(json.dumps(results, indent=2, ensure_ascii=False)+'\n', encoding='utf-8')
for result in results:
    print(result.get('sourceId'), result.get('pages'), result.get('textCharacters'), result['ocrAssessment'])
