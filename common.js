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

// ================= 萬能新舊融合排行榜 (獨一無二個人排行版) =================
async function loadGlobalLeaderboard(csvUrl, newRecord = null) {
  const dailyBoard = document.getElementById("daily-board");
  const allTimeBoard = document.getElementById("alltime-board");
  if (!dailyBoard || !allTimeBoard) return;

  let currentUnit = "unknown";
  let path = window.location.pathname.toLowerCase();
  if (path.includes("trig")) currentUnit = "trig";
  else if (path.includes("space")) currentUnit = "space";
  else if (path.includes("perm")) currentUnit = "perm";

  const urlParams = new URLSearchParams(window.location.search);
  let currentMode = urlParams.get("mode") || "normal";
  let limit = currentMode === "hell" ? 3 : 5;
  let boardStyle =
    currentMode === "hell"
      ? "background: #111; color: #ff4d4d; border: 1px solid #c0392b; padding: 10px; border-radius: 10px; box-shadow: 0 0 10px rgba(192, 57, 43, 0.3);"
      : "";

  try {
    let combinedRanks = [];

    // --- A. 抓取 Firebase 實時紀錄 ---
    if (typeof firebase !== "undefined") {
      const db = firebase.firestore();
      const snapshot = await db
        .collection("game_records")
        .where("unit", "==", currentUnit)
        .where("mode", "==", currentMode)
        .get();
      snapshot.forEach((doc) => {
        let data = doc.data();
        let ts = data.timestamp ? data.timestamp.toDate() : new Date();
        combinedRanks.push({ n: data.name, s: data.score, dateObj: ts });
      });
    }

    // --- B. 抓取舊 CSV ---
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

    // --- C. 加入剛剛遊玩的新紀錄 (若是結算畫面呼叫) ---
    if (newRecord)
      combinedRanks.push({
        n: newRecord.n,
        s: newRecord.s,
        dateObj: new Date(),
      });

    // ==========================================
    // ✨ D. 核心魔法：過濾重複玩家，只保留個人的最高分！
    // ==========================================
    function getUniqueTopRanks(ranksArray) {
      let map = new Map();
      ranksArray.forEach((r) => {
        // 如果這個人還沒被記錄，或是他這次的分數比之前記錄的還要高，就更新！
        if (!map.has(r.n) || r.s > map.get(r.n).s) {
          map.set(r.n, r);
        }
      });
      // 將 Map 轉回陣列，並由高到低排序
      return Array.from(map.values()).sort((a, b) => b.s - a.s);
    }

    // --- E. 分別處理「今日」與「歷史」的獨一無二榜單 ---
    let now = new Date();
    let isSameDay = (d1, d2) =>
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate();

    let dailyRanks = combinedRanks.filter((r) => isSameDay(r.dateObj, now));
    let finalDaily = getUniqueTopRanks(dailyRanks);
    let finalAllTime = getUniqueTopRanks(combinedRanks);

    // ==========================================
    // ✨ F. 抓出玩家自己的最高紀錄與名次！
    // ==========================================
    const myName =
      localStorage.getItem("mathGamePlayerName") ||
      (newRecord ? newRecord.n : null);
    let myBestScore = null;
    let myRank = null;

    if (myName && myName !== "Guest" && myName !== "---") {
      // 找出自己的名字在全服排行榜的第幾個位置 (陣列從 0 開始，所以名次要 +1)
      let myRecordIdx = finalAllTime.findIndex((r) => r.n === myName);
      if (myRecordIdx !== -1) {
        myRank = myRecordIdx + 1;
        myBestScore = finalAllTime[myRecordIdx].s;
      }
    }

    // --- G. 渲染 UI ---
    let titleDaily = `🌟 今日單元 Top ${limit}`;
    let titleAllTime =
      currentMode === "hell"
        ? `🏆 歷史地獄 Top ${limit}`
        : `🏆 歷史單元 Top ${limit}`;

    // 渲染今日榜單
    if (currentMode === "hell") {
      dailyBoard.style.display = "none";
    } else {
      dailyBoard.style.display = "";
      let daily = finalDaily.slice(0, limit);
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

    // 渲染歷史榜單
    let allTime = finalAllTime.slice(0, limit);
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

    // ==========================================
    // ✨ H. 將個人紀錄掛在歷史榜單最下方
    // ==========================================
    if (myName && myName !== "Guest" && myName !== "---") {
      let modeTextColor = currentMode === "hell" ? "#bdc3c7" : "#7f8c8d";
      let borderColor = currentMode === "hell" ? "#c0392b" : "#bdc3c7";

      if (myRank !== null) {
        let myRankColor = myRank <= limit ? "#27ae60" : "#e74c3c"; // 若排進前幾名用綠色，否則紅色
        allTimeHtml += `
          <div style="margin-top: 12px; padding-top: 10px; border-top: 2px dashed ${borderColor}; font-size: 13px; color: ${modeTextColor}; text-align: center; line-height: 1.6;">
            🙋‍♂️ 我的最高: <span style="color: #e67e22; font-weight: bold; font-size: 14px;">${myBestScore}</span> 分 
            <br>
            ( 🏆 全服第 <span style="color: ${myRankColor}; font-weight: bold; font-size: 14px;">${myRank}</span> 名 )
          </div>`;
      } else {
        allTimeHtml += `
          <div style="margin-top: 12px; padding-top: 10px; border-top: 2px dashed ${borderColor}; font-size: 13px; color: ${modeTextColor}; text-align: center;">
            🙋‍♂️ 尚未留下您的足跡
          </div>`;
      }
    }

    allTimeBoard.innerHTML = allTimeHtml;
    if (currentMode === "hell") allTimeBoard.style = boardStyle;
  } catch (err) {
    console.error(err);
  }
}

// ================= 數學與 UI 工具 =================
function formatMathHTML(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(/√(\d*)/g, (match, num) => {
    return `<span class="sqrt-box"><div class="sqrt-tick"><svg viewBox="0 0 50 100" preserveAspectRatio="none"><path d="M 5 60 L 15 60 L 30 95 L 48 5"/></svg></div><span class="sqrt-num">${num}</span></span>`;
  });
}

function evalMath(str) {
  if (!str) return NaN;
  let s = str
    .replace(/\s+/g, "")
    .replace(/\{/g, "(")
    .replace(/\}/g, ")")
    .replace(/√(\d+(\.\d+)?)/g, "Math.sqrt($1)");
  try {
    return new Function(`return ${s}`)();
  } catch (e) {
    return NaN;
  }
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

// ✨ 動態生成虛擬鍵盤
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

// 📦 萬能上傳函數
async function uploadGameRecord(
  status,
  score,
  errorLogMap,
  isHellMode,
  correctCount = 0,
  wrongCount = 0
) {
  if (typeof firebase === "undefined") return Promise.reject("Firebase 未載入");
  const db = firebase.firestore();

  let name = document.getElementById("ui-name")
    ? document.getElementById("ui-name").innerText
    : "Guest";
  if (name === "---" || !name) name = "Guest";
  const playerUid = localStorage.getItem("mathGamePlayerUid") || "guest";

  let wrongQuestionsArray = [];
  if (errorLogMap && typeof errorLogMap.forEach === "function") {
    errorLogMap.forEach((data, qStr) => {
      if (data) {
        wrongQuestionsArray.push({
          question: qStr.replace(/<[^>]*>?/gm, ""),
          answer: data.ans,
          hint: data.hint || "無提示",
        });
      }
    });
  }

  let currentUnit = "unknown";
  let path = window.location.pathname.toLowerCase();
  if (path.includes("trig")) currentUnit = "trig";
  else if (path.includes("space")) currentUnit = "space";
  else if (path.includes("perm")) currentUnit = "perm";
  else if (path.includes("practice")) currentUnit = "practice";

  let currentMode = isHellMode ? "hell" : "normal";
  if (currentUnit === "practice") currentMode = "mixed";

  const recordData = {
    uid: playerUid,
    name: name,
    unit: currentUnit,
    mode: currentMode,
    score: score,
    status: status,
    wrongLog: wrongQuestionsArray,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    correctCount: correctCount,
    wrongCount: wrongCount,
  };

  return db.collection("game_records").add(recordData);
}

// ================= 📊 單元專屬：平均分數計算引擎 =================
async function loadUnitAverageLeaderboard() {
  const avgBoardContainer = document.getElementById("unit-avg-board");
  const avgListEl = document.getElementById("unit-avg-list");
  if (!avgBoardContainer || !avgListEl) return;

  let currentUnit = "unknown";
  let path = window.location.pathname.toLowerCase();
  if (path.includes("trig")) currentUnit = "trig";
  else if (path.includes("space")) currentUnit = "space";
  else if (path.includes("perm")) currentUnit = "perm";

  const urlParams = new URLSearchParams(window.location.search);
  let currentMode = urlParams.get("mode") || "normal";

  if (currentMode === "hell") {
    document.getElementById("unit-avg-title").innerHTML = "💀 地獄平均 Top 3";
    document.getElementById("unit-avg-title").style.color = "#ff4d4d";
    avgBoardContainer.style.background = "#111";
    avgBoardContainer.style.border = "1px solid #c0392b";
  }

  try {
    if (typeof firebase === "undefined") return;
    const db = firebase.firestore();
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
      if (stats.count >= 3)
        avgArray.push({ name: name, avgScore: avg, playCount: stats.count });
    }

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
// ==========================================
// 🚀 Firebase 雲端資料庫初始化 (防撞名安全版)
// ==========================================
if (typeof firebase !== "undefined" && !firebase.apps.length) {
  firebase.initializeApp({
    apiKey: "AIzaSyC7ed0il_ScCdHeWOHepj56ycjRXYt_Mf4",
    authDomain: "mathgame-6ab85.firebaseapp.com",
    projectId: "mathgame-6ab85",
    storageBucket: "mathgame-6ab85.firebasestorage.app",
    messagingSenderId: "790458098592",
    appId: "1:790458098592:web:298e23dbb8ba82a3ee3ac5",
  });
}
