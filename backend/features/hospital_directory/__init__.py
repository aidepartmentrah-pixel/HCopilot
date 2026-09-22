# Package marker — exposes this directory as a Python module.
# hospital_directory: integration with the hospital's external patient/doctor/
# worker directory API. client.py is the ONLY module allowed to make HTTP
# calls to that API — see its module docstring. settings_db.py/crypto_utils.py
# handle the encrypted connection settings; api.py exposes the HTTP surface
# (config endpoints + patient search) consumed by the frontend.
