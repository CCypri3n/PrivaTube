const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Safe } = require('../web/safetext.js');

// Decode what a browser would show for text between tags / inside an attribute.
function decode(s) {
  return s.replace(/&(amp|lt|gt|quot|#39);/g, (m, e) =>
    ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[e]));
}

const HOSTILE = [
  'x" onerror="alert(1)',
  "x' onerror='alert(1)",
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  'Tom & Jerry &amp; &lt;b&gt;',
  "it's \"quoted\" `tick`",
  'héllo wörld 日本語 🎬 \u2028',
  '',
  '</div><div>'
];

test('escape: output has no raw markup characters and round-trips as text', () => {
  for (const s of HOSTILE) {
    const out = Safe.escape(s);
    assert.ok(!/[<>"']/.test(out), `raw char left in ${JSON.stringify(out)}`);
    assert.ok(!/&(?!(?:amp|lt|gt|quot|#39);)/.test(out), `bare & in ${out}`);
    assert.equal(decode(out), s);
  }
});

test('escape: non-strings', () => {
  const cases = [[null, ''], [undefined, ''], [0, '0'], [42, '42'], [1.5, '1.5'], [false, 'false']];
  for (const [input, want] of cases) assert.equal(Safe.escape(input), want);
});

test('escape: attribute injection stays inside the attribute', () => {
  const html = `<img alt="${Safe.escape('x" onerror="alert(1)')}" src='${Safe.escape("y' onerror='z")}'>`;
  assert.equal((html.match(/onerror/g) || []).length, 2);
  assert.ok(!/" onerror=|' onerror=/.test(html));
});

test('url: allowed links pass through unchanged', () => {
  const cases = [
    'https://example.com/a?b=c&d=e#f',
    'HTTP://example.com',
    'video.html?v=abcdefghijk',
    'video.html?v=abcdefghijk&t=5',
    'index.html?ch=UCxxxxxxxxxxxxxxxxxxxxxx',
    '  https://i.ytimg.com/vi/x/hq.jpg  '
  ];
  for (const u of cases) assert.equal(Safe.url(u, 'FALLBACK'), u.trim());
});

test('urlAttr: escaped for attributes, fallback when unsafe', () => {
  assert.equal(Safe.urlAttr('https://e.com/?a=1&b="2"'), 'https://e.com/?a=1&amp;b=&quot;2&quot;');
  assert.equal(Safe.urlAttr('javascript:alert(1)', 'x'), 'x');
  assert.equal(Safe.urlAttr(null), '');
});

test('url: everything else gets the fallback', () => {
  const cases = [
    'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'java\tscript:alert(1)', 'java\nscript:alert(1)',
    '\x01javascript:alert(1)', ' javascript:alert(1)', 'data:text/html,<script>1</script>',
    'DATA:image/png;base64,AAAA', 'vbscript:x', '//evil.example/x', '\\\\evil.example', '/\\evil.example',
    'https://exa mple.com', 'ftp://example.com', 'file:///etc/passwd', 'evil.html', 'web/icons/a.svg',
    '../video.html', '', null, undefined, 42, {}
  ];
  for (const u of cases) assert.equal(Safe.url(u, 'FALLBACK'), 'FALLBACK', JSON.stringify(u));
  assert.equal(Safe.url('javascript:1'), '');
});

const ID = 'abcdefghijk';

test('description: text is escaped, never markup', () => {
  const out = Safe.description('<script>alert(1)</script> & "q" \'s\'', { videoId: ID });
  assert.ok(!/<script|<\/script/.test(out));
  assert.equal(decode(out), '<script>alert(1)</script> & "q" \'s\'');
});

test('description: empty and non-strings', () => {
  assert.equal(Safe.description('', { videoId: ID }), '');
  assert.equal(Safe.description(null, { videoId: ID }), '');
  assert.equal(Safe.description(undefined), '');
});

test('description: YouTube links become PrivaTube links', () => {
  const cases = [
    ['see https://www.youtube.com/watch?v=aaaaaaaaaaa now', 'video.html?v=aaaaaaaaaaa'],
    ['see https://youtu.be/aaaaaaaaaaa now', 'video.html?v=aaaaaaaaaaa'],
    ['see https://youtube.com/watch?v=aaaaaaaaaaa&t=90s now', 'video.html?v=aaaaaaaaaaa&t=90'],
    ['see https://youtu.be/aaaaaaaaaaa?t=45 now', 'video.html?v=aaaaaaaaaaa&t=45'],
    ['see https://www.youtube.com/channel/UCaaaaaaaaaaaaaaaaaaaaaa now', 'index.html?ch=UCaaaaaaaaaaaaaaaaaaaaaa']
  ];
  for (const [text, href] of cases) {
    const out = Safe.description(text, { videoId: ID });
    assert.ok(out.includes(`<a href="${Safe.escape(href)}">`), out);
    assert.ok(!/youtu\.?be/.test(out), out);
    assert.ok(out.startsWith('see ') && out.endsWith(' now'));
  }
});

test('description: timecodes link to the current video', () => {
  let out = Safe.description('0:00 intro\n1:02:03 end 12:34', { videoId: ID });
  assert.ok(out.includes(`<a href="video.html?v=${ID}&amp;t=0">0:00</a>`), out);
  assert.ok(out.includes(`&amp;t=3723">1:02:03</a>`), out);
  assert.ok(out.includes(`&amp;t=754">12:34</a>`), out);
  out = Safe.description('1:05', { videoId: ID, region: 'DE' });
  assert.ok(out.includes(`<a href="video.html?v=${ID}&amp;lang=DE&amp;t=65">1:05</a>`), out);
});

test('description: timecodes with no current video stay text; ids are encoded', () => {
  assert.equal(Safe.description('at 1:05 ok', {}), 'at 1:05 ok');
  assert.equal(Safe.description('at 1:05 ok'), 'at 1:05 ok');
  const out = Safe.description('1:05', { videoId: 'a" onclick="x', region: '"><b>' });
  assert.ok(!/[<>]/.test(out.replace(/<\/?a[^>]*>/g, '')), out);
  assert.ok(!/" onclick=/.test(out), out);
});

test('description: plain links are clickable and external', () => {
  const out = Safe.description('go to https://example.com/a?x=1&y=2, thanks', { videoId: ID });
  assert.ok(out.includes('<a href="https://example.com/a?x=1&amp;y=2" target="_blank" rel="noopener noreferrer">https://example.com/a?x=1&amp;y=2</a>, thanks'), out);
});

test('description: hostile link text cannot break out of the anchor', () => {
  const out = Safe.description('https://example.com/"><script>alert(1)</script> x', { videoId: ID });
  assert.ok(!/<script/.test(out), out);
  assert.equal((out.match(/<a /g) || []).length, 1);
});

test('description: javascript: is just text', () => {
  const out = Safe.description('javascript:alert(1) and www.evil.com', { videoId: ID });
  assert.ok(!/<a /.test(out), out);
});

// --- comments (YouTube textDisplay: HTML with <a>, <br>) ---

test('comment: plain text, entities kept, bare & fixed', () => {
  assert.equal(Safe.comment('Tom &amp; Jerry &#39;hi&#39; &lt;b&gt;'), 'Tom &amp; Jerry &#39;hi&#39; &lt;b&gt;');
  assert.equal(Safe.comment('a & b'), 'a &amp; b');
  assert.equal(Safe.comment(''), '');
  assert.equal(Safe.comment(null), '');
});

test('comment: <br> kept as line breaks', () => {
  assert.equal(Safe.comment('a<br>b<br />c<BR/>d'), 'a<br>b<br>c<br>d');
});

test('comment: external anchor kept and hardened', () => {
  const out = Safe.comment('see <a href="https://example.com/x?a=1&amp;b=2" onclick="evil()">https://example.com/x?a=1&amp;b=2</a> ok');
  assert.equal(out, 'see <a href="https://example.com/x?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">https://example.com/x?a=1&amp;b=2</a> ok');
});

test('comment: YouTube anchors become PrivaTube links, timecode anchors too', () => {
  let out = Safe.comment('<a href="https://www.youtube.com/watch?v=aaaaaaaaaaa&amp;t=12">0:12</a>');
  assert.equal(out, '<a href="video.html?v=aaaaaaaaaaa&amp;t=12">0:12</a>');
  out = Safe.comment('<a href="https://youtu.be/aaaaaaaaaaa?t=7">https://youtu.be/aaaaaaaaaaa?t=7</a>');
  assert.equal(out, '<a href="video.html?v=aaaaaaaaaaa&amp;t=7">video.html?v=aaaaaaaaaaa&amp;t=7</a>');
});

test('comment: other markup is shown as text', () => {
  const cases = ['<img src=x onerror=alert(1)>', '<script>alert(1)</script>', '<b onclick="x">bold</b>', '<iframe src="javascript:1"></iframe>', '<a>no href</a>'];
  for (const c of cases) {
    const out = Safe.comment(c);
    assert.ok(!/<(script|img|iframe|b)\b/i.test(out), out);
    assert.equal(decode(out), c);
  }
});

test('comment: javascript: / data: hrefs are neutralised', () => {
  const cases = [
    '<a href="javascript:alert(1)">click</a>',
    '<a href="JaVaScRiPt:alert(1)">click</a>',
    '<a href="java&#9;script:alert(1)">click</a>',
    '<a href="&#106;avascript:alert(1)">click</a>',
    "<a href='data:text/html,x'>click</a>",
    '<a href="//evil.example">click</a>'
  ];
  for (const c of cases) {
    const out = Safe.comment(c);
    assert.ok(!/<a\b/i.test(out), out);
    assert.ok(!/href/i.test(out), out);
    assert.equal(out, 'click');
  }
});

test('comment: attribute breakout in href cannot add attributes', () => {
  const out = Safe.comment('<a href="https://example.com/&quot;onmouseover=&quot;x">t</a>');
  assert.ok(/^<a href="[^"]*" target="_blank" rel="noopener noreferrer">t<\/a>$/.test(out), out);
});

// --- static scan: API-supplied fields must not reach HTML unescaped ---

test('page scripts: API fields in HTML templates go through Safe', () => {
  const FIELDS = ['title', 'channelTitle', 'thumbnail', 'banner', 'avatar', 'authorName', 'authorAvatar', 'description', 'text', 'id', 'channelId', 'authorChannelId'];
  const files = ['PrivaTube.js', 'VideoPlayer.js'];
  const bad = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'web', f), 'utf8');
    const field = new RegExp('\\b(item|channel|video|comment)\\.(' + FIELDS.join('|') + ')\\b(?!\\s*\\?)');
    for (const m of src.matchAll(/\$\{([^}]*)\}/g)) {
      const expr = m[1].trim();
      if (/^Safe\./.test(expr)) continue;
      // document.title takes text, not HTML
      const line = src.slice(src.lastIndexOf('\n', m.index) + 1, src.indexOf('\n', m.index));
      if (/document\.title\s*=/.test(line)) continue;
      if (field.test(expr)) bad.push(`${f}: \${${expr}}`);
    }
  }
  assert.deepEqual(bad, []);
});
