#!/usr/bin/env python3
"""Hourly context layer: funding, OI, macro, dominance, fear&greed -> data/context.json. Public data only."""
import json, urllib.request, time, datetime
UA={"User-Agent":"Mozilla/5.0"}
def get(u):
    try:
        return json.load(urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=15))
    except Exception as e:
        return {"_err":str(e)}
def ema(v,n):
    k=2/(n+1); e=v[0]
    for x in v[1:]: e=x*k+e*(1-k)
    return e
out={"updated":datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),"coins":{},"macro":{}}
for c in ["BTC","ETH","XRP"]:
    f=get(f"https://www.okx.com/api/v5/public/funding-rate?instId={c}-USDT-SWAP")
    o=get(f"https://www.okx.com/api/v5/public/open-interest?instType=SWAP&instId={c}-USDT-SWAP")
    d={"src":"OKX perp"}
    try: d["funding"]=float(f["data"][0]["fundingRate"])
    except Exception: pass
    try: d["oi_usd"]=float(o["data"][0]["oiUsd"])
    except Exception: pass
    out["coins"][c]=d
g=get("https://api.gateio.ws/api/v4/futures/usdt/contracts/KAS_USDT")
k={"src":"Gate.io perp"}
try:
    k["funding"]=float(g["funding_rate"]); k["oi_usd"]=float(g.get("position_size",0))*float(g.get("quanto_multiplier",1))*float(g["mark_price"])
except Exception: pass
out["coins"]["KAS"]=k
for key,sym in [("dxy","DX-Y.NYB"),("spx","^GSPC"),("ndx","^IXIC")]:
    r=get(f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.request.quote(sym)}?range=1y&interval=1d")
    try:
        cl=[x for x in r["chart"]["result"][0]["indicators"]["quote"][0]["close"] if x]
        last=cl[-1]; e50=ema(cl[-150:],50); e200=ema(cl,200)
        out["macro"][key]={"last":round(last,2),"chg5d":round((last/cl[-6]-1)*100,2),"ema50":round(e50,2),"ema200":round(e200,2),
            "trend":"up" if last>e50>e200 else "down" if last<e50<e200 else "mixed"}
    except Exception: out["macro"][key]={"err":"unavailable"}
gl=get("https://api.coingecko.com/api/v3/global")
try: out["macro"]["btc_dom"]=round(gl["data"]["market_cap_percentage"]["btc"],2); out["macro"]["mcap_chg24h"]=round(gl["data"]["market_cap_change_percentage_24h_usd"],2)
except Exception: pass
fg=get("https://api.alternative.me/fng/?limit=1")
try: out["macro"]["fng"]={"value":int(fg["data"][0]["value"]),"label":fg["data"][0]["value_classification"]}
except Exception: pass
m=out["macro"]; s=0
for key,w in [("spx",1),("ndx",1)]:
    t=m.get(key,{}).get("trend"); s+= w if t=="up" else -w if t=="down" else 0
t=m.get("dxy",{}).get("trend"); s+= -1 if t=="up" else 1 if t=="down" else 0
m["risk_score"]=s; m["regime"]="RISK-ON" if s>=2 else "RISK-OFF" if s<=-2 else "NEUTRAL"
json.dump(out,open(__import__("os").path.join(__import__("os").path.dirname(__file__) or ".","data/context.json"),"w"),indent=1)
print(json.dumps(out)[:600])
