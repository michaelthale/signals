"use strict";
const COINS=["BTC","ETH","KAS","XRP"], TFS={"1h":3600,"4h":14400,"1d":86400}, HTF={"1h":"4h","4h":"1d","1d":"1d"};
const C={g:"#39ff88",r:"#ff3b5c",c:"#22e6ff",p:"#b45cff",y:"#ffd447",m:"#6f80aa",t:"#d8e6ff"};
let state={coin:"BTC",tf:"4h"}, LY={ema:false,bb:false,vw:false,vp:false,sr:false,pdw:false,hist:false}, cache={}, ctx=null, an={};
const $=s=>document.querySelector(s);
const fmt=(v)=>v==null||isNaN(v)?"–":v>=1000?v.toLocaleString(undefined,{maximumFractionDigits:0}):v>=10?v.toFixed(2):v>=1?v.toFixed(3):v.toFixed(5);

// ---------- DATA ----------
async function j(u){const r=await fetch(u,{cache:"no-store"});if(!r.ok)throw new Error(r.status);return r.json();}
async function candles(coin,tf){
  if(coin==="KAS"){
    const d=await j(`https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=KAS_USDT&interval=${tf}&limit=999`);
    return {src:"Gate.io KAS/USDT",k:d.map(x=>({time:+x[0],open:+x[5],high:+x[3],low:+x[4],close:+x[2],volume:+x[6]}))};
  }
  try{
    const d=await j(`https://data-api.binance.vision/api/v3/klines?symbol=${coin}USDT&interval=${tf}&limit=1000`);
    return {src:`Binance ${coin}/USDT`,k:d.map(x=>({time:x[0]/1000,open:+x[1],high:+x[2],low:+x[3],close:+x[4],volume:+x[5]}))};
  }catch(e){
    const g={"1h":3600,"4h":21600,"1d":86400}[tf];
    const d=await j(`https://api.exchange.coinbase.com/products/${coin}-USD/candles?granularity=${g}`);
    return {src:`Coinbase ${coin}-USD${tf==="4h"?" (6H fallback)":""}`,k:d.reverse().map(x=>({time:x[0],low:x[1],high:x[2],open:x[3],close:x[4],volume:x[5]}))};
  }
}
async function get(coin,tf,force){const key=coin+tf;if(!force&&cache[key]&&Date.now()-cache[key].at<60000)return cache[key];const d=await candles(coin,tf);d.at=Date.now();cache[key]=d;return d;}

// ---------- INDICATORS ----------
function ema(v,n){const o=[];const k=2/(n+1);let e;v.forEach((x,i)=>{e=i?x*k+e*(1-k):x;o.push(i>=n-1?e:null)});return o;}
function sma(v,n){const o=[];let s=0;v.forEach((x,i)=>{s+=x;if(i>=n)s-=v[i-n];o.push(i>=n-1?s/n:null)});return o;}
function rsi(c,n=14){const o=[null];let ag=0,al=0;for(let i=1;i<c.length;i++){const d=c[i]-c[i-1],g=Math.max(d,0),l=Math.max(-d,0);if(i<=n){ag+=g/n;al+=l/n;o.push(i===n?100-100/(1+ag/(al||1e-9)):null)}else{ag=(ag*(n-1)+g)/n;al=(al*(n-1)+l)/n;o.push(100-100/(1+ag/(al||1e-9)))}}return o;}
function atr(k,n=14){const o=[];let a;k.forEach((b,i)=>{const tr=i?Math.max(b.high-b.low,Math.abs(b.high-k[i-1].close),Math.abs(b.low-k[i-1].close)):b.high-b.low;a=i<n?((a||0)*i+tr)/(i+1):(a*(n-1)+tr)/n;o.push(a)});return o;}
function macd(c){const f=ema(c,12),s=ema(c,26);const m=c.map((_,i)=>f[i]!=null&&s[i]!=null?f[i]-s[i]:null);const st=m.findIndex(x=>x!=null);const sg=ema(m.slice(st),9);const sig=m.map((_,i)=>i<st?null:sg[i-st]);return {m,sig,h:m.map((x,i)=>x!=null&&sig[i]!=null?x-sig[i]:null)};}
function bb(c,n=20,k=2){const s=sma(c,n);return c.map((_,i)=>{if(s[i]==null)return null;let v=0;for(let j=i-n+1;j<=i;j++)v+=(c[j]-s[i])**2;const sd=Math.sqrt(v/n);return {m:s[i],u:s[i]+k*sd,l:s[i]-k*sd}});}
function vwap(k,tf){const o=[];let pv=0,vv=0,key=null;k.forEach((b,i)=>{const d=new Date(b.time*1000);const kk=tf==="1d"?Math.floor(i/30):tf==="4h"?d.getUTCFullYear()*100+weekNo(d):d.toISOString().slice(0,10);if(kk!==key){pv=0;vv=0;key=kk}const tp=(b.high+b.low+b.close)/3;pv+=tp*b.volume;vv+=b.volume;o.push(vv?pv/vv:tp)});return o;}
function weekNo(d){const t=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));return Math.floor((t-Date.UTC(t.getUTCFullYear(),0,1))/6048e5);}
// confirmed pivots: pivot at j is known at j+L
function pivots(k,L=5){const P=[];for(let j=L;j<k.length-L;j++){let hi=true,lo=true;for(let x=j-L;x<=j+L;x++){if(k[x].high>k[j].high)hi=false;if(k[x].low<k[j].low)lo=false}if(hi)P.push({j,known:j+L,p:k[j].high,t:"R"});if(lo)P.push({j,known:j+L,p:k[j].low,t:"S"})}return P;}
function levelsAt(P,i,a,price){// cluster pivots known by bar i
  const pts=P.filter(x=>x.known<=i&&x.j>=i-300).map(x=>x.p).sort((x,y)=>x-y);const cl=[];
  pts.forEach(p=>{const l=cl[cl.length-1];if(l&&p-l.hi<=0.6*a){l.hi=Math.max(l.hi,p);l.n++;l.sum+=p}else cl.push({lo:p,hi:p,n:1,sum:p})});
  cl.forEach(l=>l.p=l.sum/l.n);return {sup:cl.filter(l=>l.p<price).sort((x,y)=>y.p-x.p),res:cl.filter(l=>l.p>=price).sort((x,y)=>x.p-y.p)};}
