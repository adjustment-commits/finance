const API_KEY = "9da2719fc4mshd3a78b9ad23f661p120cb6jsn71fe0d28e188";
const API_HOST = "yahoo-finance-real-time1.p.rapidapi.com";
const refreshBtn = document.getElementById("refreshBtn");
const autoBtn = document.getElementById("autoBtn");
const rows = document.getElementById("rows");

let auto=false;
let timer=null;

/* ---------- 初期20行 ---------- */
function buildRows(){
rows.innerHTML="";
for(let i=0;i<20;i++){
const tr=document.createElement("tr");
tr.innerHTML=`
<td><input class="symbol"></td>
<td class="price"></td>
<td class="change"></td>
<td class="status">🫷</td>
<td><input class="note"></td>
`;
rows.appendChild(tr);
}
}
buildRows();

/* ---------- データ取得 ---------- */
async function fetchQuotes(symbols){
try{
const url=`https://${API_HOST}/market/v2/get-quotes?region=JP&symbols=${symbols.join(",")}`;

const res=await fetch(url,{
headers:{
"x-rapidapi-key":API_KEY,
"x-rapidapi-host":API_HOST
}
});

const json=await res.json();
return json.quoteResponse.result;
}catch{
return [];
}
}

/* ---------- 更新 ---------- */
async function fetchQuotes(symbols){
try{
const url = `https://${API_HOST}/market/get-quotes?region=JP&symbols=${symbols.join(",")}`;

const res = await fetch(url,{
headers:{
"x-rapidapi-key":API_KEY,
"x-rapidapi-host":API_HOST
}
});

const json = await res.json();

if(!json.quoteResponse) return [];
if(!json.quoteResponse.result) return [];

return json.quoteResponse.result;

}catch(e){
console.log(e);
return [];
}
}

/* ---------- Auto ---------- */
function toggleAuto(){
if(auto){
clearInterval(timer);
auto=false;
autoBtn.textContent="自動更新 OFF";
}else{
timer=setInterval(refresh,5000);
auto=true;
autoBtn.textContent="自動更新 ON";
}
}

refreshBtn.onclick=refresh;
autoBtn.onclick=toggleAuto;
