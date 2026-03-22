// ==========================================
// 🚀 0. Firebase 雲端資料庫模組 (全域共用)
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

// ==========================================
// 🧠 1. 等級計算大腦
// ==========================================
function calculateLevel(exp) {
  const e = Number(exp) || 0;
  if (e <= 0) return 1;
  return Math.floor(Math.sqrt(e / 100)) + 1;
}

async function fetchPlayerStatsFromHistory(uid) {
  if (!uid || uid === "guest") return { totalExp: 0, level: 1 };
  try {
    const db = firebase.firestore();
    const snapshot = await db
      .collection("game_records")
      .where("uid", "==", uid)
      .get();
    let totalExp = 0;
    snapshot.forEach((doc) => {
      const s = Number(doc.data().score) || 0;
      if (s > 0) totalExp += s;
    });
    return { totalExp, level: calculateLevel(totalExp) };
  } catch (err) {
    console.error("統計歷史失敗:", err);
    return { totalExp: 0, level: 1 };
  }
}

// ================= 2. 萬能上傳函數 (支援錯題消滅系統) =================
async function uploadGameRecord(
  status,
  score,
  errorLogMap,
  isHellMode,
  correctCount = 0,
  wrongCount = 0,
  resolvedLogMap = null // ✨ 新增這把武器：消滅清單
) {
  if (typeof firebase === "undefined") return Promise.reject("Firebase 未載入");
  const db = firebase.firestore();

  let user = null;
  if (firebase.auth && typeof firebase.auth === "function")
    user = firebase.auth().currentUser;

  const playerUid = user
    ? user.uid
    : localStorage.getItem("mathGamePlayerUid") || "guest";
  let name = document.getElementById("ui-name")
    ? document.getElementById("ui-name").innerText
    : "Guest";
  if (name === "---" || !name)
    name = localStorage.getItem("mathGamePlayerName") || "Guest";

  let wrongLog = [];
  if (errorLogMap && typeof errorLogMap.forEach === "function") {
    errorLogMap.forEach((data, qStr) => {
      wrongLog.push({
        question: String(qStr),
        answer: data.ans,
        hint: data.hint || "無提示",
      });
    });
  }

  // ✨ 整理被消滅的錯題 (徹底解除圖形封印)
  let resolvedLog = [];
  if (resolvedLogMap && typeof resolvedLogMap.forEach === "function") {
    resolvedLogMap.forEach((count, qStr) => {
      resolvedLog.push({
        question: String(qStr),
        count: Number(count),
      });
    });
  }

  let unit = "unknown";
  let path = window.location.pathname.toLowerCase();
  if (path.includes("trig")) unit = "trig";
  else if (path.includes("space")) unit = "space";
  else if (path.includes("perm")) unit = "perm";
  else if (path.includes("practice")) unit = "practice";
  else if (path.includes("review")) unit = "review"; // ✨ 弱點特訓專屬標記

  const recordData = {
    uid: playerUid,
    name: name,
    unit: unit,
    mode: isHellMode ? "hell" : unit === "practice" ? "mixed" : "normal",
    score: Number(score),
    status: status,
    wrongLog: wrongLog,
    resolvedLog: resolvedLog, // ✨ 把消滅紀錄存進雲端！
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    correctCount: Number(correctCount),
    wrongCount: Number(wrongCount),
    level: localStorage.getItem("mathGamePlayerLevel") || 1,
  };

  return db
    .collection("game_records")
    .add(recordData)
    .then(async () => {
      if (playerUid !== "guest" && Number(score) > 0) {
        db.collection("users")
          .doc(playerUid)
          .set(
            {
              exp: firebase.firestore.FieldValue.increment(Number(score)),
            },
            { merge: true }
          )
          .catch((e) => console.warn("EXP 更新失敗", e));

        // 世界 Boss 傷害存錢筒...
        const bossRef = db.collection("global").doc("boss_state");
        try {
          await db.runTransaction(async (t) => {
            const doc = await t.get(bossRef);
            let bData = doc.exists
              ? doc.data()
              : { level: 1, totalDamage: 0, playerMap: {}, pastMVPs: {} };
            let day = new Date().getDay();
            let isBonus = false;
            if ((day === 1 || day === 4) && unit === "trig") isBonus = true;
            if ((day === 2 || day === 5) && unit === "space") isBonus = true;
            if ((day === 3 || day === 6) && unit === "perm") isBonus = true;
            if (day === 0) isBonus = true;
            let dmg = Number(score);
            if (isBonus) dmg = Math.floor(dmg * 1.25);
            if (isHellMode) dmg *= 2;
            let maxHp = 500000 + (bData.level - 1) * 200000;
            bData.totalDamage = (bData.totalDamage || 0) + dmg;
            if (!bData.playerMap) bData.playerMap = {};
            if (!bData.playerMap[playerUid])
              bData.playerMap[playerUid] = { name: name, damage: 0 };
            bData.playerMap[playerUid].damage += dmg;
            bData.playerMap[playerUid].name = name;

            if (bData.totalDamage >= maxHp) {
              let mvp = null,
                maxD = -1;
              for (let uid in bData.playerMap) {
                if (bData.playerMap[uid].damage > maxD) {
                  maxD = bData.playerMap[uid].damage;
                  mvp = uid;
                }
              }
              const titles = [
                "🗡️ 死神終結者",
                "⚔️ 混沌斬裂者",
                "🌌 虛空粉碎者",
                "🌀 維度主宰",
                "📐 幾何救世主",
                "👁️ 真理超越者",
                "👑 傳說中的弒神者",
              ];
              let tIdx = Math.min(bData.level - 1, titles.length - 1);
              if (mvp) {
                if (!bData.pastMVPs) bData.pastMVPs = {};
                bData.pastMVPs[mvp] = {
                  title: titles[tIdx],
                  level: bData.level,
                };
              }
              bData.level += 1;
              bData.totalDamage = bData.totalDamage - maxHp;
              bData.playerMap = {};
              if (bData.totalDamage > 0)
                bData.playerMap[playerUid] = {
                  name: name,
                  damage: bData.totalDamage,
                };
            }
            t.set(bossRef, bData);
          });
        } catch (e) {}
      }
    });
}

