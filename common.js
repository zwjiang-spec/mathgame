// ================= 共用工具與排行榜 =================
function parseCSV(text) {
  let p = "",
    row = [""],
    ret = [row],
    i = 0,
    r = 0,
    s = !0,
    l;
  for (l of text) {
    if ('"' === l) {
      if (s && l === p) row[i] += l;
      s = !s;
    } else if ("," === l && s) l = row[++i] = "";
    else if ("\n" === l && s) {
      if ("\r" === p) row[i] = row[i].slice(0, -1);
      row = ret[++r] = [(l = "")];
      i = 0;
    } else row[i] += l;
    p = l;
  }
  return ret;
}

// ================= 萬能新舊融合排行榜 (地獄視覺版) =================
async function loadGlobalLeaderboard(csvUrl, newRecord = null) {
  const dailyBoard = document.getElementById("daily-board");
  const allTimeBoard = document.getElementById("alltime-board");

  if (!dailyBoard || !allTimeBoard) return;

  // 1. 自動判斷目前的單元與模式
  let currentUnit = "unknown";
  let path = window.location.pathname.toLowerCase();
  if (path.includes("trig")) currentUnit = "trig";
  else if (path.includes("space")) currentUnit = "space";
  else if (path.includes("perm")) currentUnit = "perm";

  const urlParams = new URLSearchParams(window.location.search);
  let currentMode = urlParams.get("mode") || "normal";

  // ✨ 地獄模式設定：只顯示前 3 名，一般模式顯示前 5 名
  let limit = currentMode === "hell" ? 3 : 5;

  // ✨ 地獄模式樣式：深色背景、紅字
  let boardStyle =
    currentMode === "hell"
      ? "background: #111; color: #ff4d4d; border: 1px solid #c0392b; padding: 10px; border-radius: 10px; box-shadow: 0 0 10px rgba(192, 57, 43, 0.3);"
      : "";

  try {
    let combinedRanks = [];

    // --- A. 抓取 Firebase 實時紀錄 ---
    if (typeof firebase !== "undefined") {
      const db = firebase.firestore(); // ✨ 關鍵鑰匙：告訴它資料庫在哪裡！
      const snapshot = await db
        .collection("game_records")
        .where("unit", "==", currentUnit)
        .where("mode", "==", currentMode)
        .get();

      snapshot.forEach((doc) => {
        let data = doc.data();
        // 確保有抓到時間戳記，如果是剛上傳還在緩衝的，就用當下時間
        let ts = data.timestamp ? data.timestamp.toDate() : new Date();
        combinedRanks.push({
          n: data.name,
          s: data.score,
          dateObj: ts,
        });
      });
    }

    // --- B. 抓取舊 CSV (地獄模式通常不抓 CSV) ---
    if (csvUrl && csvUrl.startsWith("http")) {
      try {
        let res = await fetch(csvUrl + "&t=" + new Date().getTime(), {
          cache: "no-store",
        });
        let text = await res.text();
        let csvData = parseCSV(text);
        for (let i = 1; i < csvData.length; i++) {
          if (csvData[i].length >= 3) {
            let timeStr = csvData[i][0] || "";
            let nameRaw = csvData[i][1] || "";
            let scoreRaw = parseInt(csvData[i][2]);
            if (!isNaN(scoreRaw)) {
              combinedRanks.push({
                n: nameRaw.split(" (")[0].trim(),
                s: scoreRaw,
                dateObj: new Date(timeStr),
              });
            }
          }
        }
      } catch (e) {
        console.warn("CSV 載入失敗");
      }
    }

    if (newRecord)
      combinedRanks.push({
        n: newRecord.n,
        s: newRecord.s,
        dateObj: new Date(),
      });

    // --- D. 排序 (允許重複上榜) ---
    let finalRanks = combinedRanks.sort((a, b) => b.s - a.s);

    // --- E. 渲染 UI ---
    let now = new Date();
    let isSameDay = (d1, d2) =>
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate();

    // ✨ 自動判斷標題文字 (一般模式 vs 地獄模式)
    let titleDaily = `🌟 今日單元 Top ${limit}`; // 地獄模式不用今日標題了
    let titleAllTime =
      currentMode === "hell"
        ? `🏆 歷史地獄 Top ${limit}`
        : `🏆 歷史單元 Top ${limit}`;

    // --- 今日排行榜渲染 (地獄模式直接隱藏) ---
    if (currentMode === "hell") {
      dailyBoard.style.display = "none"; // 💀 地獄模式：把今日榜單變不見
    } else {
      dailyBoard.style.display = ""; // 🌱 一般模式：恢復顯示
      let daily = finalRanks
        .filter((r) => isSameDay(r.dateObj, now))
        .slice(0, limit);
      let dailyHtml = `<h3>${titleDaily}</h3>`;
      if (daily.length === 0)
        dailyHtml +=
          "<div class='board-row' style='justify-content:center;'>尚無挑戰者</div>";
      daily.forEach((r, i) => {
        dailyHtml += `<div class="board-row" style="border-bottom: 1px solid #eee"><span>${
          i + 1
        }. ${r.n}</span><strong>${r.s}</strong></div>`;
      });
      dailyBoard.innerHTML = dailyHtml;
    }

    // --- 歷史排行榜渲染 (大家都有) ---
    let allTime = finalRanks.slice(0, limit);
    let allTimeHtml = `<h3 style="${
      currentMode === "hell" ? "color:#ff4d4d" : ""
    }">${titleAllTime}</h3>`;
    if (allTime.length === 0)
      allTimeHtml +=
        "<div class='board-row' style='justify-content:center;'>尚無挑戰者</div>";
    allTime.forEach((r, i) => {
      allTimeHtml += `<div class="board-row" style="border-bottom: 1px solid ${
        currentMode === "hell" ? "#333" : "#eee"
      }"><span>${i + 1}. ${r.n}</span><strong>${r.s}</strong></div>`;
    });
    allTimeBoard.innerHTML = allTimeHtml;
    if (currentMode === "hell") allTimeBoard.style = boardStyle;
  } catch (err) {
    console.error(err);
  }
}