function vprofile(k,from,to,bins=40){const s=k.slice(Math.max(0,from),to+1);const lo=Math.min(...s.map(b=>b.low)),hi=Math.max(...s.map(b=>b.high));const w=(hi-lo)/bins||1;const v=new Array(bins).fill(0);
  s.forEach(b=>{const a=Math.floor((b.low-lo)/w),z=Math.min(bins-1,Math.floor((b.high-lo)/w));for(let x=a;x<=z;x++)v[x]+=b.volume/(z-a+1)});
  const mx=Math.max(...v);const order=v.map((x,i)=>i).sort((a,b)=>v[b]-v[a]);const hvn=[];order.forEach(i=>{if(hvn.length<4&&!hvn.some(h=>Math.abs(h-i)<3))hvn.push(i)});
  return {lo,w,v,mx,hvn:hvn.map(i=>({lo:lo+i*w,hi:lo+(i+1)*w,p:lo+(i+.5)*w})),poc:lo+(order[0]+.5)*w};}
function prevHL(k,tf){// prior day / week H/L from these candles
  const last=k[k.length-1].time,day=86400,dS=Math.floor(last/day)*day,wS=dS-((new Date(dS*1000).getUTCDay()+6)%7)*day;
  const rng=(a,b)=>{const s=k.filter(x=>x.time>=a&&x.time<b);return s.length?{h:Math.max(...s.map(x=>x.high)),l:Math.min(...s.map(x=>x.low))}:null};
  return {pd:tf==="1d"?(k.length>1?{h:k[k.length-2].high,l:k[k.length-2].low}:null):rng(dS-day,dS),pw:rng(wS-7*day,wS)};}

