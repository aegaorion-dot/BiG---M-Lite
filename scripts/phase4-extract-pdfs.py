"""Offline read-only official PDF extraction; no OCR and no runtime dependency."""
import hashlib, json, pathlib, sys
root=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'.tools'/'pdf'))
from pypdf import PdfReader
research=root/'research'/'phase4-packs'
out=research/'extractions'
out.mkdir(exist_ok=True)
for line in (research/'observations.jsonl').read_text(encoding='utf-8').splitlines():
    row=json.loads(line)
    if not row['success'] or row['artifact']['sourceType']!='PDF':
        continue
    artifact=row['artifact']
    raw=(research/'raw'/artifact['rawStorageRef']).read_bytes()
    assert hashlib.sha256(raw).hexdigest()==artifact['rawContentHash']
    pages=[page.extract_text() or '' for page in PdfReader(research/'raw'/artifact['rawStorageRef']).pages]
    data={'rawContentHash':artifact['rawContentHash'],'extractor':'pypdf/6.12.2','pages':pages}
    (out/(row['id']+'.json')).write_bytes((json.dumps(data,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
    (out/(row['id']+'.txt')).write_bytes('\n\f\n'.join(pages).encode('utf-8'))
    print(row['id'],len(pages),'pages',sum(bool(p.strip()) for p in pages),'with text')
