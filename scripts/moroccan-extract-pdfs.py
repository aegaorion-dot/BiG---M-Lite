"""Read-only source extraction and targeted page previews. No app credentials."""
import hashlib, json, pathlib, sys
root=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'.tools'/'pdf'))
from pypdf import PdfReader
import pymupdf
research=root/'research'/'moroccan-tax'
out=research/'extractions'
out.mkdir(exist_ok=True)
previews=research/'previews'
previews.mkdir(exist_ok=True)
sources=json.loads((research/'sources.json').read_text(encoding='utf-8'))['records']
for source in sources:
    a=json.loads((research/'raw'/'artifacts'/(source['artifactId']+'.json')).read_text(encoding='utf-8'))
    if a['sourceType']!='PDF': continue
    file=research/'raw'/a['rawStorageRef']
    assert hashlib.sha256(file.read_bytes()).hexdigest()==a['rawContentHash']
    pages=[p.extract_text() or '' for p in PdfReader(file).pages]
    data={'rawContentHash':a['rawContentHash'],'extractor':'pypdf/6.12.2','pages':pages}
    (out/(source['identity']+'.json')).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    doc=pymupdf.open(file)
    matching=[i for i,text in enumerate(pages) if "Article 23.- Territorialit" in text or "Article 23. - Territorialit" in text]
    for i in sorted(set([0]+matching+[j+1 for j in matching if j+1<len(pages)])):
        doc[i].get_pixmap(matrix=pymupdf.Matrix(1.4,1.4)).save(previews/(source['identity']+'-page-'+str(i+1)+'.png'))
    print(json.dumps({'source':source['identity'],'pages':len(pages),'article23Pages':[i+1 for i in matching]}))
