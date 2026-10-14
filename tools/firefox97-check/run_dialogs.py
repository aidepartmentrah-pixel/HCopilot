import os, re, time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service

NEW = os.environ.get("NEW_UI", "http://host.docker.internal:8083")
TAG = os.environ.get("TAG", "dlg")
OUT = "/out"
opts = Options()
opts.add_argument("-headless")
opts.set_preference("devtools.console.stdout.content", True)
opts.set_preference("browser.cache.disk.enable", False)
d = webdriver.Firefox(options=opts, service=Service("/usr/local/bin/geckodriver", log_path=f"{OUT}/{TAG}-gecko.log"))
d.set_window_size(1400, 900)

results = []
def check(label, ok, detail=""):
    results.append((label, ok))
    print(("PASS " if ok else "FAIL ") + label + (f"  [{detail}]" if detail else ""))

def shot(n): d.save_screenshot(f"{OUT}/{TAG}-{n}.png")
def buttons(): return d.find_elements(By.CSS_SELECTOR, "button")
def click_text(txt, exact=False):
    for b in buttons():
        t = b.text.strip()
        if (t == txt) if exact else (txt.lower() in t.lower()):
            b.click(); return True
    return False
def dialog():
    ds = [x for x in d.find_elements(By.CSS_SELECTOR, "[role='dialog']") if x.is_displayed()]
    return ds[-1] if ds else None
def dlg_text(n=1000):
    x = dialog(); return x.text.replace("\n", " | ")[:n] if x else ""
def boundary(): return "Something went wrong" in d.find_element(By.TAG_NAME, "body").text
def esc():
    d.switch_to.active_element.send_keys(Keys.ESCAPE); time.sleep(0.8)

# login
d.get(NEW + "/"); time.sleep(2)
inp = d.find_elements(By.CSS_SELECTOR, "input")
inp[0].send_keys("admin"); [i for i in inp if i.get_attribute("type") == "password"][0].send_keys("admin")
click_text("Sign in") or click_text("Log in"); time.sleep(3)
print("UA:", d.execute_script("return navigator.userAgent"))

# ---- 1. Live ER: Manage Bed popup + steps + edit popup
d.get(NEW + "/live-er"); time.sleep(3.5)
cards = d.find_elements(By.CSS_SELECTOR, "[data-testid='placement-card']")
occ = [c for c in cards if "Occupied" in c.text]
occ[1].click(); time.sleep(1.2)
check("Live ER: occupied bed opens the Manage Bed popup", dialog() is not None and not boundary(), dlg_text(60))
check("   popup shows Change bed + Discharge buttons", "Change bed" in dlg_text() and "Discharge patient" in dlg_text())
shot("manage")
click_text("Change bed"); time.sleep(0.8)
check("   'Change bed' step opens in place", "Move to another bed" in dlg_text(), dlg_text(60))
click_text("Back"); time.sleep(0.5)
click_text("Discharge patient"); time.sleep(0.8)
check("   'Discharge' step opens in place", "Departure time" in dlg_text(), dlg_text(60))
# date picker inside the popup
alt = [e for e in dialog().find_elements(By.CSS_SELECTOR, "input") if e.get_attribute("id") == "departure-time"]
if alt:
    alt[0].click(); time.sleep(1)
    cal = d.find_elements(By.CSS_SELECTOR, ".flatpickr-calendar.open")
    check("   date picker opens inside the popup", len(cal) == 1)
    shot("discharge-picker")
    esc()
    check("   Escape closes only the calendar, not the popup", dialog() is not None and not d.find_elements(By.CSS_SELECTOR, ".flatpickr-calendar.open"))
esc()
check("   Escape then closes the popup", dialog() is None)

occ[1].click(); time.sleep(1)
click_text("", exact=False) if False else None
pencil = [b for b in buttons() if b.get_attribute("aria-label") == "Edit patient data"]
if pencil:
    pencil[0].click(); time.sleep(2.5)
    check("Live ER: pencil opens the Edit patient popup", "Edit patient data" in dlg_text() and not boundary(), dlg_text()[:60])
    shot("edit")
    check("   it contains the ISBAR form", any("Patient & Arrival" in e.text for e in d.find_elements(By.CSS_SELECTOR, "[role='dialog'] h2, [role='dialog'] span")))
    esc()
    check("   Escape closes it", dialog() is None)

# ---- 2. Assign popup (available bed)
d.get(NEW + "/live-er"); time.sleep(3.5)
cards = d.find_elements(By.CSS_SELECTOR, "[data-testid='placement-card']")
avail = [c for c in cards if "Available" in c.text]
avail[0].click(); time.sleep(1.2)
check("Live ER: available bed opens the Assign popup", "Assign a patient to" in dlg_text() and not boundary(), dlg_text()[:70])
shot("assign")
esc()
check("   Escape closes it", dialog() is None)

# ---- 3. Confirmation popup (delete bed) - opened and cancelled, nothing is deleted
d.get(NEW + "/settings"); time.sleep(3)
for b_ in d.find_elements(By.CSS_SELECTOR, "nav[aria-label='Settings'] button"):
    if "Beds" in b_.text: b_.click(); break
time.sleep(1.5)
dels = [b_ for b_ in buttons() if (b_.get_attribute("aria-label") or "").startswith("Delete Bed")]
if dels:
    dels[0].click(); time.sleep(1)
    check("Settings: Delete Bed opens the confirm popup", "Delete Bed" in dlg_text() and "Cancel" in dlg_text() and not boundary(), dlg_text(80))
    shot("confirm")
    click_text("Cancel", exact=True); time.sleep(0.8)
    check("   Cancel closes it (nothing deleted)", dialog() is None)
    [b_ for b_ in buttons() if (b_.get_attribute('aria-label') or '').startswith('Delete Bed')][0].click(); time.sleep(0.8); esc()
    check("   Escape closes it too", dialog() is None)
else:
    check("Settings: found a Delete Bed button", False)

# ---- 4. Settings dialogs
def settings_add(section, addlabel):
    d.get(NEW + "/settings"); time.sleep(3)
    for b in d.find_elements(By.CSS_SELECTOR, "nav[aria-label='Settings'] button"):
        if section in b.text: b.click(); break
    time.sleep(1.5)
    ok = click_text(addlabel); time.sleep(1.2)
    return ok
if settings_add("Beds", "Add Bed"):
    check("Settings: Add Bed popup opens", dialog() is not None and not boundary(), dlg_text()[:70]); shot("add-bed"); esc()
    check("   Escape closes it", dialog() is None)
else:
    check("Settings: Add Bed button found", False)
if settings_add("Accounts", "Add User"):
    check("Settings: Add User popup opens", dialog() is not None and not boundary(), dlg_text()[:70]); shot("add-user"); esc()
    check("   Escape closes it", dialog() is None)
else:
    check("Settings: Add User button found", False)

d.quit()
bad = [r for r in results if not r[1]]
print(f"\n{len(results)-len(bad)}/{len(results)} checks passed")
for r in bad: print("  FAILED:", r[0])