// ================= 數學與 UI 工具 =================
function formatMathHTML(str) {
  return str.replace(/√(\d*)/g, (match, num) => {
    return `<span class="sqrt-box"><div class="sqrt-tick"><svg viewBox="0 0 50 100" preserveAspectRatio="none"><path d="M 5 60 L 15 60 L 30 95 L 48 5"/></svg></div><span class="sqrt-num">${num}</span></span>`;
  });
}

function evalMath(str) {
  if (!str) return NaN;
  let parts = str.split("/");
  if (parts.length > 2) return NaN;
  let num = parsePart(parts[0]);
  let den = parts.length === 2 ? parsePart(parts[1]) : 1;
  if (den === 0 || isNaN(den)) return NaN;
  return num / den;
}
function parsePart(p) {
  if (!p) return NaN;
  let sign = 1;
  if (p.startsWith("-")) {
    sign = -1;
    p = p.substring(1);
  }
  if (p === "") return NaN;
  if (p.startsWith("√")) {
    let inner = p.substring(1);
    if (inner === "") return NaN;
    let val = parseFloat(inner);
    return isNaN(val) ? NaN : sign * Math.sqrt(val);
  }
  let val = parseFloat(p);
  return isNaN(val) ? NaN : sign * val;
}

function showToast(msg, duration = 2000) {
  const toast = document.getElementById("toast");
  toast.innerHTML = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), duration);
}

function flashScoreRed() {
  const scoreElement = document.getElementById("ui-score");
  scoreElement.style.color = "#e74c3c";
  setTimeout(() => (scoreElement.style.color = "var(--color-gold)"), 300);
}

function spawnComboParticle() {
  const startEl = document.getElementById("input-box");
  const endEl = document.getElementById("combo-gauge-text");
  if (!startEl || !endEl) return;
  const startRect = startEl.getBoundingClientRect();
  const endRect = endEl.getBoundingClientRect();
  const particle = document.createElement("div");
  particle.innerText = "+1";
  particle.style.position = "fixed";
  particle.style.left = startRect.left + startRect.width / 2 + "px";
  particle.style.top = startRect.top + "px";
  particle.style.transform = "translate(-50%, -50%)";
  particle.style.color = getComputedStyle(document.body).getPropertyValue(
    "--color-gold"
  );
  particle.style.fontWeight = "900";
  particle.style.fontSize = "26px";
  particle.style.textShadow = "0 0 10px #f1c40f";
  particle.style.zIndex = "9999";
  particle.style.pointerEvents = "none";
  particle.style.transition =
    "all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
  document.body.appendChild(particle);
  void particle.offsetWidth;
  particle.style.left = endRect.left + endRect.width / 2 + "px";
  particle.style.top = endRect.top + endRect.height / 2 + "px";
  particle.style.opacity = "0";
  particle.style.transform = "translate(-50%, -50%) scale(0.2)";
  setTimeout(() => {
    particle.remove();
  }, 400);
}

