#!/usr/bin/env python3
"""اختبار متصفح حقيقي (Chromium بلا واجهة) عبر Playwright ضد الخادم الفعلي. التشغيل: python3 tools/e2e_browser.py"""
import json, subprocess, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
URL, SHOTS = 'http://127.0.0.1:3077', Path('/tmp/shots')
AUD = """(() => { const O = window.AudioContext; window.__aud = { ctx: 0, src: 0, started: 0, stopped: 0 };
  window.AudioContext = class extends O { constructor(...a) { super(...a); window.__aud.ctx++; }
    createBufferSource() { const s = super.createBufferSource(); window.__aud.src++; const st = s.start.bind(s), sp = s.stop.bind(s);
      s.start = (...a) => { window.__aud.started++; return st(...a); }; s.stop = (...a) => { window.__aud.stopped++; return sp(...a); }; return s; } }; })();"""
res, errs = [], []
def wait(pg, js, timeout=10):   # polling عبر evaluate (الصفحة تمنع eval بسياسة CSP، ولا نريد تعطيلها في الاختبار)
    t = time.time()
    while time.time() - t < timeout:
        if pg.evaluate(f"() => ({js})"): return
        time.sleep(0.05)
    raise TimeoutError(js[:80])
def check(name, ok, info=''): res.append((name, bool(ok), info)); print(('PASS ' if ok else 'FAIL ') + name, info, flush=True)

