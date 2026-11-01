"""Read-only source-page rendering; no OCR, document modification or runtime dependency."""
import hashlib, json, pathlib, sys
root=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'.tools'/'pdf'))
import pymupdf
research=root/'research'/'phase4-packs'
rows=[json.loads(line) for line in (research/'observations.jsonl').read_text(encoding='utf-8').splitlines()]
out=research/'previews'
out.mkdir(exist_ok=True)
index=[]
for source_id,page_number,name in [('id-treaty112-text',25,'pmk112-page25.png'),('id-hpp',62,'hpp-page62.png'),('id-hpp',63,'hpp-page63.png')]:
    artifact=next(row['artifact'] for row in rows if row['id']==source_id and row['success'])
    raw_path=research/'raw'/artifact['rawStorageRef']
    assert hashlib.sha256(raw_path.read_bytes()).hexdigest()==artifact['rawContentHash']
    document=pymupdf.open(raw_path)
    document[page_number-1].get_pixmap(matrix=pymupdf.Matrix(1.4,1.4)).save(out/name)
    index.append({'sourceId':source_id,'rawContentHash':artifact['rawContentHash'],'page':page_number,'previewRef':'previews/'+name,'previewHash':hashlib.sha256((out/name).read_bytes()).hexdigest(),'renderer':'PyMuPDF/1.26.5','purpose':'READ_ONLY_VISUAL_QA_NOT_LEGAL_APPROVAL'})
(out/'index.json').write_bytes((json.dumps(index,indent=2)+'\n').encode('utf-8'))
print('Rendered',len(index),'retained official source pages; no OCR.')
