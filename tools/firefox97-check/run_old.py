import os, time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service

OLD = os.environ.get("OLD_UI", "http://host.docker.internal:8082")
OUT = "/out"
opts = Options()
opts.add_argument("-headless")
opts.set_preference("devtools.console.stdout.content", True)
opts.set_preference("browser.cache.disk.enable", False)
d = webdriver.Firefox(options=opts, service=Service("/usr/local/bin/geckodriver", log_path=f"{OUT}/old-gecko.log"))
d.set_window_size(1400, 900)

def shot(n): d.save_screenshot(f"{OUT}/old-{n}.png")
def vis(label):
    t = d.execute_script("return (document.querySelector('.section.active')||document.body).innerText.trim().slice(0,100).replace(/\\n/g,' | ')")
    print("ok   ", label, "::", t)

d.get(OLD + "/"); time.sleep(2)
d.find_element(By.ID, "auth-username").send_keys("admin")
d.find_element(By.ID, "auth-password").send_keys("admin")
d.find_element(By.ID, "auth-login-btn").click(); time.sleep(3)
vis("login -> home"); shot("home")

for sec in ["beds-display", "patients", "patient-history", "statistics", "flow-prediction", "settings", "scheduling", "simulation", "unurgent"]:
    try:
        d.execute_script("showSection(arguments[0])", sec); time.sleep(3)
        vis(f"section {sec}"); shot(sec)
    except Exception as e:
        print("EXC  ", sec, str(e).splitlines()[0][:120])

# interactions
try:
    d.execute_script("showSection('beds-display')"); time.sleep(2.5)
    cards = d.find_elements(By.CSS_SELECTOR, ".bed-card, .erb-card, [class*='bed-card'], [class*='bed-tile']")
    print("   old bed cards found:", len(cards))
    if cards:
        cards[0].click(); time.sleep(1.5); shot("beds-click")
        print("ok    clicked a bed card")
except Exception as e:
    print("EXC   old bed click", str(e).splitlines()[0][:120])
try:
    d.execute_script("showSection('patients')"); time.sleep(2)
    d.execute_script("document.querySelector('#pat-arrival-time + input, input.dt-picker-alt').click()"); time.sleep(1)
    shot("patients-datepicker")
    print("ok    opened a date picker:", d.execute_script("return !!document.querySelector('.flatpickr-calendar.open')"))
except Exception as e:
    print("EXC   old datepicker", str(e).splitlines()[0][:120])
d.quit()