// ---------- SIGNAL ENGINE ----------
function analyze(k,hk,tf,coin){
  const c=k.map(b=>b.close),v=k.map(b=>b.volume),n=k.length;
  const e20=ema(c,20),e50=ema(c,50),e200=ema(c,200),R=rsi(c),M=macd(c),B=bb(c),A=atr(k),VW=vwap(k,tf),vs=sma(v,20),P=pivots(k);
  // HTF trend: last closed HTF bar before each bar
  const hc=hk.map(b=>b.close),h50=ema(hc,50),h200=ema(hc,Math.min(200,Math.max(20,hc.length-5))),hd=TFS[HTF[tf]];
  let hi=0;const htr=k.map(b=>{while(hi+1<hk.length&&hk[hi+1].time+hd<=b.time+TFS[tf])hi++;const ok=hk[hi].time+hd<=b.time+TFS[tf];if(!ok||h50[hi]==null)return 0;return hc[hi]>h50[hi]&&(h200[hi]==null||h50[hi]>h200[hi])?1:hc[hi]<h50[hi]&&(h200[hi]==null||h50[hi]<h200[hi])?-1:0});
  const fund=ctx?.coins?.[coin]?.funding, reg=ctx?.macro?.regime;
  function score(i,live){
    const a=A[i],p=c[i],r=[];let s=0;if(i<60)return {s:0,r:["warming up"]};
    let t=0;if(p>e50[i])t+=7;if(e50[i]&&e200[i]&&e50[i]>e200[i])t+=8;if(htr[i]===1)t+=10;else if(htr[i]===-1)t-=5;s+=Math.max(0,t);r.push(`Trend ${Math.max(0,t)}/25: ${p>e50[i]?"above":"below"} EMA50, EMA50 ${e50[i]>e200[i]?">":"<"} EMA200, ${HTF[tf].toUpperCase()} trend ${htr[i]===1?"up":htr[i]===-1?"down":"mixed"}`);
    let mo=0;const rs=R[i];if(rs>35&&rs<58&&rs>R[i-1])mo+=10;else if(rs<=35)mo+=6;if(M.h[i]>M.h[i-1])mo+=5;if(M.h[i]>0&&M.h[i-1]<=0)mo+=5;mo=Math.min(20,mo);s+=mo;r.push(`Momentum ${mo}/20: RSI ${rs.toFixed(0)}${rs>R[i-1]?"↑":"↓"}, MACD hist ${M.h[i]>M.h[i-1]?"rising":"falling"}`);
    const L=levelsAt(P,i,a,p),sup=L.sup[0];const vp=vprofile(k,i-200,i);const hv=vp.hvn.filter(h=>h.p<p).sort((x,y)=>y.p-x.p)[0];
    const cands=[sup&&{p:sup.p,n:"swing support"},B[i]&&{p:B[i].l,n:"lower Bollinger"},hv&&{p:hv.p,n:"high-volume node"},VW[i]<p&&{p:VW[i],n:"VWAP"}].filter(Boolean);
    let loc=0,near=null;cands.forEach(x=>{const d=(p-x.p)/a;if(d>=-0.3&&d<=1.0){loc=Math.max(loc,d<=0.5?20:12);near=near||x}});s+=loc;r.push(`Location ${loc}/20: ${near?`${near.n} ${fmt(near.p)} (${((p-near.p)/a).toFixed(1)} ATR)`:"not near support"}`);
    let vo=0;const vr=v[i]/(vs[i]||1);if(vr>1.3&&k[i].close>k[i].open)vo=15;else if(vr>1.0&&k[i].close>k[i].open)vo=9;else if(vr<0.8)vo=4;s+=vo;r.push(`Volume ${vo}/15: ${vr.toFixed(2)}× 20-bar avg${k[i].close>k[i].open?" on green bar":""}`);
    let fu=5;if(live&&fund!=null){fu=Math.abs(fund)<0.0003?10:fund>0.0006?0:5;}s+=fu;r.push(`Funding ${fu}/10: ${live&&fund!=null?(fund*100).toFixed(4)+"%/8h":"n/a (history scored neutral)"}`);
    let ma=5;if(live&&reg){ma=reg==="RISK-ON"?10:reg==="RISK-OFF"?0:5}s+=ma;r.push(`Macro ${ma}/10: ${live&&reg?reg:"n/a (history scored neutral)"}`);
    return {s,r,near,L,vp};
  }
  // historical markers + backtest
  const mk=[],buys=[];let lastBuy=-99,inTrade=null;
  for(let i=60;i<n;i++){
    const a=A[i],p=c[i];
    const trig=k[i].close>k[i].open&&(k[i].close>k[i-1].high||(R[i]>40&&R[i-1]<=40)||(M.h[i]>0&&M.h[i-1]<=0));
    if(i-lastBuy>=8&&trig){const sc=score(i,false);if(sc.s>=62&&sc.near){
      const lows=Math.min(...k.slice(i-5,i+1).map(b=>b.low));const stop=Math.min(lows,sc.near.p)-0.25*a;const risk=p-stop;if(risk>0&&risk<4*a){
        const res=sc.L.res[0];const tp=p+2*risk;buys.push({i,entry:p,stop,tp,score:sc.s});
        mk.push({time:k[i].time,position:"belowBar",color:C.g,shape:"arrowUp",text:"BUY "+sc.s,_tip:`<b style="color:${C.g}">BUY · score ${sc.s}/100</b><br>${sc.r.join("<br>")}<br>Entry ${fmt(p)} · stop ${fmt(stop)} · 2R ${fmt(tp)}`});lastBuy=i;inTrade={i,res:res?res.p:tp,tp};}}}
    // take-profit marker: after a buy, price tags resistance/upper band/2R with stretched RSI or rejection
    if(inTrade&&i>inTrade.i){const ub=B[i]?.u,wick=(k[i].high-Math.max(k[i].open,k[i].close))>0.5*(k[i].high-k[i].low);
      const hitT=k[i].high>=inTrade.tp, hitR=k[i].high>=inTrade.res-0.2*a, hitB=ub&&k[i].high>=ub;
      if(hitT||((hitR||hitB)&&(R[i]>65||wick))){mk.push({time:k[i].time,position:"aboveBar",color:"#ff8a3d",shape:"arrowDown",text:"TP",_tip:`<b style="color:#ff8a3d">TAKE PROFIT</b><br>${hitT?"2R target reached":hitR?"tagged swing resistance "+fmt(inTrade.res):"tagged upper Bollinger"}${R[i]>65?", RSI "+R[i].toFixed(0):""}${wick?", upper-wick rejection":""}`});inTrade=null;}
      else if(i-inTrade.i>60)inTrade=null;}
  }
  // backtest
  let W=0,Lo=0,O=0;buys.forEach(b=>{let res=null;for(let x=b.i+1;x<Math.min(n,b.i+61);x++){const hs=k[x].low<=b.stop,ht=k[x].high>=b.tp;if(hs){res="L";break}if(ht){res="W";break}}if(!res){if(b.i+60<n)res=c[Math.min(n-1,b.i+60)]>b.entry?"T+":"T-";else res="O"}b.res=res;if(res==="W")W++;else if(res==="L")Lo++;else O++;});
  const closed=W+Lo, net=W*2-Lo;
  // current setup
  const i=n-1,a=A[i],p=c[i],cur=score(i,true);const L=cur.L,vp=cur.vp,pdw=prevHL(k,tf);
  const supCands=[L.sup[0]?.p,vp.hvn.filter(h=>h.p<p).sort((x,y)=>y.p-x.p)[0]?.p,B[i]?.l,pdw.pd?.l<p?pdw.pd.l:null].filter(x=>x&&x<p&&p-x<6*a);
  const zMid=supCands.length?Math.max(...supCands):p-a;const ez={lo:zMid-0.25*a,hi:zMid+0.35*a};
  const below=L.sup.find(s=>s.p<ez.lo-0.2*a);const stop=Math.min(ez.lo-0.6*a,below?below.p-0.25*a:ez.lo-0.6*a);const eMid=(ez.lo+ez.hi)/2,risk=eMid-stop;
  const resL=[...L.res.map(r=>r.p),pdw.pd?.h,pdw.pw?.h,...vp.hvn.filter(h=>h.p>p).map(h=>h.p)].filter(x=>x&&x>eMid+2*risk).sort((x,y)=>x-y);
  const tp1=Math.max(eMid+2*risk,resL[0]?Math.min(resL[0],eMid+2.5*risk):0)||eMid+2*risk;const tp2=Math.max(resL[1]||resL[0]||0,eMid+3*risk);
  const bias=cur.s>=65&&htr[i]>=0?"LONG SETUP":cur.s>=50?"WATCH":htr[i]===-1&&p<e50[i]?"AVOID / BEARISH":"NEUTRAL";
  return {k,c,e20,e50,e200,R,M,B,VW,A,mk,buys,bt:{W,Lo,O,n:buys.length,hit:closed?W/closed:null,net,avg:closed?net/closed:null},cur,ez,stop,tp1,tp2,eMid,risk,bias,vp,L,pdw,price:p,htr:htr[i]};
}

