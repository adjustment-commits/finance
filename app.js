/*
ADJ Stock Screener (PWA)
	•	候補抽出（<=300円等） + BUY/TP/SL判定（仮想ポジション）
	•	売買は楽天 Market Speed / iSPEED で行う前提
	•	ブラウザはCORSや仕様変更で壊れやすいので、実運用は「自前プロキシ」推奨
*/

const $ = (id) => document.getElementById(id);

const els = {
btnRefresh: $("btnRefresh"),
btnAuto: $("btnAuto"),
btnInstall: $("btnInstall"),

providerSelect: $("providerSelect"),
providerRapidApi: $("providerRapidApi"),
providerProxy: $("providerProxy"),

refreshSec: $("refreshSec"),

rapidApiKey: $("rapidApiKey"),
rapidApiHost: $("rapidApiHost"),

proxyUrl: $("proxyUrl"),

symbolsText: $("symbolsText"),
btnSaveSymbols: $("btnSaveSymbols"),
btnLoadSample: $("btnLoadSample"),
btnClearLogs: $("btnClearLogs"),

maxPrice: $("maxPrice"),
minVolume: $("minVolume"),
minRangePct: $("minRangePct"),
minVolRatio: $("minVolRatio"),
emaFast: $("emaFast"),
emaSlow: $("emaSlow"),

stopPct: $("stopPct"),
takePct: $("takePct"),
breakoutPct: $("breakoutPct"),

btnSaveSettings: $("btnSaveSettings"),
status: $("status"),

lastUpdated: $("lastUpdated"),
countTotal: $("countTotal"),
countCandidates: $("countCandidates"),
resultBody: $("resultBody"),
logWrap: $("logWrap"),
};

const STORAGE_KEY = "adj_screener_v1";
const LOG_KEY = "adj_screener_logs_v1";
const MAX_LOGS = 300;
const MAX_HISTORY_PER_SYMBOL = 240; // サンプル列（EMA計算用の最大長）

let state = {
auto: false,
timer: null,
installPrompt: null,

settings: {
provider: "demo",
refreshSec: 5,

rapidApiKey: "",
rapidApiHost: "yahoo-finance1.p.rapidapi.com",

proxyUrl: "",

symbols: ["8306.T","7203.T","4755.T","4005.T","2914.T"],

filters: {
  maxPrice: 300,
  minVolume: 1000000,
  minRangePct: 3.0,
  minVolRatio: 2.0,
  emaFast: 9,
  emaSlow: 21,
},

signals: {
  stopPct: 1.0,
  takePct: 1.5,
  breakoutPct: 0.20,
}

},

// 監視データ（本アプリの取得サンプル列）
history: {
// symbol: { prices:[], volumes:[], highs:[], lows:[], last:{…} }
},

// 仮想ポジション
positions: {
// symbol: { entry, sl, tp, openedAtISO, status:‘OPEN’|‘CLOSED_TP’|‘CLOSED_SL’, lastSignalISO }
},

// 最新クォート
quotes: [],
};

function nowISO(){
return new Date().toISOString();
}
function fmtTimeJP(d = new Date()){
const pad = (n) => String(n).padStart(2,"0");
return ${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())};
}

function clamp(n, a, b){
return Math.min(Math.max(n, a), b);
}

function safeNumber(x, fallback = 0){
const n = Number(x);
return Number.isFinite(n) ? n : fallback;
}

function uniq(arr){
const set = new Set();
const out = [];
for(const x of arr){
const v = String(x).trim();
if(!v) continue;
const k = v.toUpperCase();
if(set.has(k)) continue;
set.add(k);
out.push(v);
}
return out;
}

