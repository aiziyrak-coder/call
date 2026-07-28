#!/usr/bin/env python3
import json
import urllib.request

req = urllib.request.Request(
    "https://call.devflix.uz/api/v1/auth/login",
    data=json.dumps({"email": "admin@aicc.uz", "password": "Aicc!2026"}).encode(),
    headers={
        "Content-Type": "application/json",
        "Origin": "https://call.devflix.uz",
    },
)
with urllib.request.urlopen(req) as resp:
    body = json.loads(resp.read().decode())
    tokens = body.get("tokens") or {}
    print("status", body.get("status"), "http", resp.status)
    print("has_access", "accessToken" in tokens)
    print("has_refresh", "refreshToken" in tokens)
    print("expiresIn", tokens.get("expiresIn"))
    print("set_cookie", "yes" if resp.headers.get("Set-Cookie") else "no")
