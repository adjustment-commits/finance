/* ===========================
   PASSWORD LOCK
=========================== */

const app = document.getElementById("app");
const headerEl = document.querySelector("header");

app.style.display = "none";
headerEl.style.display = "none";

const PW_KEY = "adj_trade_password";

const lockScreen = document.getElementById("lockScreen");
const pwInput = document.getElementById("pwInput");
const pwBtn = document.getElementById("pwBtn");
const pwMsg = document.getElementById("pwMsg");

(function(){
  if(!localStorage.getItem(PW_KEY)){
    pwMsg.textContent="新しいパスワードを設定してください";
  }else{
    pwMsg.textContent="パスワードを入力してください";
  }
})();

pwBtn.onclick = ()=>{
  const input = pwInput.value.trim();
  if(!input) return;

  if(!localStorage.getItem(PW_KEY)){
    localStorage.setItem(PW_KEY,input);
  }

  if(input === localStorage.getItem(PW_KEY)){
    lockScreen.style.display="none";
    app.style.display="flex";
    headerEl.style.display="flex";
  }else{
    pwMsg.textContent="パスワードが違います";
  }
};

/* ===========================
   API SETTINGS
=========================== */

const API_KEY = "9da2719fc4mshd3a78b9ad23f661p120cb6jsn71fe0d28e188";
const API_HOST = "yahoo-finance-real-time1.p.rapidapi.com";

/* ===========================
   LOW PRICE LIST
=========================== */

const LOW_PRICE_LIST = [
"1301.T","1332.T","1377.T","1419.T","1514.T","1518.T",
"1711.T","1757.T","1840.T","1860.T","1921.T","1963.T",
"2134.T","2148.T","2162.T","2170.T","2191.T","2315.T",
"2330.T","2345.T","2370.T","2395.T","2438.T","2484.T",
"2491.T","2687.T","2929.T","3031.T","3070.T","3133.T",
"3189.T","3205.T","3315.T","3323.T","3356.T","3521.T",
"3624.T","3664.T","3686.T","3726.T","3823.T","3856.T",
"3907.T","3911.T","3923.T","3962.T","3992.T","4026.T"
];

/* ===========================
   SAFE FETCH
=========================== */

async function fetchQuotes(symbols){
  try{
    const url=`https://${API_HOST}/market/get-quotes?region=JP&symbols=${symbols.join(",")}`;
    const res=await fetch(url,{
      headers:{
        "x-rapidapi-key":API_KEY,
        "x-rapidapi-host":API_HOST
      }
    });
    if(!res.ok) return [];
    const json=await res.json();
    return json.quoteResponse?.result || [];
  }catch(e){
    console.error(e);
    return [];
  }
}

async function fetchVolumeAverage(symbol){
  try{
    const url=`https://${API_HOST}/stock/v2/get-summary?symbol=${symbol}`;
    const res=await fetch(url,{
      headers:{
        "x-rapidapi-key":API_KEY,
        "x-rapidapi-host":API_HOST
      }
    });
    if(!res.ok) return null;
    const json=await res.json();
    return json.summaryDetail?.averageDailyVolume10Day?.raw || null;
  }catch(e){
    return null;
  }
}

async function fetchCandles(symbol){
  try{
    const url=`https://${API_HOST}/stock/v3/get-historical-data?symbol=${symbol}&region=JP`;
    const res=await fetch(url,{
      headers:{
        "x-rapidapi-key":API_KEY,
        "x-rapidapi-host":API_HOST
      }
    });
    if(!res.ok) return [];
    const json=await res.json();
    return json.prices?.slice(0,3) || [];
  }catch(e){
    return [];
  }
}

/* ===========================
   LOGIC
=========================== */

function volumeSpike(today, avg){
  if(!today || !avg) return 0;
  return today/avg;
}

function candleScore(c){
  if(!c.open||!c.high||!c.low||!c.close) return 0;
  const body=Math.abs(c.close-c.open);
  const range=c.high-c.low;
  const lower=Math.min(c.open,c.close)-c.low;
  let s=0;
  if(c.close>c.open) s++;
  if(body/range>=0.3) s++;
  if(lower/range>=0.25) s++;
  return s;
}

function candleAverageScore(cs){
  if(cs.length===0) return 0;
  let t=0;
  cs.forEach(c=>t+=candleScore(c));
  return t/cs.length;
}

function calcStars(d,avg){
  let s=0;
  if(d.regularMarketPrice<=300) s++;
  if(d.regularMarketChangePercent>=1) s++;
  if(d.regularMarketChangePercent>=3) s++;
  if(d.regularMarketVolume>=500000) s++;
  if(d.regularMarketVolume>=2000000) s++;
  if(avg>=1.2) s++;
  if(d.spike>=1.2) s++;
  if(d.spike>=2.5) s++;
  return "★".repeat(s);
}

/* ===========================
   SCANNER
=========================== */

const scanBtn=document.getElementById("scanBtn");