// ==========================================
// 🏆 3. 萬能排行榜 (Firebase + CSV + 排名與等級)
// ==========================================
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

async function loadGlobalLeaderboard(csvUrl, newRecord = null) {
  const dailyBoard = document.getElementById("daily-board");
  const allTimeBoard = document.getElementById("alltime-board");
  if (!dailyBoard || !allTimeBoard) return;

  const urlParams = new URLSearchParams(window.location.search);
  let currentMode = urlParams.get("mode") || "normal";
  let limit = currentMode === "hell" ? 3 : 5;

  let combinedRanks = [];
  const myName = localStorage.getItem("mathGamePlayerName");

  let unit = "trig";
  if (window.location.pathname.toLowerCase().includes("space")) unit = "space";
  if (window.location.pathname.toLowerCase().includes("perm")) unit = "perm";

  // --- A. 抓取 Firebase 紀錄 ---
  try {
    if (typeof firebase !== "undefined") {
      const db = firebase.firestore();
      const snapshot = await db
        .collection("game_records")
        .where("unit", "==", unit)
        .where("mode", "==", currentMode)
        .get();
      snapshot.forEach((doc) => {
        let d = doc.data();
        let ts = d.timestamp ? d.timestamp.toDate() : new Date();
        combinedRanks.push({
          n: d.name,
          s: d.score,
          dateObj: ts,
          uid: d.uid,
          lvl: null,
        });
      });
    }
  } catch (e) {
    console.warn("Firebase 讀取受阻，跳過:", e);
  }

  // --- B. 抓取舊 CSV 紀錄 ---
  if (csvUrl && csvUrl.startsWith("http")) {
    try {
      let res = await fetch(csvUrl + "&t=" + new Date().getTime(), {
        cache: "no-store",
      });
      let text = await res.text();
      let csvData = parseCSV(text);
      for (let i = 1; i < csvData.length; i++) {
        if (csvData[i].length >= 3) {
          let scoreRaw = parseInt(csvData[i][2]);
          if (!isNaN(scoreRaw)) {
            let csvDate = new Date(csvData[i][0] || "");
            if (isNaN(csvDate.getTime())) csvDate = new Date("2000-01-01"); // 防禦無效日期
            combinedRanks.push({
              n: (csvData[i][1] || "").split(" (")[0].trim(),
              s: scoreRaw,
              dateObj: csvDate,
              uid: null,
              lvl: null,
            });
          }
        }
      }
    } catch (e) {
      console.warn("CSV 讀取受阻，跳過:", e);
    }
  }

  if (newRecord) {
    combinedRanks.push({
      n: newRecord.n,
      s: newRecord.s,
      dateObj: new Date(),
      uid: localStorage.getItem("mathGamePlayerUid") || "guest",
      lvl: null,
    });
  }

  // --- C. 排序與去重複 ---
  let now = new Date();
  const processMap = (data, isDaily = false) => {
    let map = new Map();
    data
      .sort((a, b) => b.s - a.s)
      .forEach((r) => {
        if (
          isDaily &&
          (!r.dateObj ||
            isNaN(r.dateObj.getTime()) ||
            r.dateObj.toDateString() !== now.toDateString())
        )
          return;
        if (!map.has(r.n) || r.s > map.get(r.n).s) map.set(r.n, r);
      });
    return Array.from(map.values()).sort((a, b) => b.s - a.s);
  };

  let fullDailyList = processMap(combinedRanks, true);
  let fullAllTimeList = processMap(combinedRanks, false);

  // --- D. 會員等級同步 ---
  const syncLevels = async (list) => {
    let topList = list.slice(0, limit);
    let myEntry = list.find((r) => r.n === myName);
    let syncTargets = [...topList];
    if (myEntry && !topList.includes(myEntry)) syncTargets.push(myEntry);

    const tasks = syncTargets
      .filter((p) => p.uid && p.uid !== "guest")
      .map(async (player) => {
        try {
          const hSnap = await firebase
            .firestore()
            .collection("game_records")
            .where("uid", "==", player.uid)
            .get();
          let totalExp = 0;
          hSnap.forEach((d) => {
            totalExp += Number(d.data().score) || 0;
          });
          player.lvl = calculateLevel(totalExp);
        } catch (e) {}
      });
    await Promise.all(tasks);
    return { topList, myEntry, fullList: list };
  };

  const dailyData = await syncLevels(fullDailyList);
  const allTimeData = await syncLevels(fullAllTimeList);

  // --- E. 渲染 UI ---
  const renderBoard = (dataObj, title, isHell, fullList) => {
    const { topList, myEntry } = dataObj;
    let html = `<h3 style="${isHell ? "color:#ff4d4d" : ""}">${title}</h3>`;

    if (!topList.length) {
      html +=
        "<div class='board-row' style='justify-content:center;'>尚無挑戰者</div>";
    } else {
      topList.forEach((r, i) => {
        let lvlBadge =
          r.uid && r.uid !== "guest" && r.lvl
            ? `<span style="background:#f39c12; color:white; font-size:10px; padding:1px 5px; border-radius:6px; margin-left:6px;">Lv.${r.lvl}</span>`
            : "";
        html += `<div class="board-row" style="border-bottom: 1px solid #eee"><span>${
          i + 1
        }. ${r.n}${lvlBadge}</span><strong>${r.s}</strong></div>`;
      });
    }

    if (myName && myName !== "Guest" && myEntry) {
      let myRank = fullList.findIndex((r) => r.n === myName) + 1;
      let myRankColor = myRank <= limit ? "#2ecc71" : "#f1c40f";
      let myLvlBadge =
        myEntry.uid && myEntry.uid !== "guest" && myEntry.lvl
          ? `<span style="background:#f39c12; color:white; font-size:10px; padding:1px 5px; border-radius:6px; margin-left:4px;">Lv.${myEntry.lvl}</span>`
          : "";

      html += `
        <div style="margin-top: 8px; padding-top: 6px; border-top: 1px dashed #ccc; font-size: 11.5px; color: #2c3e50; text-align: left;">
          🙋‍♂️ 我的最高: <span style="color: #f39c12; font-weight: bold;">${myEntry.s}</span> ${myLvlBadge}
          <span style="opacity:0.8; float:right;">(排名第 <span style="color: ${myRankColor}; font-weight: bold;">${myRank}</span>)</span>
        </div>`;
    } else if (myName && myName !== "Guest") {
      html += `<div style="margin-top: 8px; padding-top: 6px; border-top: 1px dashed #eee; font-size: 11px; color: #95a5a6;">🙋‍♂️ 尚未留下紀錄</div>`;
    }
    return html;
  };

  if (currentMode !== "hell") {
    dailyBoard.innerHTML = renderBoard(
      dailyData,
      `🌟 今日 Top ${limit}`,
      false,
      fullDailyList
    );
    dailyBoard.style.display = "";
  } else {
    dailyBoard.style.display = "none";
  }
  allTimeBoard.innerHTML = renderBoard(
    allTimeData,
    currentMode === "hell"
      ? `🏆 歷史地獄 Top ${limit}`
      : `🏆 歷史單元 Top ${limit}`,
    currentMode === "hell",
    fullAllTimeList
  );
}

// ==========================================
// 📊 4. 單元平均分數計算引擎
// ==========================================
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
      if (stats.count >= 3) {
        avgArray.push({ name: name, avgScore: avg, playCount: stats.count });
      }
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
    avgListEl.innerHTML = `<span style="color: #e74c3c;">連線失敗</span>`;
  }
}

// ==========================================
// 🛠️ 5. 數學與 UI 工具
// ==========================================
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

// ==========================================
// 🎵 6. 音效引擎
// ==========================================
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

// ==========================================
// ⌨️ 7. 動態虛擬鍵盤
// ==========================================
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
