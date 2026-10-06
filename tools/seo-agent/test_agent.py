import tempfile, unittest, subprocess, sys
from pathlib import Path
import agent
import xml.etree.ElementTree as ET

class AgentTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.root=Path(self.tmp.name)
        self.origin='https://example.com'
        self.html='<html lang="en"><head><title>A useful robot vacuum guide</title><meta name="description" content="Guide"><link rel="canonical" href="https://example.com/"></head><body><h1>Guide <span>for homes</span></h1><a href="/missing/">Missing</a><script type="application/ld+json">{bad}</script></body></html>'
        (self.root/'index.html').write_text(self.html)
        (self.root/'sitemap.xml').write_text('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>')
    def tearDown(self): self.tmp.cleanup()
    def test_broken_link_and_schema(self):
        codes={i['code'] for i in agent.scan(self.root,self.origin)['issues']}
        self.assertIn('broken_link',codes); self.assertIn('jsonld',codes); self.assertNotIn('h1',codes)
    def test_sitemap_idempotence_noindex_and_verification(self):
        (self.root/'private').mkdir()
        (self.root/'private/index.html').write_text(self.html.replace('https://example.com/','https://example.com/private/').replace('<head>','<head><meta name="robots" content="noindex">'))
        (self.root/'google123abc.html').write_text('google-site-verification: google123abc.html')
        self.assertEqual(agent.fix_sitemap(self.root,self.origin),1)
        self.assertEqual(agent.fix_sitemap(self.root,self.origin),0)
        self.assertNotIn('/private/',(self.root/'sitemap.xml').read_text())
        self.assertEqual(agent.scan(self.root,self.origin)['pages'],2)
    def test_sitemap_namespace_preserves_https_urls_and_dates(self):
        namespace='http://www.sitemaps.org/schemas/sitemap/0.9'
        target=self.root/'sitemap.xml'
        for existing_namespace in (namespace, namespace.replace('http:', 'https:')):
            for append_page in (False, True):
                with self.subTest(namespace=existing_namespace, append_page=append_page):
                    original=(f'<urlset xmlns="{existing_namespace}">\n'
                              f'  <url><loc>{self.origin}/</loc><lastmod>2026-02-23</lastmod></url>\n'
                              '</urlset>')
                    target.write_text(original,encoding='utf-8')
                    extra=self.root/'extra'
                    extra.mkdir(exist_ok=True)
                    (extra/'index.html').write_text(self.html.replace(self.origin+'/',self.origin+'/extra/').replace(
                        '<head>', '<head><meta name="robots" content="index">' if append_page else
                        '<head><meta name="robots" content="noindex">'),encoding='utf-8')
                    self.assertEqual(agent.fix_sitemap(self.root,self.origin), int(append_page))
                    result=target.read_text(encoding='utf-8')
                    expected=original.replace(existing_namespace,namespace,1)
                    if append_page:
                        expected=expected.replace('</urlset>',f'  <url><loc>{self.origin}/extra/</loc></url>\n</urlset>')
                    self.assertEqual(result,expected)
                    root=ET.fromstring(result)
                    self.assertEqual(root.tag,f'{{{namespace}}}urlset')
                    self.assertTrue(all(n.tag.startswith('{'+namespace+'}') for n in root.iter()))
                    self.assertTrue(all(n.text.startswith('https://') for n in root.iter(f'{{{namespace}}}loc')))
                    self.assertEqual([n.text for n in root.iter(f'{{{namespace}}}lastmod')],['2026-02-23'])
                    self.assertEqual(agent.fix_sitemap(self.root,self.origin),0)
                    self.assertEqual(target.read_text(encoding='utf-8'),result)
    def test_encoded_asset_query_and_path_escape(self):
        (self.root/'my image.webp').write_bytes(b'img')
        (self.root/'index.html').write_text(self.html.replace('</body>','<img alt="" src="/my%20image.webp?v=2"><a href="/%2e%2e/secret">bad</a></body>'))
        issues=agent.scan(self.root,self.origin)['issues']
        self.assertFalse(any(i['code']=='missing_asset' for i in issues))
        self.assertTrue(any(i['detail']=='/%2e%2e/secret' for i in issues))
    def test_gsc_ranking_filters(self):
        f=self.root/'Queries.csv'
        f.write_text('Top queries,Clicks,Impressions,CTR,Position\nbest vacuum,2,100,2%,8\nlow volume,0,2,0%,7\n')
        result=agent.opportunities(f)
        self.assertEqual(len(result),1); self.assertEqual(result[0]['query'],'best vacuum')
    def test_regression_gate(self):
        script=str(Path(agent.__file__).resolve())
        output=self.root/'seo-agent-output'
        command=[sys.executable,script,'--root',str(self.root),'--origin',self.origin,'--output',str(output)]
        self.assertEqual(subprocess.run(command,capture_output=True).returncode,0)
        baseline=self.root/'baseline.json'
        baseline.write_bytes((output/'audit.json').read_bytes())
        check=command+['--check','--baseline',str(baseline)]
        self.assertEqual(subprocess.run(check,capture_output=True).returncode,0)
        (self.root/'index.html').write_text(self.html.replace('</body>','<a href="/new-missing/">New</a></body>'))
        self.assertEqual(subprocess.run(check,capture_output=True).returncode,1)

if __name__=='__main__': unittest.main()