// ================= 音效引擎 =================
let audioCtx;
function initAudio() {
  if (!audioCtx)
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
}
function playTone(freq, type, duration, vol = 0.1) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(
    0.00001,
    audioCtx.currentTime + duration
  );
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}
function playCorrect() {
  playTone(600, "sine", 0.1);
  setTimeout(() => playTone(800, "sine", 0.2), 100);
}
function playWrong() {
  playTone(200, "sawtooth", 0.3, 0.2);
}
function playTick() {
  playTone(1000, "square", 0.05, 0.02);
}
function playFeverCorrect() {
  if (!audioCtx) return;
  playTone(800, "sine", 0.05);
  setTimeout(() => playTone(1000, "sine", 0.05), 60);
  setTimeout(() => playTone(1200, "sine", 0.1), 120);
}

// ✨ 動態生成虛擬鍵盤 (支援一般/地獄模式無縫切換)
function renderKeypad(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `
      <div class="key" onclick="input('7')">7</div>
      <div class="key" onclick="input('8')">8</div>
      <div class="key" onclick="input('9')">9</div>
      <div class="key key-del" onclick="input('DEL')">
        <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"></path><line x1="18" y1="9" x2="12" y2="15"></line><line x1="12" y1="9" x2="18" y2="15"></line></svg>
      </div>
      
      <div class="key" onclick="input('4')">4</div>
      <div class="key" onclick="input('5')">5</div>
      <div class="key" onclick="input('6')">6</div>
      <div class="key key-sqrt" onclick="input('√')" title="根號">
        <span class="sqrt-box" style="font-size: 1.2em">
          <div class="sqrt-tick">
            <svg viewBox="0 0 50 100" preserveAspectRatio="none">
              <path d="M 5 60 L 15 60 L 30 95 L 48 5" stroke="currentColor" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </div>
          <span class="sqrt-num" style="min-width: 0.6em"></span>
        </span>
      </div>
      
      <div class="key" onclick="input('1')">1</div>
      <div class="key" onclick="input('2')">2</div>
      <div class="key" onclick="input('3')">3</div>
      <div class="key key-blue" onclick="input('-')">-</div>
      
      <div class="key" onclick="input('0')">0</div>
      <div class="key key-blue" onclick="input('/')">/</div>
      <div class="key key-blue normal-key" style="grid-column: span 2; font-size: 32px" onclick="input(',')">,</div>
      <div class="key key-blue hell-key" onclick="input('(')">(</div>
      <div class="key key-blue hell-key" onclick="input(')')">)</div>
      
      <div class="key key-enter normal-key" style="grid-column: span 4" onclick="submitAnswer()">ENTER</div>
      <div class="key key-blue hell-key" style="grid-column: span 2" onclick="input('+')">+</div>
      <div class="key key-enter hell-key" style="grid-column: span 2" onclick="submitAnswer()">ENTER</div>
    `;
}
// ==========================================
// 🚀 Firebase 雲端資料庫模組 (全域共用)
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyC7ed0il_ScCdHeWOHepj56ycjRXYt_Mf4",
  authDomain: "mathgame-6ab85.firebaseapp.com",
  projectId: "mathgame-6ab85",
  storageBucket: "mathgame-6ab85.firebasestorage.app",
  messagingSenderId: "790458098592",
  appId: "1:790458098592:web:298e23dbb8ba82a3ee3ac5",
};