// ---------- CHARTS ----------
const LW=LightweightCharts,base={layout:{background:{type:"solid",color:"transparent"},textColor:C.m,fontFamily:"JetBrains Mono, monospace"},grid:{vertLines:{color:"#1a234255"},horzLines:{color:"#1a234255"}},rightPriceScale:{borderColor:"#1b2a55"},timeScale:{borderColor:"#1b2a55",timeVisible:true},crosshair:{mode:0}};
const mainEl=$("#main"),ch=LW.createChart(mainEl,{...base,autoSize:true});
const rc=LW.createChart($("#rsi"),{...base,autoSize:true,timeScale:{visible:false}}),mc=LW.createChart($("#macd"),{...base,autoSize:true,timeScale:{visible:false}});
const S={cs:ch.addCandlestickSeries({upColor:C.g,downColor:C.r,wickUpColor:C.g,wickDownColor:C.r,borderVisible:false}),
 vol:ch.addHistogramSeries({priceScaleId:"v",priceFormat:{type:"volume"},lastValueVisible:false,priceLineVisible:false}),
 e20:ch.addLineSeries({color:"#22e6ff66",lineWidth:1,priceLineVisible:false,lastValueVisible:false}),e50:ch.addLineSeries({color:"#b45cffaa",lineWidth:1,priceLineVisible:false,lastValueVisible:false}),e200:ch.addLineSeries({color:"#ffd44777",lineWidth:1,priceLineVisible:false,lastValueVisible:false}),
 vw:ch.addLineSeries({color:"#ffffffaa",lineWidth:1,lineStyle:2,priceLineVisible:false,lastValueVisible:false}),
 bu:ch.addLineSeries({color:"#22e6ff44",lineWidth:1,priceLineVisible:false,lastValueVisible:false}),bl:ch.addLineSeries({color:"#22e6ff44",lineWidth:1,priceLineVisible:false,lastValueVisible:false}),
 rsi:rc.addLineSeries({color:C.p,lineWidth:2,priceLineVisible:false}),mh:mc.addHistogramSeries({priceLineVisible:false,lastValueVisible:false}),mm:mc.addLineSeries({color:C.c,lineWidth:1,priceLineVisible:false,lastValueVisible:false}),ms:mc.addLineSeries({color:"#ff8a3d",lineWidth:1,priceLineVisible:false,lastValueVisible:false})};