scanBtn.onclick=async()=>{

  clearBoard();

  const quotes=await fetchQuotes(LOW_PRICE_LIST);
  const candidates=[];

  for(const d of quotes){

    const avgVol=await fetchVolumeAverage(d.symbol);
    d.spike=volumeSpike(d.regularMarketVolume,avgVol);

    if(!(d.regularMarketPrice<=300 &&
         d.regularMarketVolume>=300000 &&
         d.spike>=1.3)) continue;

    const candles=await fetchCandles(d.symbol);
    const avg=candleAverageScore(candles);
    const stars=calcStars(d,avg);

    candidates.push({symbol:d.symbol,score:stars.length});
  }

  candidates.sort((a,b)=>b.score-a.score);

  candidates.slice(0,20).forEach(c=>{
    insertSymbolToBoard(c.symbol);
  });

  refresh();
};

/* ===========================
   BOARD
=========================== */

const STORAGE_KEY="adj_trade_board";
const rows=document.getElementById("rows");

function buildRows(){
  const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]");
  rows.innerHTML="";
  for(let i=0;i<20;i++){
    const tr=document.createElement("tr");
    tr.innerHTML=`
<td><input class="symbol" value="${saved[i]?.symbol||""}"></td>
<td class="name">-</td>
<td class="price">-</td>
<td class="change">-</td>
<td class="status">🫷</td>
<td><input class="entry" value="${saved[i]?.entry||""}"></td>
<td class="tp">-</td>
<td class="sl">-</td>
<td class="diff">-</td>
<td><input class="note" value="${saved[i]?.note||""}"></td>
<td><button class="delBtn">✖</button></td>`;
    rows.appendChild(tr);
  }
}
buildRows();

/* ===========================
   REFRESH
=========================== */

const refreshBtn=document.getElementById("refreshBtn");

async function refresh(){

  const inputs=[...document.querySelectorAll(".symbol")];
  const symbols=inputs.map(i=>i.value.trim()).filter(v=>v!=="");
  if(symbols.length===0) return;

  const data=await fetchQuotes(symbols);

  inputs.forEach(input=>{
    const row=input.closest("tr");
    const d=data.find(x=>x.symbol===input.value.toUpperCase());
    if(!d) return;

    row.querySelector(".price").textContent=d.regularMarketPrice?.toFixed(2)||"-";
    row.querySelector(".change").textContent=d.regularMarketChangePercent?.toFixed(2)+"%"||"-";
    row.querySelector(".name").textContent=d.shortName||"-";

    const pct=d.regularMarketChangePercent;
    row.className="";
    if(pct>=2){row.classList.add("buy");row.querySelector(".status").textContent="🚀";}
    else if(pct<=-2){row.classList.add("sl");row.querySelector(".status").textContent="🔥";}
    else if(pct>=1){row.classList.add("tp");row.querySelector(".status").textContent="✨";}
    else{row.classList.add("wait");row.querySelector(".status").textContent="🫷";}

    const entry=parseFloat(row.querySelector(".entry").value);
    if(entry){
      row.querySelector(".tp").textContent=(entry*1.02).toFixed(2);
      row.querySelector(".sl").textContent=(entry*0.99).toFixed(2);
      row.querySelector(".diff").textContent=(((d.regularMarketPrice-entry)/entry)*100).toFixed(1)+"%";
    }
  });

  saveBoard();
}

refreshBtn.onclick=refresh;

/* ===========================
   INSERT / SAVE / CLEAR
=========================== */

function insertSymbolToBoard(symbol){
  const inputs=[...document.querySelectorAll(".symbol")];
  if(inputs.some(i=>i.value===symbol)) return;
  const empty=inputs.find(i=>i.value==="");
  if(empty) empty.value=symbol;
}

function saveBoard(){
  const data=[...document.querySelectorAll("#rows tr")].map(tr=>({
    symbol:tr.querySelector(".symbol").value,
    entry:tr.querySelector(".entry").value,
    note:tr.querySelector(".note").value
  }));
  localStorage.setItem(STORAGE_KEY,JSON.stringify(data));
}

function clearBoard(){
  document.querySelectorAll("#rows tr").forEach(tr=>{
    tr.querySelectorAll("input").forEach(i=>i.value="");
    tr.querySelectorAll("td:not(:first-child)").forEach(td=>td.textContent="-");
    tr.querySelector(".status").textContent="🫷";
    tr.className="";
  });
  saveBoard();
}

document.getElementById("clearBtn").onclick=()=>{
  if(confirm("ボードを全削除しますか？")){
    clearBoard();
  }
};

/* ===========================
   DELETE
=========================== */

document.addEventListener("click",e=>{
  if(!e.target.classList.contains("delBtn")) return;
  const row=e.target.closest("tr");
  row.querySelectorAll("input").forEach(i=>i.value="");
  row.querySelectorAll("td:not(:first-child)").forEach(td=>td.textContent="-");
  row.querySelector(".status").textContent="🫷";
  row.className="";
  saveBoard();
});
