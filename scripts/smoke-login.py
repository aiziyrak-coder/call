#!/usr/bin/env python3
import json
import urllib.request

req = urllib.request.Request(
    "https://call.devflix.uz/api/v1/auth/login",
    data=json.dumps({"email": "admin@aicc.uz", "password": "Aicc!2026"}).encode(),
    headers={"content-type": "application/json"},
    method="POST",
)
with urllib.request.urlopen(req) as response:
    data = json.load(response)
print(data.get("status"), data.get("user", {}).get("email"), "has_token=" + str(bool(data.get("tokens"))))
