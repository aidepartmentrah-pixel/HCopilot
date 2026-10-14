import json, os, sys, time
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service

NEW = os.environ.get("NEW_UI", "http://host.docker.internal:8083")
OLD = os.environ.get("OLD_UI", "http://host.docker.internal:8082")
OUT = "/out"

opts = Options()
opts.add_argument("-headless")
opts.set_preference("devtools.console.stdout.content", True)   # page console errors -> geckodriver stdout log
opts.set_preference("browser.cache.disk.enable", False)
svc = Service("/usr/local/bin/geckodriver", log_path=f"{OUT}/gecko.log")
d = webdriver.Firefox(options=opts, service=svc)
d.set_window_size(1400, 900)
d.set_page_load_timeout(60)

print("UA:", d.execute_script("return navigator.userAgent"))

PROBE = r"""
const out = {};
const t = (name, fn) => { try { out[name] = !!fn(); } catch (e) { out[name] = false; } };
// JS APIs
t('HTMLDialogElement + showModal', () => typeof HTMLDialogElement !== 'undefined' && typeof HTMLDialogElement.prototype.showModal === 'function');
t('structuredClone', () => typeof structuredClone === 'function');
t('Array.prototype.at', () => [].at);
t('Object.hasOwn', () => Object.hasOwn);
t('String.replaceAll', () => ''.replaceAll);
t('Array.findLast', () => [].findLast);
t('Array.toSorted', () => [].toSorted);
t('Object.groupBy', () => Object.groupBy);
t('Promise.withResolvers', () => Promise.withResolvers);
t('Array.fromAsync', () => Array.fromAsync);
t('crypto.randomUUID', () => crypto.randomUUID);
t('AbortSignal.timeout', () => AbortSignal.timeout);
t('ResizeObserver', () => typeof ResizeObserver === 'function');
t('Intl.DateTimeFormat', () => typeof Intl.DateTimeFormat === 'function');
t('navigator.clipboard (secure ctx only)', () => navigator.clipboard);
// CSS
const c = (name, decl) => { try { out['CSS ' + name] = CSS.supports(decl); } catch (e) { out['CSS ' + name] = false; } };
c('inset', 'inset: 0');
c('aspect-ratio', 'aspect-ratio: 1');
c('gap (flex)', 'gap: 4px');
c('scrollbar-width', 'scrollbar-width: thin');
c('color-mix()', 'color: color-mix(in srgb, red, blue)');
c('dvh units', 'height: 100dvh');
c('text-wrap: balance', 'text-wrap: balance');
c('selector(:has())', 'selector(:has(a))');
c('selector(:focus-visible)', 'selector(:focus-visible)');
c('selector(:is())', 'selector(:is(a))');
c('rgb(r g b / a)', 'color: rgb(1 2 3 / 0.5)');
c('font-variant-numeric', 'font-variant-numeric: tabular-nums');
c('overflow-wrap: anywhere', 'overflow-wrap: anywhere');
c('@layer', 'selector(a)');
try { const s = new CSSStyleSheet(); s.replaceSync('@layer a { b { color: red } }'); out['CSS @layer'] = s.cssRules.length === 1; } catch (e) { out['CSS @layer'] = false; }
try { const s = new CSSStyleSheet(); s.replaceSync('a { b { color: red } }'); out['CSS nesting'] = s.cssRules[0] && s.cssRules[0].cssRules && s.cssRules[0].cssRules.length === 1; } catch (e) { out['CSS nesting'] = false; }
return out;
"""

d.get(NEW + "/")
probe = d.execute_script(PROBE)
print("PROBE", json.dumps(probe, indent=1))
d.quit()
