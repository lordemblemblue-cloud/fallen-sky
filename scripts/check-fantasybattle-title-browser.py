"""Chromium smoke check of production title CSS and a source-derived scene fixture.
Does not load the React route, external art, saves, or renderer; live QA remains separate.
"""
from pathlib import Path
from html import escape
import re
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
folder = root / "src/components/fantasybattle"
base = (folder / "sapphireAdventure.css").read_text()
mist = (folder / "titleMist.css").read_text()
source = (folder / "SapphireAdventure.jsx").read_text()
asset = (root / "public/fantasybattle/sapphire/effects/title-ink-mist.svg").read_text()
scene = source.split('className="fa-title-scene" data-quality={settings.quality}>', 1)[1].split("\n        </div>}", 1)[0]
scene = re.sub(r'<div className="([^"]+)"/>', r'<div class="\1"></div>', scene)
scene = scene.replace('className=', 'class=').replace('<i/>', '<i></i>')
scene = scene.replace('{[0,1,2,3,4,5].map(n=><i key={n}/>)}', '<i></i>' * 6)
assert "{" not in scene and "className" not in scene
mist = mist.replace("/fantasybattle/sapphire/effects/title-ink-mist.svg", "data:image/svg+xml;base64," + __import__("base64").b64encode(asset.encode()).decode())

def fixture(quality, reduced=False):
    menu = "".join(f'<button class="fa-button fa-painted-button fa-menu-{name}" {"disabled" if name in ("continue", "load") else ""}>{name}</button>' for name in ("start", "continue", "load", "settings", "exit"))
    return (f'<html><head><style>{base}\n{mist}</style></head><body>'
            f'<main class="fa-root{" reduced-motion" if reduced else ""}"><div class="fa-ui page" data-screen="01" data-staged-original="true">'
            '<div class="fa-template" aria-hidden="true" style="background-color:#233c62">'
            f'<div class="fa-title-scene" data-quality="{escape(quality)}">{scene}</div></div>'
            f'<div class="fa-original-menu">{menu}</div></div></main></body></html>')

with sync_playwright() as pw:
    browser = pw.chromium.launch()
    for width, height in [(1920, 1080), (1680, 858), (1280, 720), (900, 600)]:
        page = browser.new_page(viewport={"width": width, "height": height})
        page.set_content(fixture("high"))
        result = page.evaluate("""() => {
          const q = s => document.querySelector(s);
          const art = q('.fa-template').getBoundingClientRect();
          const scene = q('.fa-title-scene').getBoundingClientRect();
          const start = q('.fa-menu-start');
          const r = start.getBoundingClientRect();
          const bands = [...document.querySelectorAll('.fa-scene-mist')];
          const animation = getComputedStyle(bands[0], '::before').animationName;
          return {same: ['x','y','width','height'].every(k=>Math.abs(art[k]-scene[k])<1),
            input: document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===start,
            count: bands.length, animation,
            pointer: getComputedStyle(q('.fa-title-scene')).pointerEvents,
            clipped: bands.every(b=>getComputedStyle(b).overflow==='hidden')};
        }""")
        assert result == dict(same=True, input=True, count=4, animation="fa-title-mist-wave", pointer="none", clipped=True), result
        page.evaluate("document.querySelector('.fa-menu-start').addEventListener('click',()=>document.body.dataset.clicked='yes')")
        page.locator(".fa-menu-start").click()
        assert page.locator("body").get_attribute("data-clicked") == "yes"
        page.close()
        print(f"PASS art alignment and menu hit testing {width}x{height}")

    page = browser.new_page(viewport={"width": 1280, "height": 720})
    for quality, petals, breeze, light in [("performance", 2, "none", "none"), ("balanced", 4, "none", "fa-kingdom-luminance"), ("high", 6, "block", "fa-kingdom-luminance"), ("cinematic", 6, "block", "fa-kingdom-luminance")]:
        page.set_content(fixture(quality))
        state = page.evaluate("""() => ({
          petals:[...document.querySelectorAll('.fa-scene-petals i')].filter(x=>getComputedStyle(x).display!=='none').length,
          breeze:getComputedStyle(document.querySelector('.fa-scene-foreground-breeze')).display,
          light:getComputedStyle(document.querySelector('.fa-scene-kingdom-light')).animationName
        })""")
        assert state == dict(petals=petals,breeze=breeze,light=light), state
        print("PASS graphics tier", quality)
    page.set_content(fixture("high"))
    page.emulate_media(reduced_motion="reduce")
    assert page.locator(".fa-title-scene").evaluate("(x)=>getComputedStyle(x).display") == "none"
    page.emulate_media(reduced_motion="no-preference")
    page.set_content(fixture("high", True))
    assert page.locator(".fa-title-scene").evaluate("(x)=>getComputedStyle(x).display") == "none"
    page.close()
    browser.close()
    print("PASS both reduced-motion modes")
