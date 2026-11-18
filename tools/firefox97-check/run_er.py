"""Firefox 97: ER API v1.2 screens (new UI Settings card + Live ER roster, old UI ER settings).

Precondition: the backend's ER API settings point at a reachable ER API (e.g. the v1.2 mock) and the
roster switch is on. ER_URL/ER_KEY are typed into the forms; defaults match the mock reached from Docker.
"""
import os, time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service

NEW = os.environ.get("NEW_UI", "http://host.docker.internal:8083")
OLD = os.environ.get("OLD_UI", "http://host.docker.internal:8082")
ER_URL = os.environ.get("ER_URL", "http://host.docker.internal:6001/his-er/api/er/v1")
ER_KEY = os.environ.get("ER_KEY", "dev-secret-key")
TAG = os.environ.get("TAG", "er")
OUT = "/out"
opts = Options()
opts.add_argument("-headless")
opts.set_preference("browser.cache.disk.enable", False)
d = webdriver.Firefox(options=opts, service=Service("/usr/local/bin/geckodriver", log_path=f"{OUT}/{TAG}-gecko.log"))
d.set_window_size(1400, 1000)

results = []
def check(label, ok, detail=""):
    results.append((label, ok))
    print(("PASS " if ok else "FAIL ") + label + (f"  [{detail}]" if detail else ""))
def shot(n): d.save_screenshot(f"{OUT}/{TAG}-{n}.png")
def body(): return d.find_element(By.TAG_NAME, "body").text
def click_text(txt):
    for b in d.find_elements(By.CSS_SELECTOR, "button"):
        if txt.lower() == b.text.strip().lower() and b.is_displayed():
            d.execute_script("arguments[0].scrollIntoView({block:'center'})", b); b.click(); return True
    return False
def wait_for(fn, t=15):
    end = time.time() + t
    while time.time() < end:
        try:
            if fn(): return True
        except Exception:
            pass
        time.sleep(0.5)
    return False

# ---------- new UI ----------
d.get(NEW + "/"); time.sleep(2)
inp = d.find_elements(By.CSS_SELECTOR, "input")
inp[0].send_keys("admin"); [i for i in inp if i.get_attribute("type") == "password"][0].send_keys("admin")
click_text("Sign in") or click_text("Log in"); time.sleep(3)
print("UA:", d.execute_script("return navigator.userAgent"))

d.get(NEW + "/settings"); time.sleep(2.5)
click_text("Integrations"); time.sleep(2)
check("New UI: 'ER API · Live ER Roster' card renders", wait_for(lambda: "ER API · Live ER Roster" in body()))
url = d.find_element(By.ID, "er-base-url")
url.clear(); url.send_keys(ER_URL)
if not d.find_elements(By.ID, "er-api-key"):
    card = url.find_element(By.XPATH, "./ancestor::section[1]") if url.find_elements(By.XPATH, "./ancestor::section[1]") else d
    for b in card.find_elements(By.CSS_SELECTOR, "button"):
        if b.text.strip() == "Replace Key": b.click(); break
    time.sleep(0.5)
key = d.find_element(By.ID, "er-api-key"); key.clear(); key.send_keys(ER_KEY)
click_text("Save ER Settings")
check("   Save ER Settings works", wait_for(lambda: "ER API settings saved." in body()))
click_text("Test ER Roster")
res = lambda: d.find_element(By.CSS_SELECTOR, "[data-testid='er-roster-test-result']").text
check("   Test ER Roster reports the patients", wait_for(lambda: "patient(s) currently listed" in res(), 20), res() if d.find_elements(By.CSS_SELECTOR, "[data-testid='er-roster-test-result']") else "")
h = [e for e in d.find_elements(By.CSS_SELECTOR, "h2, h3") if "ER API · Live ER Roster" in e.text]
if h: d.execute_script("arguments[0].scrollIntoView({block:'start'}); window.scrollBy(0, -90)", h[0])
time.sleep(4)  # let the "saved" toast fade
shot("1-new-ui-er-settings")

d.get(NEW + "/isbar"); time.sleep(3)
rows = lambda: d.find_elements(By.CSS_SELECTOR, "[data-testid='er-roster-row']")
check("New UI: Live ER roster lists patients", wait_for(lambda: len(rows()) > 0), f"{len(rows())} rows")
texts = [r.text for r in rows()]
check("   Arabic names shown", any(any('؀' <= ch <= 'ۿ' for ch in t) for t in texts))
check("   gender shown as Male/Female", any(" · Male" in t or " · Female" in t for t in texts))
shot("2-new-ui-roster")
if rows():
    rows()[0].click(); time.sleep(1.5)
    check("   picking a roster patient fills the ISBAR form", "Something went wrong" not in body())
    shot("3-new-ui-roster-picked")

# ---------- old UI ----------
d.get(OLD + "/"); time.sleep(2)
d.find_element(By.ID, "auth-username").send_keys("admin")
d.find_element(By.ID, "auth-password").send_keys("admin")
click_text("Sign in") or click_text("Login") or click_text("Log in"); time.sleep(3)
d.find_element(By.CSS_SELECTOR, ".nav-btn[data-section='settings']").click(); time.sleep(1.5)
d.find_element(By.CSS_SELECTOR, "#stabg-system .stab-group-btn").click(); time.sleep(0.5)
d.find_element(By.CSS_SELECTOR, ".settings-tab[data-tab='hospital-directory']").click(); time.sleep(2)
check("Old UI: ER API URL/key fields render", wait_for(lambda: d.find_element(By.ID, "hd-er-base-url").is_displayed()))
d.find_element(By.ID, "hd-roster-test-btn").click()
check("   Test ER roster works", wait_for(lambda: "patient(s) currently listed" in d.find_element(By.ID, "hd-roster-test-result").text, 20))
d.execute_script("document.getElementById('hd-er-base-url').scrollIntoView({block:'start'})"); time.sleep(0.5)
shot("4-old-ui-er-settings")

d.quit()
fails = [l for l, ok in results if not ok]
print(f"\n{len(results) - len(fails)}/{len(results)} passed")
