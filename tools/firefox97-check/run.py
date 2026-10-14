import json, os, re, time, traceback
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service

NEW = os.environ.get("NEW_UI", "http://host.docker.internal:8083")
OLD = os.environ.get("OLD_UI", "http://host.docker.internal:8082")
OUT = "/out"
TAG = os.environ.get("TAG", "run")

opts = Options()
opts.add_argument("-headless")
opts.set_preference("devtools.console.stdout.content", True)
opts.set_preference("browser.cache.disk.enable", False)
svc = Service("/usr/local/bin/geckodriver", log_path=f"{OUT}/{TAG}-gecko.log")
d = webdriver.Firefox(options=opts, service=svc)
d.set_window_size(1400, 900)
d.set_page_load_timeout(60)

results = []

def shot(name):
    d.save_screenshot(f"{OUT}/{TAG}-{name}.png")

def state(label, extra=""):
    info = d.execute_script("""
      const root = document.getElementById('root');
      const text = (document.body.innerText || '').trim();
      return {rootChildren: root ? root.children.length : -1, textLen: text.length, head: text.slice(0, 110).replace(/\\n/g, ' | ')};
    """)
    blank = info["textLen"] < 25
    results.append((label, blank, info["head"]))
    print(f"{'BLANK ' if blank else 'ok    '} {label}: {info['head']} {extra}")

def step(label, fn):
    try:
        fn()
    except Exception as e:
        results.append((label, True, "EXC " + str(e)[:100]))
        print("EXC   ", label, str(e).splitlines()[0][:140])

def login(base, user="admin", pw="admin"):
    d.get(base + "/")
    time.sleep(2)
    inputs = d.find_elements(By.CSS_SELECTOR, "input")
    texts = [i for i in inputs if i.get_attribute("type") in ("text", None, "")]
    pws = [i for i in inputs if i.get_attribute("type") == "password"]
    if texts and pws:
        texts[0].send_keys(user)
        pws[0].send_keys(pw)
        btn = [b for b in d.find_elements(By.CSS_SELECTOR, "button") if re.search(r"sign in|log in|login", b.text, re.I)]
        (btn[0] if btn else pws[0]).click() if btn else pws[0].submit()
        time.sleep(3)

print("UA:", d.execute_script("return navigator.userAgent"))

# ------------------------------------------------------------------ NEW UI
step("new: login", lambda: login(NEW))
state("new: after login (home)")
shot("new-home")

for path, name in [("/isbar", "isbar"), ("/live-er", "live-er"), ("/history", "history"),
                   ("/statistics", "statistics"), ("/predictions", "predictions"), ("/settings", "settings")]:
    def go(path=path, name=name):
        d.get(NEW + path); time.sleep(3.5); state(f"new: {path}"); shot(f"new-{name}")
    step(f"new: {path}", go)

# Popups on Live ER (use native <dialog>)
def live_er_popup():
    d.get(NEW + "/live-er"); time.sleep(3)
    cards = d.find_elements(By.CSS_SELECTOR, "[data-testid='placement-card']")
    occ = [c for c in cards if "Occupied" in c.text]
    print("   live-er cards:", len(cards), "occupied:", len(occ))
    occ[0].click(); time.sleep(1.5)
    state("new: Live ER -> click an occupied bed (Manage Bed popup)")
    shot("new-live-er-popup")
step("new: live-er popup", live_er_popup)

def isbar_dialog():
    d.get(NEW + "/isbar"); time.sleep(3)
    btn = [b for b in d.find_elements(By.CSS_SELECTOR, "button") if "Can't find the patient" in b.text]
    btn[0].click(); time.sleep(1.5)
    state("new: ISBAR -> 'Can't find the patient?' (side panel)")
    shot("new-isbar-fallback")
step("new: isbar fallback", isbar_dialog)

# ------------------------------------------------------------------ OLD UI
step("old: login", lambda: login(OLD))
state("old: after login")
shot("old-home")
for sec in ["beds-display", "patients", "patient-history", "statistics", "flow-prediction", "settings"]:
    def go(sec=sec):
        d.execute_script("if (typeof showSection==='function') showSection(arguments[0]);", sec)
        time.sleep(3); state(f"old: section {sec}"); shot(f"old-{sec}")
    step(f"old: {sec}", go)

d.quit()
print("\nSUMMARY")
bad = [r for r in results if r[1]]
print(f"{len(results)-len(bad)} ok, {len(bad)} blank/failed")
for r in bad: print("  FAIL", r[0], "->", r[2])