srv = subprocess.Popen(['node', 'tools/e2e_harness.mjs'], cwd=ROOT, stdout=subprocess.PIPE, text=True)
assert 'ready' in srv.stdout.readline()
try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        def page(w, h, mobile):
            c = br.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile)
            c.add_init_script(AUD); pg = c.new_page()
            pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append(str(e)))
            return pg
        A, B, C = page(390, 844, True), page(1280, 720, False), page(360, 740, True)
        A.goto(URL); A.fill('input[placeholder="اسمك"]', 'أحمد'); A.screenshot(path=SHOTS / '1_home_mobile.png')
        A.click('button:has-text("إنشاء لعبة")'); A.wait_for_selector('.code'); code = A.inner_text('.code').strip()
        for pg, nm in ((B, 'بسمة'), (C, 'جمال')):
            pg.goto(f'{URL}/?room={code}'); pg.fill('input[placeholder="اسمك"]', nm); pg.click('button:has-text("الانضمام إلى لعبة")'); pg.wait_for_selector('.code')
        wait(A, "document.querySelectorAll('.row').length >= 3"); A.screenshot(path=SHOTS / '2_lobby_mobile.png')
        check('audio NOT started in home/lobby (preload only)', A.evaluate('window.__aud.started') == 0 and B.evaluate('window.__aud.started') == 0)
        A.evaluate("""async () => { const s = JSON.parse(localStorage.getItem('bomb')); await fetch('/api/settings', { method: 'POST', body: JSON.stringify({ ...s, hearts: 3, sec: 4, max: 10 }) }); }""")
        time.sleep(0.6)   # sec=4 غير موجود في قائمة الواجهة (أقل قيمة 5) لذا نضبطه عبر الـAPI فقط للاختبار
        A.click('button:has-text("ابدأ اللعبة")')
        for pg in (A, B, C): pg.wait_for_selector('#arena .pl')
        time.sleep(1.0)
        # ── التخطيط: اللاعب المحلي في الأسفل عند كل عميل، 3 لاعبين بلا خانات فارغة ──
        for nm, pg in (('A', A), ('B', B), ('C', C)):
            r = pg.evaluate("""() => { const pls = [...document.querySelectorAll('.pl')].map(e => ({ r: e.getBoundingClientRect(), me: e.querySelector('.nm').textContent.startsWith('★'), hearts: e.querySelectorAll('.hp .spr').length }));
              const me = pls.find(x => x.me); return { n: pls.length, meBottom: me.r.bottom === Math.max(...pls.map(x => x.r.bottom)), meCx: (me.r.left + me.r.right) / 2, vw: innerWidth, hearts: pls.map(x => x.hearts) }; }""")
            check(f'{nm}: local player at bottom, centered, 3 players, 3 hearts each', r['n'] == 3 and r['meBottom'] and abs(r['meCx'] - r['vw'] / 2) < 3 and r['hearts'] == [3, 3, 3], json.dumps(r))
        wait(A, 'window.__aud.started >= 1', 6); wait(B, 'window.__aud.started >= 1', 6); time.sleep(0.5)
        check('audio started exactly once per client when the game began', A.evaluate('window.__aud.src') == 1 and A.evaluate('window.__aud.started') == 1 and B.evaluate('window.__aud.started') == 1, f"A={A.evaluate('window.__aud')}")
        A.screenshot(path=SHOTS / '3_game_mobile_day.png'); B.screenshot(path=SHOTS / '3b_game_desktop_day.png')
        # ── الإجابات: خاطئة ثم صحيحة (عدة إجابات) ثم مكررة ثم بديل ──
        def say(pg, t):
            pg.fill('#ans', t); pg.click('button:has-text("إرسال الإجابة")'); time.sleep(0.35); return pg.inner_text('#msg')
        m = say(A, 'xyz'); check('wrong answer message, still my turn', 'خاطئة' in m and A.evaluate("!document.querySelector('#ans').disabled"), m)
        m = say(A, 'أ'); check('correct answer accepted, found chip shown, progress 1/3', 'صحيحة' in m and '1/3' in A.inner_text('.cat') and A.inner_text('.found').strip() == 'أ', m)
        wait(B, "!document.querySelector('#ans').disabled")
        m = say(B, ' أ '); check('duplicate not counted (retry allowed)', 'قيلت' in m and B.evaluate("!document.querySelector('#ans').disabled"), m)
        m = say(B, 'BEE'); check('alt spelling + case accepted → progress 2/3 on every client', '2/3' in C.inner_text('.cat') and '2/3' in A.inner_text('.cat'), m)
        # ── الوضع الليلي أثناء اللعب: لا إعادة بناء ولا تغيّر في السؤال/الدور ──
        for pg in (A,): pg.evaluate("window.__tag = document.querySelector('#arena'); window.__q = document.querySelector('.qt').textContent")
        before = A.inner_text('.cat'); A.click('button:has-text("ليل")'); time.sleep(0.9)
        r = A.evaluate("({ th: document.documentElement.dataset.theme, same: window.__tag === document.querySelector('#arena'), q: window.__q === document.querySelector('.qt').textContent, nightOp: getComputedStyle(document.querySelector('.bg.night')).opacity })")
        check('night mode: crossfade done, arena not rebuilt, question unchanged', r['th'] == 'night' and r['same'] and r['q'] and r['nightOp'] == '1' and A.inner_text('.cat') == before, json.dumps(r))
        A.click('button:has-text("الصوت")'); time.sleep(0.3); A.click('button:has-text("الصوت")')
        check('mute toggle / theme toggle did not create duplicate audio', A.evaluate('window.__aud.src') == 1 and A.evaluate('window.__aud.started') == 1, str(A.evaluate('window.__aud')))
        A.screenshot(path=SHOTS / '4_game_mobile_night.png')
        # ── انتهاء وقت جمال (C): الرامي يهاجم ثم قلب واحد فقط ──
        wait(C, "document.querySelector('#ans').placeholder.includes('الرامي')", 15); t0 = time.time()
        snaps = {}
        for label, at in (('reload', 1.4), ('idle', 2.7), ('shoot', 3.9), ('arrow', 4.78)):
            time.sleep(max(0, at - (time.time() - t0)))
            snaps[label] = A.evaluate("({ phase: 'x', arch: [document.querySelector('#arch').style.left, document.querySelector('#arch').style.top, document.querySelector('#arch').style.backgroundPosition], arrow: document.querySelector('#arrow').style.display, ph: document.querySelector('#arch').style.backgroundPosition })")
            A.screenshot(path=SHOTS / f'5_attack_{label}.png')
        check('arrow visible only near the end of attack', snaps['reload']['arrow'] == 'none' and snaps['arrow']['arrow'] != 'none' and snaps['shoot']['arrow'] == 'none', json.dumps({k: v['arrow'] for k, v in snaps.items()}))
        check('archer sprite frames change across phases', len({v['ph'] for v in snaps.values()}) >= 2, json.dumps({k: v['ph'] for k, v in snaps.items()}))
        for pg in (A, B, C): wait(pg, "[...document.querySelectorAll('.pl')].find(e => e.querySelector('.nm').textContent.includes('جمال')).querySelectorAll('.hp .spr').length === 3 && !document.querySelector('#ans').placeholder.includes('الرامي')", 8)
        time.sleep(0.6)
        full = lambda pg: pg.evaluate("[...document.querySelectorAll('.pl')].map(e => [e.querySelector('.nm').textContent.replace('★ ', ''), [...e.querySelectorAll('.hp .spr')].filter(s => s.style.backgroundPosition.startsWith('0px')).length])")
        hs = [full(pg) for pg in (A, B, C)]
        check('exactly one heart lost, identical on every client', hs[0] == hs[1] == hs[2] and dict(hs[0]) == {'أحمد': 3, 'بسمة': 3, 'جمال': 2}, json.dumps(hs[0], ensure_ascii=False))
        check('bomb passed to next player (أحمد) after the hit', A.evaluate("!document.querySelector('#ans').disabled"))
        time.sleep(0.6); A.screenshot(path=SHOTS / '6_after_attack.png')
        # ── إعادة الاتصال بعد تحديث الصفحة (الهاتف) ──
        C.reload(); C.wait_for_selector('#arena .pl'); time.sleep(0.8)
        check('reload/reconnect restores game for the phone', len(C.query_selector_all('.pl')) == 3 and dict(full(C)) == {'أحمد': 3, 'بسمة': 3, 'جمال': 2}, json.dumps(full(C), ensure_ascii=False))
        # ── إكمال السؤال: يتقدم ويُصفَّر التتبع ──
        m = say(A, 'ج'); time.sleep(0.5)
        check('completing all answers advances question (progress resets to 0/3)', '0/3' in B.inner_text('.cat'), B.inner_text('.cat'))
        # ── 6 لاعبين: دائرة واضحة (الهاتف والحاسوب) ──
        H = br.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True); H.add_init_script(AUD); P6 = H.new_page()
        P6.on('pageerror', lambda e: errs.append(str(e)))
        P6.goto(URL); P6.fill('input[placeholder="اسمك"]', 'المضيف'); P6.click('button:has-text("إنشاء لعبة")'); P6.wait_for_selector('.code'); code6 = P6.inner_text('.code').strip()
        P6.evaluate("""async (code) => { for (const n of ['س1','س2','س3','س4','س5']) await fetch('/api/join', { method: 'POST', body: JSON.stringify({ code, name: n }) });
          const s = JSON.parse(localStorage.getItem('bomb')); await fetch('/api/settings', { method: 'POST', body: JSON.stringify({ ...s, hearts: 5, sec: 30, max: 10 }) }); }""", code6)
        wait(P6, "document.querySelectorAll('.row').length >= 6"); P6.click('button:has-text("ابدأ اللعبة")'); P6.wait_for_selector('#arena .pl'); time.sleep(1.0)
        P6.screenshot(path=SHOTS / '7_six_players_mobile.png')
        D = br.new_context(viewport={'width': 1280, 'height': 720}); D.add_init_script(AUD); PD = D.new_page(); PD.goto(f'{URL}/?room={code6}')
        check('no console/page errors in any session', not errs, json.dumps(errs, ensure_ascii=False)[:400])
        br.close()
finally:
    srv.terminate()
bad = [r for r in res if not r[1]]
print(f'\n{len(res) - len(bad)}/{len(res)} browser checks passed'); sys.exit(1 if bad else 0)
