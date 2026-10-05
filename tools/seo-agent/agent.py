#!/usr/bin/env python3
"""Dependency-free static SEO auditor. No LLM calls, no publishing."""
import argparse, csv, json, re, sys
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit, unquote
import xml.etree.ElementTree as ET

class Page(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.title=[]; self.h1=[]; self.links=[]; self.images=[]; self.assets=[]
        self.ids=set(); self.meta={}; self.canon=[]; self.schemas=[]; self.lang=''
        self.active=None; self.feed(text); self.close()
    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        if a.get('id'): self.ids.add(a['id'])
        if tag=='html': self.lang=a.get('lang','')
        if tag=='meta': self.meta[a.get('name','').lower()]=a.get('content','')
        if tag=='link':
            if 'canonical' in a.get('rel','').split(): self.canon.append(a.get('href',''))
            if 'stylesheet' in a.get('rel','').split(): self.assets.append(a.get('href',''))
        if tag=='a': self.links.append(a)
        if tag=='img': self.images.append(a); self.assets.append(a.get('src',''))
        if tag=='script' and a.get('src'): self.assets.append(a['src'])
        if tag in ('title','h1'):
            target=self.title if tag=='title' else self.h1
            target.append(''); self.active=(tag,target)
        if tag=='script' and a.get('type')=='application/ld+json':
            self.schemas.append(''); self.active=('script',self.schemas)
    def handle_data(self, data):
        if self.active: self.active[1][-1]+=data
    def handle_endtag(self,tag):
        if self.active and tag==self.active[0]: self.active=None

def scan(root, origin):
    root=Path(root).resolve(); origin=origin.rstrip('/')
    pages={}; issues=[]
    def issue(path,code,detail,severity='warning'):
        issues.append(dict(path=path,code=code,detail=detail,severity=severity))
    for f in sorted(root.rglob('*.html')):
        rel=f.relative_to(root).as_posix()
        if any(x in rel.split('/') for x in ('.git','node_modules','tools','seo-agent-output')): continue
        if re.fullmatch(r'google[a-f0-9]+\.html',f.name): continue
        route='/' + (rel[:-10] if rel.endswith('index.html') else rel)
        p=Page(f.read_text(encoding='utf-8')); pages[route]=(rel,p)
    def resolve(url, base):
        u=urlsplit(urljoin(origin+base,url))
        if u.netloc.lower()!=urlsplit(origin).netloc.lower() or u.scheme not in ('https','http'): return None
        path=unquote(u.path); candidate=(root/path.lstrip('/')).resolve()
        if not candidate.is_relative_to(root): return (u,None)
        if candidate.is_dir(): candidate=candidate/'index.html'
        return u,candidate
    incoming=Counter()
    for route,(rel,p) in pages.items():
        if len(p.title)!=1 or not p.title[0].strip(): issue(rel,'title','Missing or multiple titles','error')
        elif not 20<=len(p.title[0].strip())<=65: issue(rel,'title_length','Title outside editorial range 20–65; review manually')
        if not p.meta.get('description'): issue(rel,'description','Missing meta description')
        if len(p.h1)!=1: issue(rel,'h1',f'{len(p.h1)} H1 elements','error')
        if not p.lang: issue(rel,'language','Missing html lang')
        if p.canon != [origin+route]: issue(rel,'canonical',f'Expected one canonical: {origin+route}')
        for a in p.images:
            if 'alt' not in a: issue(rel,'image_alt',a.get('src',''))
        for raw in p.schemas:
            try: json.loads(raw)
            except json.JSONDecodeError: issue(rel,'jsonld','Invalid JSON-LD syntax','error')
        for a in p.links:
            url=a.get('href',''); resolved=resolve(url,route)
            if not resolved: continue
            u,target=resolved
            if target is None or not target.is_file(): issue(rel,'broken_link',url,'error'); continue
            target_route=u.path
            if target_route.endswith('/index.html'): target_route=target_route[:-10]
            if target_route in pages and target_route!=route: incoming[target_route]+=1
            if u.fragment and target.suffix=='.html':
                tp=Page(target.read_text(encoding='utf-8'))
                if unquote(u.fragment) not in tp.ids: issue(rel,'broken_anchor',url)
        for url in p.assets:
            resolved=resolve(url,route)
            if resolved and (resolved[1] is None or not resolved[1].is_file()): issue(rel,'missing_asset',url,'error')
    for field in ('title','description'):
        groups={}
        for route,(rel,p) in pages.items():
            value=' '.join(p.title).strip() if field=='title' else p.meta.get('description','').strip()
            if value: groups.setdefault(value.casefold(),[]).append(rel)
        for value,rels in groups.items():
            if len(rels)>1:
                for rel in rels: issue(rel,'duplicate_'+field,', '.join(rels))
    for route,(rel,p) in pages.items():
        if route!='/' and not incoming[route]: issue(rel,'orphan','No incoming HTML link')
    sitemap=root/'sitemap.xml'; listed=set()
    if sitemap.exists():
        try:
            tree=ET.parse(sitemap)
            listed={n.text.strip() for n in tree.iter() if n.tag.split('}')[-1]=='loc' and n.text}
            for url in sorted(listed):
                resolved=resolve(url,'/')
                if not resolved or resolved[1] is None or not resolved[1].is_file(): issue('sitemap.xml','sitemap_missing_target',url,'error')
        except ET.ParseError: issue('sitemap.xml','sitemap_xml','Invalid XML','error')
    else: issue('sitemap.xml','sitemap_missing','Missing sitemap')
    for route,(rel,p) in pages.items():
        if 'noindex' not in p.meta.get('robots','').lower() and p.canon==[origin+route] and origin+route not in listed:
            issue(rel,'sitemap_omission',origin+route)
    robots=root/'robots.txt'
    if not robots.exists(): issue('robots.txt','robots_missing','Missing robots.txt')
    return dict(pages=len(pages),issues=sorted(issues,key=lambda x:(x['path'],x['code'],x['detail'])))

def opportunities(path):
    if not path: return []
    with open(path,encoding='utf-8-sig',newline='') as f:
        reader=csv.DictReader(f)
        if not {'Top queries','Clicks','Impressions','CTR','Position'}.issubset(reader.fieldnames or []):
            raise ValueError('Use the English Search Console Queries.csv export (Top queries, Clicks, Impressions, CTR, Position).')
        rows=[]
        for r in reader:
            impressions=float(r['Impressions']); position=float(r['Position']); clicks=float(r['Clicks'])
            if impressions<20 or not 3<=position<=20: continue
            intent=any(t in r['Top queries'].lower() for t in ('best','review','vs','compare','price','buy','pet','carpet'))
            score=impressions/(position+2)*(1.5 if intent else 1)
            rows.append(dict(query=r['Top queries'],impressions=impressions,clicks=clicks,position=position,priority=round(score,2)))
    return sorted(rows,key=lambda r:-r['priority'])[:20]

def fix_sitemap(root, origin):
    """Only append canonically self-referencing indexable pages. Never invent lastmod."""
    root=Path(root); target=root/'sitemap.xml'
    if not target.exists(): return 0
    text=target.read_text(encoding='utf-8'); ET.fromstring(text)
    report=scan(root,origin)
    urls=sorted({i['detail'] for i in report['issues'] if i['code']=='sitemap_omission'})
    if not urls: return 0
    if '</urlset>' not in text: raise ValueError('Unsupported prefixed sitemap; manual review needed')
    from xml.sax.saxutils import escape
    additions=''.join(f'  <url><loc>{escape(url)}</loc></url>\n' for url in urls)
    target.write_text(text.replace('</urlset>',additions+'</urlset>'),encoding='utf-8')
    return len(urls)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--root',default='.'); parser.add_argument('--origin',default='https://robotvacuumlab.github.io')
    parser.add_argument('--output',default='seo-agent-output'); parser.add_argument('--gsc-csv')
    parser.add_argument('--fix-sitemap',action='store_true'); parser.add_argument('--baseline'); parser.add_argument('--check',action='store_true')
    args=parser.parse_args()
    if args.fix_sitemap: fix_sitemap(args.root,args.origin)
    report=scan(args.root,args.origin); report['opportunities']=opportunities(args.gsc_csv)
    out=Path(args.output); out.mkdir(parents=True,exist_ok=True)
    (out/'audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    lines=['# RobotVacuumLab — SEO audit',f"\nPages audited: {report['pages']}",f"Findings: {len(report['issues'])}",'\n## Findings']
    lines += [f"- [{i['severity']}] `{i['path']}` — {i['code']}: {i['detail']}" for i in report['issues']]
    lines += ['\n## Search Console opportunities','Heuristic triage, not revenue estimates. Confirm intent, existing page coverage and cannibalization before creating content.']
    lines += [f"- {r['query']}: {r['impressions']:g} impressions, position {r['position']:g}, priority {r['priority']}" for r in report['opportunities']]
    if not args.gsc_csv: lines+=['No GSC export supplied; no invented keyword volumes.']
    (out/'audit.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    if args.check:
        errors={(i['path'],i['code'],i['detail']) for i in report['issues'] if i['severity']=='error'}
        if args.baseline:
            old=json.loads(Path(args.baseline).read_text())
            errors-={(i['path'],i['code'],i['detail']) for i in old['issues'] if i['severity']=='error'}
        if errors:
            print(f'{len(errors)} new blocking findings',file=sys.stderr); return 1
    print(f"Audited {report['pages']} pages; {len(report['issues'])} findings")
    return 0
if __name__=='__main__': sys.exit(main())