ch.priceScale("v").applyOptions({scaleMargins:{top:.82,bottom:0}});
[70,30].forEach(x=>S.rsi.createPriceLine({price:x,color:"#6f80aa88",lineStyle:2,lineWidth:1,axisLabelVisible:false}));
let syncing=false;[ch,rc,mc].forEach(a=>a.timeScale().subscribeVisibleLogicalRangeChange(r=>{if(syncing||!r)return;syncing=true;[ch,rc,mc].forEach(b=>b!==a&&b.timeScale().setVisibleLogicalRange(r));syncing=false;drawOv()}));
let plines=[];
function ln(arr,k){return arr.map((v,i)=>v==null?{time:k[i].time}:{time:k[i].time,value:v});}
function render(){
  const R=an[state.coin+state.tf];if(!R)return;const k=R.k,pf=R.price<1?{type:"price",precision:5,minMove:1e-5}:R.price<10?{type:"price",precision:4,minMove:1e-4}:{type:"price",precision:2,minMove:.01};
  S.cs.applyOptions({priceFormat:pf,autoscaleInfoProvider:orig=>{const r=orig();if(!r||!r.priceRange)return r;r.priceRange.minValue=Math.min(r.priceRange.minValue,R.stop);r.priceRange.maxValue=Math.max(r.priceRange.maxValue,R.tp2);return r;}});S.cs.setData(k.map(({time,open,high,low,close})=>({time,open,high,low,close})));
  S.vol.setData(k.map(b=>({time:b.time,value:b.volume,color:b.close>=b.open?"#39ff8855":"#ff3b5c55"})));
  S.e20.setData(ln(R.e20,k));S.e50.setData(ln(R.e50,k));S.e200.setData(ln(R.e200,k));S.vw.setData(ln(R.VW,k));
  S.bu.setData(ln(R.B.map(x=>x&&x.u),k));S.bl.setData(ln(R.B.map(x=>x&&x.l),k));
  S.rsi.setData(ln(R.R,k));S.mh.setData(R.M.h.map((v,i)=>v==null?{time:k[i].time}:{time:k[i].time,value:v,color:v>=0?"#39ff8899":"#ff3b5c99"}));S.mm.setData(ln(R.M.m,k));S.ms.setData(ln(R.M.sig,k));
  S.vw.applyOptions({visible:LY.vw});S.e20.applyOptions({visible:LY.ema});S.e200.applyOptions({visible:LY.ema});S.cs.applyOptions({priceLineWidth:2,priceLineStyle:0,priceLineColor:"#ffffff"});S.bu.applyOptions({visible:LY.bb});S.bl.applyOptions({visible:LY.bb});
  S.cs.setMarkers(LY.hist?R.mk.map(({time,position,color})=>({time,position,color,shape:"circle",size:0.5})):[]);
  plines.forEach(l=>S.cs.removePriceLine(l));plines=[];
  const add=(price,color,title,style=2)=>price&&plines.push(S.cs.createPriceLine({price,color,lineWidth:1,lineStyle:style,title,axisLabelVisible:true}));
  const rr=x=>((x-R.eMid)/R.risk).toFixed(1);
  if(LY.pdw){if(R.pdw.pd){add(R.pdw.pd.h,"#ff8a3d","PDH");add(R.pdw.pd.l,"#22e6ff","PDL")}if(R.pdw.pw){add(R.pdw.pw.h,"#ff8a3d","PWH",1);add(R.pdw.pw.l,"#22e6ff","PWL",1)}}
  if(LY.sr){R.L.sup.slice(0,2).forEach(s=>add(s.p,"#39ff8899","S",0));R.L.res.slice(0,2).forEach(s=>add(s.p,"#ff3b5c99","R",0));}
  add(R.stop,"#ff3b5c","STOP "+fmt(R.stop),0);add(R.tp1,"#ff9a3d","Take profit 1 "+fmt(R.tp1)+" ("+rr(R.tp1)+"R)",0);add(R.tp2,"#ff9a3d","Take profit 2 "+fmt(R.tp2)+" ("+rr(R.tp2)+"R)",0);
  plines.push(S.cs.createPriceLine({price:R.ez.hi,color:"#39ff88",lineWidth:1,lineVisible:false,title:"BUY "+fmt(R.ez.lo)+"–"+fmt(R.ez.hi),axisLabelVisible:true}));
  const N=k.length;ch.timeScale().setVisibleLogicalRange({from:N-(innerWidth<600?90:160),to:N+8});
  $("#legend").innerHTML=`<span style="color:#ffffff">━PRICE</span> <span style="color:${C.p}">EMA50</span> <span style="color:#39ff88">▮BUY</span> <span style="color:#ff3b5c">━STOP</span> <span style="color:#ff9a3d">━Take profit</span> · <span class="k2">${cache[state.coin+state.tf]?.src||""}</span>`;
  sideCards();todo();requestAnimationFrame(drawOv);
}
// overlay: zones + volume profile
const ov=$("#ov");
function drawOv(){
  const R=an[state.coin+state.tf];if(!R)return;const w=mainEl.clientWidth,h=mainEl.clientHeight,dpr=devicePixelRatio||1;ov.width=w*dpr;ov.height=h*dpr;ov.style.width=w+"px";ov.style.height=h+"px";
  const g=ov.getContext("2d");g.scale(dpr,dpr);g.clearRect(0,0,w,h);const y=p=>S.cs.priceToCoordinate(p);const pw=ch.priceScale("right").width(),W=w-pw;
  const band=(lo,hi,fill,stroke,label,x0=0)=>{const a=y(hi),b=y(lo);if(a==null||b==null)return;g.fillStyle=fill;g.fillRect(x0,a,W-x0,b-a);g.strokeStyle=stroke;g.setLineDash([4,4]);g.strokeRect(x0,a,W-x0,b-a);g.setLineDash([]);if(label){g.fillStyle=stroke;g.font="10px JetBrains Mono, monospace";g.fillText(label,x0+6,a+12)}};
  if(LY.vp)R.vp.hvn.forEach(z=>band(z.lo,z.hi,"#b45cff12","#b45cff55","HVN"));
  const x0=Math.max(0,(ch.timeScale().logicalToCoordinate(R.k.length-12)??W*0.7));
  {const a=y(R.ez.hi),b=y(R.ez.lo);if(a!=null&&b!=null){const hh=Math.max(2,b-a);const inZ=R.price>=R.ez.lo&&R.price<=R.ez.hi;g.globalAlpha=inZ?1:0.35;g.fillStyle=inZ?"#39ff8840":"#39ff8818";g.fillRect(x0,a,W-x0,hh);g.strokeStyle="#39ff88";g.lineWidth=1;g.strokeRect(x0+.5,a+.5,W-x0-1,hh-1);
   g.font="bold 11px JetBrains Mono, monospace";const t="BUY ZONE";const tw=g.measureText(t).width;g.fillStyle="#05070fd0";g.fillRect(x0+4,a-16,tw+8,14);g.fillStyle="#39ff88";g.fillText(t,x0+8,a-5);g.globalAlpha=1;}}
  // volume profile histogram on right
  const vp=R.vp;if(LY.vp)vp.v.forEach((v,i)=>{const a=y(vp.lo+(i+1)*vp.w),b=y(vp.lo+i*vp.w);if(a==null||b==null)return;const L=v/vp.mx*W*0.18;g.fillStyle=vp.hvn.some(z=>Math.abs(z.lo-(vp.lo+i*vp.w))<vp.w/2)?"#b45cff66":"#22e6ff22";g.fillRect(W-L,a,L,Math.max(1,b-a-1))});
}
new ResizeObserver(()=>drawOv()).observe(mainEl);
ch.subscribeCrosshairMove(e=>{const tip=$("#tip");const R=an[state.coin+state.tf];if(!e.time||!R||!e.point||!LY.hist){tip.style.display="none";return}
  const ms=R.mk.filter(m=>m.time===e.time);if(!ms.length){tip.style.display="none";return}tip.innerHTML=ms.map(m=>m._tip).join("<hr style='border-color:#1b2a55'>");tip.style.display="block";
  const x=Math.min(e.point.x+16,mainEl.clientWidth-290);tip.style.left=Math.max(4,x)+"px";tip.style.top=(e.point.y+20)+"px";});

