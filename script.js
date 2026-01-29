alert("JS OK");

/* ===== 設定 ===== */

const API_KEY="9da2719fc4mshd3a78b9ad23f661p120cb6jsn71fe0d28e188";
const API_HOST="yahoo-finance-real-time1.p.rapidapi.com";

const LIST=[
"1301.T","1332.T","1377.T","1419.T",
"1514.T","1711.T","1757.T","1921.T"
];

const rows=document.getElementById("rows");

/* ===== API ===== */

async function fetchQuotes(symbols){

const url=`https://${API_HOST}/market/get-quotes?region=JP&symbols=${symbols.join(",")}`;

const res=await fetch(url,{
headers:{
"x-rapidapi-key":API_KEY,
"x-rapidapi-host":API_HOST
}});

const json=await res.json();
return json.quoteResponse?.result || [];
}

/* ===== 行生成 ===== */

function addRow(symbol){
const tr=document.createElement("tr");
tr.innerHTML=`
<td>${symbol}</td>
<td class="price">-</td>
<td class="change">-</td>
<td><button class="del">✖</button></td>
`;
rows.appendChild(tr);
}

/* ===== スキャン ===== */

document.getElementById("scanBtn").onclick=async()=>{

rows.innerHTML="";

LIST.forEach(s=>addRow(s));

const data=await fetchQuotes(LIST);

data.forEach(d=>{
const row=[...rows.children].find(r=>r.children[0].textContent===d.symbol);
if(!row) return;

row.querySelector(".price").textContent=d.regularMarketPrice?.toFixed(2)||"-";
row.querySelector(".change").textContent=d.regularMarketChangePercent?.toFixed(2)||"-";
});

};

/* ===== 更新 ===== */

document.getElementById("refreshBtn").onclick=()=>{
document.getElementById("scanBtn").click();
};

/* ===== 全削除 ===== */

document.getElementById("clearBtn").onclick=()=>{
rows.innerHTML="";
};

/* ===== 削除 ===== */

document.addEventListener("click",e=>{
if(!e.target.classList.contains("del")) return;
e.target.closest("tr").remove();
});