// 確保 Firebase 只被初始化一次
if (typeof firebase !== "undefined" && !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// 📦 萬能上傳函數 (支援所有遊戲、所有模式、死亡與過關)
function uploadGameRecord(status, currentScore, errMap, hellModeFlag) {
  if (typeof firebase === "undefined") return Promise.reject("Firebase 未載入");
  const db = firebase.firestore();

  let name = document.getElementById("ui-name")
    ? document.getElementById("ui-name").innerText
    : "Guest";
  if (name === "---" || !name) name = "Guest";
  const playerUid = localStorage.getItem("mathGamePlayerUid") || "guest";

  let wrongQuestionsArray = [];
  if (errMap && typeof errMap.forEach === "function") {
    errMap.forEach((data, qStr) => {
      // ✨ 增加防呆：確保 data 存在且有內容
      if (data) {
        wrongQuestionsArray.push({
          question: qStr.replace(/<[^>]*>?/gm, ""),
          answer: data.ans ? data.ans.replace(/<[^>]*>?/gm, "") : "無解答",
          hint: data.hint || "無提示",
        });
      }
    });
  }

  // 🤖 自動判斷單元 (支援 practice 混合模式)
  let currentUnit = "unknown";
  let path = window.location.pathname.toLowerCase();
  if (path.includes("trig")) currentUnit = "trig";
  else if (path.includes("space")) currentUnit = "space";
  else if (path.includes("perm")) currentUnit = "perm";
  else if (path.includes("practice")) currentUnit = "practice";

  let currentMode = hellModeFlag ? "hell" : "normal";
  if (currentUnit === "practice") currentMode = "mixed";

  const recordData = {
    uid: playerUid,
    name: name,
    unit: currentUnit,
    mode: currentMode,
    score: currentScore,
    status: status,
    wrongLog: wrongQuestionsArray,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
  };

  return db.collection("game_records").add(recordData);
}
// ==========================================
// 📊 單元專屬：平均分數計算引擎 (common.js)
// ==========================================
async function loadUnitAverageLeaderboard() {
  const avgBoardContainer = document.getElementById("unit-avg-board");
  const avgListEl = document.getElementById("unit-avg-list");
  if (!avgBoardContainer || !avgListEl) return;

  // 1. 自動判斷目前的單元與模式
  let currentUnit = "unknown";
  let path = window.location.pathname.toLowerCase();
  if (path.includes("trig")) currentUnit = "trig";
  else if (path.includes("space")) currentUnit = "space";
  else if (path.includes("perm")) currentUnit = "perm";

  const urlParams = new URLSearchParams(window.location.search);
  let currentMode = urlParams.get("mode") || "normal";

  // 如果是地獄模式，可以改變標題顏色
  if (currentMode === "hell") {
    document.getElementById("unit-avg-title").innerHTML = "💀 地獄平均 Top 3";
    document.getElementById("unit-avg-title").style.color = "#ff4d4d";
    avgBoardContainer.style.background = "#111";
    avgBoardContainer.style.border = "1px solid #c0392b";
  }

  try {
    if (typeof firebase === "undefined") return;
    const db = firebase.firestore();

    // 只抓「這個單元」且「這個模式」的成績
    const snapshot = await db
      .collection("game_records")
      .where("unit", "==", currentUnit)
      .where("mode", "==", currentMode)
      .get();

    let userStats = {};
    snapshot.forEach((doc) => {
      let data = doc.data();
      let name = data.name;
      let score = data.score || 0;

      if (name === "Guest" || name === "---" || !name) return;

      if (!userStats[name]) userStats[name] = { totalScore: 0, count: 0 };
      userStats[name].totalScore += score;
      userStats[name].count += 1;
    });

    let avgArray = [];
    let currentUserAvg = "尚無紀錄";
    const currentSavedName = localStorage.getItem("mathGamePlayerName");

    for (let name in userStats) {
      let stats = userStats[name];
      let avg = Math.round(stats.totalScore / stats.count);

      if (name === currentSavedName) currentUserAvg = avg;

      if (stats.count >= 3) {
        avgArray.push({ name: name, avgScore: avg, playCount: stats.count });
      }
    }

    // 顯示玩家自己在「這個單元」的平均分數
    const myAvgBadge = document.getElementById("my-unit-avg");
    if (myAvgBadge && currentSavedName) {
      myAvgBadge.style.display = "inline-block";
      myAvgBadge.innerText = `我的平均: ${currentUserAvg}`;
    }

    avgArray.sort((a, b) => b.avgScore - a.avgScore);
    let top3 = avgArray.slice(0, 3);

    if (top3.length === 0) {
      avgListEl.innerHTML = `<span style="color: #ccc; font-size: 12px; margin: 0 auto;">尚無符合資格的強者</span>`;
      return;
    }

    let html = "";
    let medals = ["🥇", "🥈", "🥉"];
    top3.forEach((player, index) => {
      html += `
          <div style="background: rgba(0,0,0,0.2); padding: 6px 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); display: flex; flex-direction: column; align-items: center; flex: 1; min-width: 0;">
            <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 2px;">
              <span style="font-size: 13px;">${medals[index]}</span>
              <span style="font-weight: bold; font-size: 12px; max-width: 60px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${player.name}">${player.name}</span>
            </div>
            <div style="display: flex; align-items: baseline; gap: 4px;">
              <span style="color: #f1c40f; font-weight: 900; font-size: 16px; line-height: 1;">${player.avgScore}</span>
              <span style="font-size: 10px; color: #95a5a6;">(${player.playCount}場)</span>
            </div>
          </div>
        `;
    });
    avgListEl.innerHTML = html;
  } catch (error) {
    console.error("讀取平均成績失敗:", error);
    avgListEl.innerHTML = `<span style="color: #e74c3c;">連線失敗</span>`;
  }
}