// ---------- SIDE CARDS ----------
const col=b=>b.startsWith("LONG")?C.g:b.startsWith("AVOID")?C.r:b==="WATCH"?C.y:C.c;
function sideCards(){
  const R=an[state.coin+state.tf];const s=R.cur.s,cc=col(R.bias);
  $("#setup").innerHTML=`<h3><span style="color:${C.c}">${state.coin} · ${state.tf.toUpperCase()}</span><span>${fmt(R.price)}</span></h3>
  <div style="display:flex;gap:12px;align-items:center"><div class="ring" style="background:conic-gradient(${cc} ${s*3.6}deg,#1a2342 0);box-shadow:0 0 16px ${cc}66"><div style="background:#08101f;width:50px;height:50px;border-radius:50%;display:grid;place-items:center;color:${cc}">${s}</div></div>
  <div><div class="bias" style="color:${cc};text-shadow:0 0 8px ${cc}">${R.bias}</div><div class="k2">confluence score /100</div></div></div>
  <div style="margin-top:8px"><div class="row"><span class="k2">Entry zone</span><span class="up">${fmt(R.ez.lo)} – ${fmt(R.ez.hi)}</span></div>
  <div class="row"><span class="k2">Stop</span><span class="dn">${fmt(R.stop)}</span></div>
  <div class="row"><span class="k2">Take profit 1</span><span style="color:#ff8a3d">${fmt(R.tp1)} (${((R.tp1-R.eMid)/R.risk).toFixed(1)}R)</span></div>
  <div class="row"><span class="k2">Take profit 2</span><span style="color:#ff8a3d">${fmt(R.tp2)} (${((R.tp2-R.eMid)/R.risk).toFixed(1)}R)</span></div>
  <div class="row"><span class="k2">Risk to stop</span><span>${(R.risk/R.eMid*100).toFixed(2)}%</span></div></div>
  <div class="reason">${R.cur.r.map(x=>"▸ <b>"+x+"</b>").join("<br>")}<br>▸ Plan: wait for price in the zone plus a bullish ${state.tf.toUpperCase()} close. No fill = no trade.</div>`;
  const b=R.bt;$("#bt").innerHTML=`<h3><span style="color:${C.p}">SIGNAL TRACK RECORD</span><span class="k2">${state.tf.toUpperCase()}</span></h3>
  <div class="row"><span class="k2">Past BUY markers</span><span>${b.n}</span></div><div class="row"><span class="k2">Hit 2R before stop</span><span class="up">${b.W}</span></div>
  <div class="row"><span class="k2">Stopped out</span><span class="dn">${b.Lo}</span></div><div class="row"><span class="k2">Timed out / still open</span><span>${b.O}</span></div>
  <div class="row"><span class="k2">Hit rate (closed)</span><span>${b.hit==null?"–":(b.hit*100).toFixed(0)+"%"}</span></div>
  <div class="row"><span class="k2">Net / avg per trade</span><span class="${b.net>=0?"up":"dn"}">${b.net>=0?"+":""}${b.net}R / ${b.avg==null?"–":b.avg.toFixed(2)+"R"}</span></div>
  <div class="reason">Replay over ${R.k.length} loaded candles, fees excluded. At 2R a 34% hit rate breaks even. A small sample is mostly noise.</div>`;
  $("#mini").innerHTML=COINS.map(c=>{const x=an[c+state.tf];if(!x)return `<div class="panel card">${c} …</div>`;const cl=col(x.bias);return `<div class="panel card" data-c="${c}" style="border-color:${c===state.coin?C.c:""}"><div style="display:flex;justify-content:space-between"><b>${c}</b><span style="color:${cl}">${x.cur.s}</span></div><div>${fmt(x.price)}</div><div style="color:${cl};font-size:11px">${x.bias}</div></div>`}).join("");
  document.querySelectorAll("#mini .card[data-c]").forEach(e=>e.onclick=()=>setCoin(e.dataset.c));
}
function todo(){const R=an[state.coin+state.tf];if(!R)return;const p=R.price,z=R.ez,el=$("#todo");let t,c,sub="";
  const zs=`${fmt(z.lo)}–${fmt(z.hi)}`;
  if(R.bias.startsWith("AVOID")||(R.bias==="NEUTRAL"&&R.cur.s<50)||p<R.stop){t="NO SETUP / STAY OUT";c="#8a96b8";sub="No trade right now. Nothing to do.";}
  else if(p>=z.lo&&p<=z.hi){const lb=R.k[R.k.length-2],T=state.tf.toUpperCase(),ok=lb&&lb.close>lb.open&&lb.close>=z.lo;
    t=ok?"BUY NOW: price is in the zone and the last "+T+" candle closed bullish":"IN ZONE: buy only after a bullish "+T+" close";c=ok?C.g:"#9dffc4";
    sub=`Zone ${zs} · stop ${fmt(R.stop)} · Take profit 1 ${fmt(R.tp1)} · Take profit 2 ${fmt(R.tp2)}`;}
  else if(p>z.hi){t=`WAIT: price is above the buy zone, buy only if it drops to ${zs}`;c=C.y;sub=`Needs to fall ${((p-z.hi)/p*100).toFixed(2)}% to reach the zone. Don't buy up here.`;}
  else{t=`WAIT: price is below the buy zone`;c=C.y;sub=`Buy only after it climbs back into ${zs}.`;}
  el.style.borderColor=c;el.style.boxShadow=`0 0 18px ${c}55`;
  el.innerHTML=`<div class="k2">${state.coin} · ${state.tf.toUpperCase()}</div><div class="badge" style="color:${c};text-shadow:0 0 10px ${c}88">${t}</div><div class="pnow">Price now: <b>${fmt(p)}</b></div><div class="k2">${sub}</div>`;}