function loadStore(){
try{
const raw = localStorage.getItem(STORAGE_KEY);
if(!raw) return;
const obj = JSON.parse(raw);
if(obj && obj.settings){
state.settings = deepMerge(state.settings, obj.settings);
}
if(obj && obj.positions){
state.positions = obj.positions;
}
}catch(e){}
}
function saveStore(){
const payload = {
settings: state.settings,
positions: state.positions,
};
localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function loadLogs(){
try{
const raw = localStorage.getItem(LOG_KEY);
if(!raw) return [];
const logs = JSON.parse(raw);
if(Array.isArray(logs)) return logs;
return [];
}catch(e){
return [];
}
}
function saveLogs(logs){
localStorage.setItem(LOG_KEY, JSON.stringify(logs.slice(0, MAX_LOGS)));
}

function addLog(item){
const logs = loadLogs();
logs.unshift(item);
saveLogs(logs);
renderLogs();
}

function clearLogs(){
localStorage.removeItem(LOG_KEY);
renderLogs();
}

function deepMerge(base, patch){
const out = Array.isArray(base) ? […base] : { …base };
for(const k of Object.keys(patch || {})){
const bv = base ? base[k] : undefined;
const pv = patch[k];
if(pv && typeof pv === "object" && !Array.isArray(pv)){
out[k] = deepMerge(bv && typeof bv === "object" ? bv : {}, pv);
}else{
out[k] = pv;
}
}
return out;
}

/* ===========================
UI sync
=========================== */

function syncUIFromState(){
els.providerSelect.value = state.settings.provider;
els.refreshSec.value = String(state.settings.refreshSec);

els.rapidApiKey.value = state.settings.rapidApiKey || "";
els.rapidApiHost.value = state.settings.rapidApiHost || "yahoo-finance1.p.rapidapi.com";

els.proxyUrl.value = state.settings.proxyUrl || "";

els.symbolsText.value = (state.settings.symbols || []).join("\n");

els.maxPrice.value = String(state.settings.filters.maxPrice);
els.minVolume.value = String(state.settings.filters.minVolume);
els.minRangePct.value = String(state.settings.filters.minRangePct);
els.minVolRatio.value = String(state.settings.filters.minVolRatio);
els.emaFast.value = String(state.settings.filters.emaFast);
els.emaSlow.value = String(state.settings.filters.emaSlow);

els.stopPct.value = String(state.settings.signals.stopPct);
els.takePct.value = String(state.settings.signals.takePct);
els.breakoutPct.value = String(state.settings.signals.breakoutPct);

updateProviderUI();
updateAutoUI();
renderLogs();
}

function updateProviderUI(){
const p = state.settings.provider;
els.providerRapidApi.classList.toggle("hidden", p !== "rapidapi_yf");
els.providerProxy.classList.toggle("hidden", p !== "custom_proxy");
}

function updateAutoUI(){
els.btnAuto.textContent = state.auto ? "自動更新: ON" : "自動更新: OFF";
els.btnAuto.classList.toggle("primary", state.auto);
}

function setStatus(msg, kind = "muted"){
els.status.textContent = msg;
if(kind === "good"){
els.status.style.color = "#bbf7d0";
}else if(kind === "bad"){
els.status.style.color = "#fecaca";
}else if(kind === "warn"){
els.status.style.color = "#fde68a";
}else{
els.status.style.color = "#94a3b8";
}
}

function applySettingsFromUI(){
state.settings.provider = els.providerSelect.value;
state.settings.refreshSec = clamp(safeNumber(els.refreshSec.value, 5), 3, 60);

state.settings.rapidApiKey = String(els.rapidApiKey.value || "").trim();
state.settings.rapidApiHost = String(els.rapidApiHost.value || "").trim() || "yahoo-finance1.p.rapidapi.com";

state.settings.proxyUrl = String(els.proxyUrl.value || "").trim();

const symbols = uniq(String(els.symbolsText.value || “”).split(/\r?\n/).map(s => s.trim()));
state.settings.symbols = symbols;

state.settings.filters.maxPrice = clamp(safeNumber(els.maxPrice.value, 300), 1, 200000);
state.settings.filters.minVolume = clamp(safeNumber(els.minVolume.value, 0), 0, 999999999);
state.settings.filters.minRangePct = clamp(safeNumber(els.minRangePct.value, 0), 0, 200);
state.settings.filters.minVolRatio = clamp(safeNumber(els.minVolRatio.value, 1), 1, 99);
state.settings.filters.emaFast = clamp(safeNumber(els.emaFast.value, 9), 3, 120);
state.settings.filters.emaSlow = clamp(safeNumber(els.emaSlow.value, 21), 5, 300);

state.settings.signals.stopPct = clamp(safeNumber(els.stopPct.value, 1.0), 0.1, 99);
state.settings.signals.takePct = clamp(safeNumber(els.takePct.value, 1.5), 0.1, 999);
state.settings.signals.breakoutPct = clamp(safeNumber(els.breakoutPct.value, 0.20), 0, 99);

updateProviderUI();
}

/* ===========================
Indicator helpers
=========================== */

function ema(values, period){
if(!Array.isArray(values) || values.length === 0) return null;
const p = Math.max(1, Math.floor(period));
const k = 2 / (p + 1);
let e = values[0];
for(let i=1;i<values.length;i++){
e = values[i] * k + e * (1 - k);
}
return e;
}

function mean(values){
if(!values || values.length === 0) return 0;
let s=0, c=0;
for(const v of values){
const n = Number(v);
if(!Number.isFinite(n)) continue;
s += n; c++;
}
return c ? (s/c) : 0;
}

function lastN(arr, n){
if(!Array.isArray(arr)) return [];
return arr.slice(Math.max(0, arr.length - n));
}

function pct(a,b){
if(!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return 0;
return (a - b) / b * 100;
}

/* ===========================
Data Providers
quote shape normalized:
{
symbol, price, changePct, volume, dayHigh, dayLow, dayOpen
}
=========================== */

async function fetchQuotes(symbols){
const provider = state.settings.provider;

if(symbols.length === 0) return [];

if(provider === "demo"){
return demoQuotes(symbols);
}

if(provider === "rapidapi_yf"){
return rapidApiYahooQuotes(symbols);
}

if(provider === "custom_proxy"){
return proxyQuotes(symbols);
}

return demoQuotes(symbols);
}

function demoQuotes(symbols){
// 再現性のために、symbol文字列から擬似乱数を生成
const t = Date.now();
const out = [];
for(const s of symbols){
const seed = hashCode(s) ^ (Math.floor(t/1000));
const r1 = rand01(seed);
const r2 = rand01(seed * 31 + 7);
const base = 50 + (hashCode(s) % 260); // 50..309 くらい
const price = Math.max(1, base * (0.97 + r1 * 0.08));
const open = base * (0.98 + r2 * 0.05);
const high = Math.max(price, open) * (1.00 + rand01(seed+99)*0.03);
const low = Math.min(price, open) * (0.97 + rand01(seed+199)*0.02);
const volume = Math.floor(200000 + rand01(seed+299) * 6000000);
const changePct = pct(price, open);

out.push({
  symbol: s,
  price: round(price, 2),
  changePct: round(changePct, 2),
  volume,
  dayHigh: round(high, 2),
  dayLow: round(low, 2),
  dayOpen: round(open, 2),
});

}
return out;
}

function hashCode(str){
let h = 0;
for(let i=0;i<str.length;i++){
h = ((h<<5)-h) + str.charCodeAt(i);
h |= 0;
}
return h;
}
function rand01(seed){
// xorshift
let x = seed | 0;
x ^= x << 13;
x ^= x >> 17;
x ^= x << 5;
const u = (x >>> 0) / 4294967295;
return u;
}
function round(n, d=2){
const p = Math.pow(10,d);
return Math.round(n*p)/p;
}

async function rapidApiYahooQuotes(symbols){
const key = state.settings.rapidApiKey;
const host = state.settings.rapidApiHost;

if(!key){
setStatus(“RapidAPI Keyが未設定 → DEMOへ切替推奨”, "warn");
return demoQuotes(symbols);
}

// 多くのRapidAPI Yahoo Finance APIは endpoint が複数存在する。
// ここでは「market/v2/get-quotes」系を想定（ダメならプロキシ推奨）。
// 期待：quoteResponse.result[] に price/volume/high/low/open 等が入る
const endpoint = https://${host}/market/v2/get-quotes?region=JP&lang=ja&symbols=${encodeURIComponent(symbols.join(","))};

try{
const res = await fetch(endpoint, {
headers: {
"x-rapidapi-key": key,
"x-rapidapi-host": host
}
});
if(!res.ok){
setStatus(RapidAPI取得失敗: HTTP ${res.status} → DEMOで継続, "warn");
return demoQuotes(symbols);
}
const json = await res.json();

const results = (json && json.quoteResponse && Array.isArray(json.quoteResponse.result))
  ? json.quoteResponse.result
  : [];

const out = results.map(r => ({
  symbol: String(r.symbol || "").trim(),
  price: safeNumber(r.regularMarketPrice, safeNumber(r.price, 0)),
  changePct: safeNumber(r.regularMarketChangePercent, 0),
  volume: safeNumber(r.regularMarketVolume, 0),
  dayHigh: safeNumber(r.regularMarketDayHigh, safeNumber(r.regularMarketHigh, 0)),
  dayLow: safeNumber(r.regularMarketDayLow, safeNumber(r.regularMarketLow, 0)),
  dayOpen: safeNumber(r.regularMarketOpen, 0),
})).filter(x => x.symbol);

// 欠けた銘柄はDEMOで補完（表示の穴防止）
const got = new Set(out.map(o => o.symbol.toUpperCase()));
for(const s of symbols){
  if(!got.has(s.toUpperCase())){
    out.push(...demoQuotes([s]));
  }
}
return out;

}catch(e){
setStatus("RapidAPI取得で例外 → DEMOで継続", "warn");
return demoQuotes(symbols);
}
}

async function proxyQuotes(symbols){
const tpl = String(state.settings.proxyUrl || "").trim();
if(!tpl || !tpl.includes(”{symbols}”)){
setStatus("プロキシURLが未設定/形式不正 → DEMOで継続", "warn");
return demoQuotes(symbols);
}

const url = tpl.replace("{symbols}", encodeURIComponent(symbols.join(",")));
try{
const res = await fetch(url, { cache: "no-store" });
if(!res.ok){
setStatus(プロキシ取得失敗: HTTP ${res.status} → DEMOで継続, "warn");
return demoQuotes(symbols);
}
const json = await res.json();

// 期待形式（例）
// { "quotes":[ {symbol, price, changePct, volume, dayHigh, dayLow, dayOpen}, ... ] }
const q = (json && Array.isArray(json.quotes)) ? json.quotes : [];
const out = q.map(x => ({
  symbol: String(x.symbol || "").trim(),
  price: safeNumber(x.price, 0),
  changePct: safeNumber(x.changePct, 0),
  volume: safeNumber(x.volume, 0),
  dayHigh: safeNumber(x.dayHigh, 0),
  dayLow: safeNumber(x.dayLow, 0),
  dayOpen: safeNumber(x.dayOpen, 0),
})).filter(x => x.symbol);

const got = new Set(out.map(o => o.symbol.toUpperCase()));
for(const s of symbols){
  if(!got.has(s.toUpperCase())){
    out.push(...demoQuotes([s]));
  }
}
return out;

}catch(e){
setStatus("プロキシ取得で例外 → DEMOで継続", "warn");
return demoQuotes(symbols);
}
}

/* ===========================
Core: update loop
=========================== */

async function refreshOnce(){
applySettingsFromUI();
saveStore();

const symbols = state.settings.symbols || [];
if(symbols.length === 0){
setStatus("銘柄が空。テキストエリアに追加して保存。", "warn");
render([]);
return;
}

setStatus("取得中…", "muted");
const quotes = await fetchQuotes(symbols);

// normalize + clean
const cleaned = quotes.map(q => ({
symbol: String(q.symbol || “”).trim(),
price: safeNumber(q.price, 0),
changePct: safeNumber(q.changePct, 0),
volume: Math.max(0, Math.floor(safeNumber(q.volume, 0))),
dayHigh: safeNumber(q.dayHigh, 0),
dayLow: safeNumber(q.dayLow, 0),
dayOpen: safeNumber(q.dayOpen, 0),
})).filter(q => q.symbol);

state.quotes = cleaned;

// update history
for(const q of cleaned){
if(!state.history[q.symbol]){
state.history[q.symbol] = { prices:[], volumes:[], highs:[], lows:[], opens:[], last:null };
}
const h = state.history[q.symbol];

h.prices.push(q.price);
h.volumes.push(q.volume);
h.highs.push(q.dayHigh);
h.lows.push(q.dayLow);
h.opens.push(q.dayOpen);
h.last = q;

trimTo(h.prices, MAX_HISTORY_PER_SYMBOL);
trimTo(h.volumes, MAX_HISTORY_PER_SYMBOL);
trimTo(h.highs, MAX_HISTORY_PER_SYMBOL);
trimTo(h.lows, MAX_HISTORY_PER_SYMBOL);
trimTo(h.opens, MAX_HISTORY_PER_SYMBOL);

}

// compute signals + render
const analysis = analyzeAll(cleaned);
render(analysis);

const ts = fmtTimeJP(new Date());
els.lastUpdated.textContent = ts;
setStatus("更新完了", "good");
}

function trimTo(arr, maxLen){
if(arr.length <= maxLen) return;
arr.splice(0, arr.length - maxLen);
}

function analyzeAll(quotes){
const F = state.settings.filters;
const S = state.settings.signals;

const out = [];
let candidates = 0;

for(const q of quotes){
const h = state.history[q.symbol] || { prices:[], volumes:[], highs:[], lows:[] };

const price = q.price;
const volume = q.volume;

const dayOpen = q.dayOpen || (h.opens.length ? h.opens[h.opens.length-1] : price);
const dayHigh = q.dayHigh || (h.highs.length ? h.highs[h.highs.length-1] : price);
const dayLow  = q.dayLow  || (h.lows.length ? h.lows[h.lows.length-1] : price);

const rangePct = dayOpen > 0 ? ((dayHigh - dayLow) / dayOpen * 100) : 0;

// 出来高倍率：直近観測平均で近似
const volBaseline = mean(lastN(h.volumes, Math.max(10, Math.floor(F.emaSlow))));
const volRatio = volBaseline > 0 ? (volume / volBaseline) : 0;

const pricesForEma = lastN(h.prices, Math.max(F.emaSlow * 3, 30));
const emaFast = ema(pricesForEma, F.emaFast);
const emaSlow = ema(pricesForEma, F.emaSlow);
const emaState = (emaFast != null && emaSlow != null) ? (emaFast > emaSlow ? "UP" : "DOWN") : "NA";

// ブレイク：直近の価格サンプルから“最近の高値”を作る
const recentWindow = lastN(h.prices, Math.max(20, F.emaSlow));
const recentHigh = recentWindow.length ? Math.max(...recentWindow) : price;
const breakoutLine = recentHigh * (1 + (S.breakoutPct / 100));
const isBreakout = price >= breakoutLine;

// 候補抽出（地形）
const pass =
  price > 0 &&
  price <= F.maxPrice &&
  volume >= F.minVolume &&
  rangePct >= F.minRangePct &&
  volRatio >= F.minVolRatio;

if(pass) candidates++;

// 取引状態（仮想）
const pos = state.positions[q.symbol];
const posInfo = evaluatePosition(q.symbol, price);

// BUY条件：候補抽出 + EMA上向き + ブレイク
const buyCondition = pass && emaState === "UP" && isBreakout;

// BUY発火：既にOPENが無い時のみ建てる
if(buyCondition && (!pos || pos.status !== "OPEN")){
  openPosition(q.symbol, price);
}

// BUY発火後に再評価（SL/TP反映）
const posInfo2 = evaluatePosition(q.symbol, price);

// 表示用：状態
const status = (posInfo2.statusLabel !== "NONE") ? posInfo2.statusLabel : (buyCondition ? "BUY" : (pass ? "WATCH" : "NONE"));

// ログ：状態変化のみ
maybeLogSignal(q.symbol, status, price, q.changePct, volume, rangePct, volRatio, emaFast, emaSlow, isBreakout);

out.push({
  symbol: q.symbol,
  price,
  changePct: q.changePct,
  volume,
  volRatio,
  rangePct,
  emaFast,
  emaSlow,
  emaState,
  breakout: isBreakout,
  breakoutLine,
  pass,
  status,
  pos: state.positions[q.symbol] || null,
  posEval: posInfo2,
});

}

els.countTotal.textContent = String(quotes.length);
els.countCandidates.textContent = String(candidates);

// 表示順：OPENポジション > BUY > WATCH > その他
const rank = (x) => {
if(x.pos && x.pos.status === "OPEN") return 0;
if(x.status === "BUY") return 1;
if(x.status === "TAKE_PROFIT") return 2;
if(x.status === "STOP") return 3;
if(x.status === "WATCH") return 4;
return 9;
};

out.sort((a,b) => {
const ra = rank(a), rb = rank(b);
if(ra !== rb) return ra - rb;
return (b.volRatio - a.volRatio) || (b.rangePct - a.rangePct) || (a.symbol.localeCompare(b.symbol));
});

return out;
}

function openPosition(symbol, entryPrice){
const stopPct = state.settings.signals.stopPct / 100;
const takePct = state.settings.signals.takePct / 100;
const sl = entryPrice * (1 - stopPct);
const tp = entryPrice * (1 + takePct);

state.positions[symbol] = {
entry: entryPrice,
sl,
tp,
openedAtISO: nowISO(),
status: "OPEN",
lastSignalISO: nowISO(),
};

saveStore();

addLog({
t: fmtTimeJP(new Date()),
symbol,
type: "OPEN",
status: "BUY",
price: round(entryPrice, 2),
note: 仮想エントリー（SL ${round(sl,2)} / TP ${round(tp,2)}）
});
}

function closePosition(symbol, reason, price){
const pos = state.positions[symbol];
if(!pos || pos.status !== “OPEN”) return;

pos.status = reason; // CLOSED_TP or CLOSED_SL
pos.closedAtISO = nowISO();
pos.closedPrice = price;
saveStore();

addLog({
t: fmtTimeJP(new Date()),
symbol,
type: "CLOSE",
status: (reason === "CLOSED_TP" ? "TAKE_PROFIT" : "STOP"),
price: round(price, 2),
note: reason === "CLOSED_TP" ? "TP到達（仮想）" : "SL到達（仮想）"
});
}

function evaluatePosition(symbol, currentPrice){
const pos = state.positions[symbol];
if(!pos) return { statusLabel: "NONE" };

if(pos.status !== "OPEN"){
return {
statusLabel: (pos.status === "CLOSED_TP") ? "TAKE_PROFIT" : (pos.status === "CLOSED_SL" ? "STOP" : "NONE"),
sl: pos.sl,
tp: pos.tp
};
}

// OPENの場合、TP/SL到達で自動クローズ（仮想）
if(currentPrice >= pos.tp){
closePosition(symbol, "CLOSED_TP", currentPrice);
return { statusLabel: "TAKE_PROFIT", sl: pos.sl, tp: pos.tp };
}
if(currentPrice <= pos.sl){
closePosition(symbol, "CLOSED_SL", currentPrice);
return { statusLabel: "STOP", sl: pos.sl, tp: pos.tp };
}

return { statusLabel: "OPEN", sl: pos.sl, tp: pos.tp };
}

function maybeLogSignal(symbol, status, price, changePct, volume, rangePct, volRatio, emaFast, emaSlow, breakout){
// 連発ログを避ける：同一symbolで前回と違う状態だけ記録
const key = adj_last_status_${symbol.toUpperCase()};
const prev = sessionStorage.getItem(key);
if(prev === status) return;

sessionStorage.setItem(key, status);

if(status === "NONE") return;

const label = status;
addLog({
t: fmtTimeJP(new Date()),
symbol,
type: "SIGNAL",
status: label,
price: round(price, 2),
note: chg ${round(changePct,2)}% / vol ${volume} / range ${round(rangePct,2)}% / vRatio ${round(volRatio,2)} / EMA ${fmtEma(emaFast,emaSlow)} / brk ${breakout ? "Y" : "N"}
});
}

function fmtEma(a,b){
if(!Number.isFinite(a) || !Number.isFinite(b)) return "NA";
return ${round(a,2)}>${round(b,2)};
}

/* ===========================
Render
=========================== */

function badge(status){
const span = document.createElement("span");
span.className = "badge";

if(status === "BUY"){
span.classList.add("good");
span.textContent = "BUY";
return span;
}
if(status === "WATCH"){
span.classList.add("warn");
span.textContent = "WATCH";
return span;
}
if(status === "OPEN"){
span.classList.add("info");
span.textContent = "OPEN";
return span;
}
if(status === "TAKE_PROFIT"){
span.classList.add("info");
span.textContent = "TP";
return span;
}
if(status === "STOP"){
span.classList.add("bad");
span.textContent = "SL";
return span;
}
span.textContent = "-";
return span;
}

function render(rows){
els.resultBody.innerHTML = "";

for(const r of rows){
const tr = document.createElement("tr");

// 状態（OPENは最優先）
const statusLabel = (r.pos && r.pos.status === "OPEN") ? "OPEN" : r.status;

tr.appendChild(tdNode(badge(statusLabel)));

tr.appendChild(tdText(r.symbol, true));

tr.appendChild(tdText(num(r.price,2), false, true));
tr.appendChild(tdText(num(r.changePct,2), false));

tr.appendChild(tdText(intFmt(r.volume), true));
tr.appendChild(tdText(num(r.volRatio,2), false));

tr.appendChild(tdText(num(r.rangePct,2), false));
tr.appendChild(tdText(r.emaState === "NA" ? "NA" : (r.emaState === "UP" ? "UP" : "DOWN"), true));

tr.appendChild(tdText(r.breakout ? "Y" : "N", true));

const sl = r.posEval && Number.isFinite(r.posEval.sl) ? r.posEval.sl : (r.pos ? r.pos.sl : null);
const tp = r.posEval && Number.isFinite(r.posEval.tp) ? r.posEval.tp : (r.pos ? r.pos.tp : null);
const st = (sl && tp) ? `${round(sl,2)} / ${round(tp,2)}` : "-";
tr.appendChild(tdText(st, true));

els.resultBody.appendChild(tr);

}
}

function tdText(text, mono=false, right=false){
const td = document.createElement("td");
td.textContent = text;
if(mono) td.classList.add("mono");
if(right) td.style.textAlign = "right";
return td;
}
function tdNode(node){
const td = document.createElement("td");
td.appendChild(node);
return td;
}

function num(n, d=2){
const x = safeNumber(n, 0);
return round(x,d).toFixed(d);
}
function intFmt(n){
const x = Math.floor(safeNumber(n,0));
return x.toLocaleString("ja-JP");
}

function renderLogs(){
const logs = loadLogs();
els.logWrap.innerHTML = "";

if(logs.length === 0){
const div = document.createElement("div");
div.className = "small";
div.textContent = "ログなし";
els.logWrap.appendChild(div);
return;
}

for(const it of logs){
const wrap = document.createElement("div");
wrap.className = "logItem";

const line = document.createElement("div");
line.className = "logLine";

const left = document.createElement("div");
left.className = "logLeft";

const b = badge(it.status);
left.appendChild(b);

const t = document.createElement("span");
t.className = "kv";
t.textContent = it.t;
left.appendChild(t);

const s = document.createElement("span");
s.className = "kv";
s.textContent = it.symbol;
left.appendChild(s);

const p = document.createElement("span");
p.className = "kv";
p.textContent = `¥${it.price}`;
left.appendChild(p);

const type = document.createElement("span");
type.className = "kv";
type.textContent = it.type;
left.appendChild(type);

const note = document.createElement("div");
note.className = "small";
note.textContent = it.note || "";

line.appendChild(left);
wrap.appendChild(line);
wrap.appendChild(note);

els.logWrap.appendChild(wrap);

}
}

/* ===========================
Auto refresh
=========================== */

function startAuto(){
if(state.timer) clearInterval(state.timer);
const ms = clamp(state.settings.refreshSec, 3, 60) * 1000;
state.timer = setInterval(refreshOnce, ms);
state.auto = true;
updateAutoUI();
}
function stopAuto(){
if(state.timer) clearInterval(state.timer);
state.timer = null;
state.auto = false;
updateAutoUI();
}

/* ===========================
PWA: service worker + install
=========================== */

async function initSW(){
if(!(“serviceWorker” in navigator)) return;
try{
await navigator.serviceWorker.register("./sw.js");
}catch(e){}
}

function initInstallPrompt(){
window.addEventListener(“beforeinstallprompt”, (e) => {
e.preventDefault();
state.installPrompt = e;
els.btnInstall.disabled = false;
els.btnInstall.classList.add("primary");
});

els.btnInstall.addEventListener("click", async () => {
if(!state.installPrompt) return;
state.installPrompt.prompt();
try{
await state.installPrompt.userChoice;
}catch(e){}
state.installPrompt = null;
els.btnInstall.disabled = true;
els.btnInstall.classList.remove("primary");
});
}

/* ===========================
Events
=========================== */

els.providerSelect.addEventListener("change", () => {
applySettingsFromUI();
saveStore();
setStatus("プロバイダ変更。必要ならキー/URLを設定。", "muted");
});

els.btnSaveSettings.addEventListener("click", () => {
applySettingsFromUI();
saveStore();
setStatus("設定保存OK", "good");
});

els.btnSaveSymbols.addEventListener("click", () => {
applySettingsFromUI();
saveStore();
setStatus(銘柄保存OK（${state.settings.symbols.length}件）, "good");
});

els.btnLoadSample.addEventListener(“click”, () => {
// 低位株の“例”。実運用はひろさんの監視ユニバースに差し替え。
const sample = [
"2134.T","2315.T","2330.T","2345.T","2353.T","2370.T","2375.T",
"2687.T","2929.T","3010.T","3011.T","3031.T","3070.T","3071.T",
"3315.T","3521.T","3664.T","3666.T","3823.T","3853.T","3907.T",
"4180.T","4182.T","4594.T","4764.T","4777.T","4833.T","5017.T",
"5216.T","5955.T","6072.T","6298.T","6335.T","6731.T","6993.T",
"7527.T","7615.T","7707.T","7777.T","8013.T","8105.T","8202.T",
"8411.T","8410.T","8558.T","8746.T","8894.T","9424.T","9878.T"
];
els.symbolsText.value = sample.join("\n");
applySettingsFromUI();
saveStore();
setStatus("低位株サンプル投入（例）。必要に応じて編集して保存。", "warn");
});

els.btnClearLogs.addEventListener("click", () => {
clearLogs();
setStatus("ログ消去", "muted");
});

els.btnRefresh.addEventListener("click", refreshOnce);

els.btnAuto.addEventListener("click", () => {
applySettingsFromUI();
saveStore();
if(state.auto) stopAuto();
else startAuto();
});

window.addEventListener("visibilitychange", () => {
// バックグラウンドでの過剰更新を避ける
if(document.hidden && state.auto){
stopAuto();
setStatus("バックグラウンド → 自動更新停止", "muted");
}
});

/* ===========================
Boot
=========================== */

function boot(){
loadStore();
syncUIFromState();
initSW();
initInstallPrompt();

// 初回表示
refreshOnce();
}

boot();
