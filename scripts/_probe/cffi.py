from curl_cffi import requests
for imp in ["chrome124", "chrome120", "safari17_0"]:
    try:
        r = requests.get("https://www.forebet.com/en/football-tips-and-predictions-for-today", impersonate=imp, timeout=40)
        print(f"CURL_CFFI {imp} status={r.status_code} rows={r.text.count('rcnt tr_')}")
    except Exception as e:
        print(f"CURL_CFFI {imp} ERR {e}")