document.querySelectorAll("#layers input").forEach(i=>i.onchange=()=>{LY[i.dataset.l]=i.checked;render()});
$("#lybtn").onclick=()=>$("#layers").classList.toggle("open");
// ---------- MACRO ----------
async function loadCtx(){try{ctx=await j("data/context.json?"+Date.now())}catch(e){ctx=null}
  if(!ctx){$("#macro").innerHTML='<span class="k2">macro context unavailable</span>';return}const m=ctx.macro,cell=(k,v,cls="")=>`<div class="mc"><div class="k">${k}</div><div class="v ${cls}">${v}</div></div>`,tr=x=>x?.trend==="up"?"up":x?.trend==="down"?"dn":"nt";
  const f=ctx.coins[state.coin]?.funding;
  $("#macro").innerHTML=cell("REGIME",m.regime,m.regime==="RISK-ON"?"up":m.regime==="RISK-OFF"?"dn":"nt")+cell("FEAR/GREED",m.fng?`${m.fng.value} ${m.fng.label}`:"–",m.fng?.value>=75?"dn":m.fng?.value<=25?"up":"nt")+
   cell("S&P 500",m.spx?.last?`${m.spx.last.toLocaleString()} ${m.spx.trend}`:"–",tr(m.spx))+cell("NASDAQ",m.ndx?.last?`${m.ndx.last.toLocaleString()} ${m.ndx.trend}`:"–",tr(m.ndx))+
   cell("DXY",m.dxy?.last?`${m.dxy.last} ${m.dxy.trend}`:"–",m.dxy?.trend==="up"?"dn":m.dxy?.trend==="down"?"up":"nt")+cell("BTC DOM",m.btc_dom?m.btc_dom+"%":"–")+cell("MCAP 24H",m.mcap_chg24h!=null?m.mcap_chg24h+"%":"–",m.mcap_chg24h>=0?"up":"dn")+
   cell(state.coin+" FUNDING",f!=null?(f*100).toFixed(4)+"%":"–",Math.abs(f)>0.0005?"dn":"up")+cell(state.coin+" OI",ctx.coins[state.coin]?.oi_usd?"$"+(ctx.coins[state.coin].oi_usd/1e6).toFixed(0)+"M":"–");
  $("#ctxu").textContent=new Date(ctx.updated).toLocaleString();}
// ---------- FLOW ----------
async function compute(coin,tf,force){const [a,b]=await Promise.all([get(coin,tf,force),get(coin,HTF[tf],force&&tf==="1d")]);an[coin+tf]=analyze(a.k,b.k,tf,coin);}
async function refresh(force){try{await compute(state.coin,state.tf,force);render();$("#livetxt").textContent="LIVE";}catch(e){$("#livetxt").textContent="DATA ERROR";console.error(e)}
  await Promise.all(COINS.filter(c=>c!==state.coin).map(c=>compute(c,state.tf).catch(()=>{})));sideCards();loadCtx();}
function setCoin(c){state.coin=c;document.querySelectorAll(".coin").forEach(b=>b.classList.toggle("on",b.dataset.c===c));refresh();}
document.querySelectorAll(".coin").forEach(b=>b.onclick=()=>setCoin(b.dataset.c));
document.querySelectorAll(".tf").forEach(b=>b.onclick=()=>{state.tf=b.dataset.t;document.querySelectorAll(".tf").forEach(x=>x.classList.toggle("on",x===b));refresh()});
setInterval(()=>$("#clock").textContent=new Date().toLocaleTimeString(),1000);
// live tick: update the last candle every 20s
setInterval(async()=>{try{await compute(state.coin,state.tf,true);const R=an[state.coin+state.tf],lr=ch.timeScale().getVisibleLogicalRange();const b=R.k[R.k.length-1];S.cs.update({time:b.time,open:b.open,high:b.high,low:b.low,close:b.close});sideCards();todo();drawOv();}catch(e){}},20000);
setInterval(()=>refresh(true),300000);
loadCtx().then(()=>refresh(true));
