const GLOBAL_TITLES = [
  { min: 0, name: "初心者", color: "#95a5a6" },
  { min: 300, name: "狙擊手", color: "#3498db" },
  { min: 600, name: "預言家", color: "#9b59b6" },
  { min: 1000, name: "煉金師", color: "#e67e22" },
  { min: 1500, name: "戰神", color: "#df22e6" },
  { min: 2000, name: "至尊", color: "#c0392b" },
];
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

// ================= 2. 萬能上傳函數 (支援錯題消滅系統 & 對戰 1.5 倍) =================
async function uploadGameRecord(
  status,
  score,
  errorLogMap,
  isHellMode,
  correctCount = 0,
  wrongCount = 0,
  resolvedLogMap = null
) {
  if (typeof firebase === "undefined") return Promise.reject("Firebase 未載入");
  const db = firebase.firestore();

  // ✨ 偵測是否為雙人對戰模式
  const urlParams = new URLSearchParams(window.location.search);
  const isBattleMode = urlParams.get("mode") === "battle";

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

  let resolvedLog = [];
  if (resolvedLogMap && typeof resolvedLogMap.forEach === "function") {
    resolvedLogMap.forEach((count, qStr) => {
      resolvedLog.push({ question: String(qStr), count: Number(count) });
    });
  }

  let unit = "unknown";
  let path = window.location.pathname.toLowerCase();
  if (path.includes("trig")) unit = "trig";
  else if (path.includes("space")) unit = "space";
  else if (path.includes("perm")) unit = "perm";
  else if (path.includes("practice")) unit = "practice";
  else if (path.includes("review")) unit = "review";

  const recordData = {
    uid: playerUid,
    name: name,
    unit: unit,
    mode: isBattleMode
      ? "battle"
      : isHellMode
      ? "hell"
      : unit === "practice"
      ? "mixed"
      : "normal", // ✨ 記錄為戰鬥模式
    score: Number(score),
    status: status,
    wrongLog: wrongLog,
    resolvedLog: resolvedLog,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    correctCount: Number(correctCount),
    wrongCount: Number(wrongCount),
    level: localStorage.getItem("mathGamePlayerLevel") || 1,
  };

  return db
    .collection("game_records")
    .add(recordData)
    .then(async () => {
      if (playerUid !== "guest") {
        // ✨ 經驗值 1.5 倍結算！
        let baseExp = Number(score) > 0 ? Number(score) : 0;
        if (isBattleMode) baseExp = Math.floor(baseExp * 1.5);
        let expAdd = baseExp;

        let currentLvl = localStorage.getItem("mathGamePlayerLevel") || 1;
        let userUpdates = {
          exp: firebase.firestore.FieldValue.increment(expAdd),
          level: Number(currentLvl),
          total_plays: firebase.firestore.FieldValue.increment(1),
          total_correct: firebase.firestore.FieldValue.increment(
            Number(correctCount) || 0
          ),
          total_wrong: firebase.firestore.FieldValue.increment(
            Number(wrongCount) || 0
          ),
          [`${unit}_plays`]: firebase.firestore.FieldValue.increment(1),
          [`${unit}_correct`]: firebase.firestore.FieldValue.increment(
            Number(correctCount) || 0
          ),
          [`${unit}_wrong`]: firebase.firestore.FieldValue.increment(
            Number(wrongCount) || 0
          ),
          [`${unit}_score`]: firebase.firestore.FieldValue.increment(
            Number(score) || 0
          ),
        };

        db.collection("users")
          .doc(playerUid)
          .set(userUpdates, { merge: true })
          .catch((e) => console.warn("玩家數據更新失敗", e));

        // 💀 世界 Boss 傷害存錢筒...
        const bossRef = db.collection("global").doc("boss_state");
        try {
          await db.runTransaction(async (t) => {
            const doc = await t.get(bossRef);
            let bData = doc.exists
              ? doc.data()
              : {
                  level: 1,
                  totalDamage: 0,
                  playerMap: {},
                  pastMVPs: {},
                  cooldownUntil: 0,
                };

            let day = new Date().getDay();
            let isBonus = false;
            if ((day === 1 || day === 4) && unit === "trig") isBonus = true;
            if ((day === 2 || day === 5) && unit === "space") isBonus = true;
            if ((day === 3 || day === 6) && unit === "perm") isBonus = true;
            if (day === 0) isBonus = true;

            // ✨ 傷害加成計算 (避免玩家負分幫王補血)
            let dmg = Math.max(0, Number(score));
            if (isBonus) dmg = Math.floor(dmg * 1.25);
            if (isHellMode) dmg *= 2;
            if (isBattleMode) dmg = Math.floor(dmg * 1.5); // 🔥 對戰專屬 1.5 倍爆擊！

            let level = bData.level || 1;
            let totalDmg = bData.totalDamage || 0;
            let pMap = bData.playerMap || {};
            let pastMVPs = bData.pastMVPs || {};
            let cooldownUntil = bData.cooldownUntil || 0;

            let newTotalDmg = totalDmg + dmg;
            let maxHp = 500000 + (level - 1) * 200000;
            let updates = {};

            if (
              newTotalDmg >= maxHp &&
              (!cooldownUntil || Date.now() > cooldownUntil)
            ) {
              let excessDamage = newTotalDmg - maxHp;
              pMap[playerUid] = pMap[playerUid] || { name: name, damage: 0 };
              pMap[playerUid].damage += dmg - excessDamage;
              pMap[playerUid].name = name;

              let sortedPlayers = Object.keys(pMap)
                .map((k) => ({
                  uid: k,
                  name: pMap[k].name,
                  damage: pMap[k].damage,
                }))
                .sort((a, b) => b.damage - a.damage);
              let top3 = sortedPlayers.slice(0, 3);
              let mvp = sortedPlayers[0];

              const titles = [
                "🗡️ 死神終結者",
                "⚔️ 混沌斬裂者",
                "🌌 虛空粉碎者",
                "🌀 維度主宰",
                "📐 幾何救世主",
                "👁️ 真理超越者",
                "👑 傳說中的弒神者",
              ];
              let tIdx = Math.min(level - 1, titles.length - 1);
              if (mvp)
                pastMVPs[mvp.uid] = { title: titles[tIdx], level: level };

              updates.level = level + 1;
              updates.cooldownUntil = Date.now() + 3 * 24 * 60 * 60 * 1000;
              updates.lastTop3 = top3;
              updates.totalDamage = excessDamage;
              updates.pastMVPs = pastMVPs;
              updates.playerMap = {
                [playerUid]: { name: name, damage: excessDamage },
              };
            } else {
              pMap[playerUid] = pMap[playerUid] || { name: name, damage: 0 };
              pMap[playerUid].damage += dmg;
              pMap[playerUid].name = name;
              updates.totalDamage = newTotalDmg;
              updates.playerMap = pMap;
            }
            t.set(bossRef, updates, { merge: true });
          });
        } catch (e) {
          console.warn("更新世界Boss資料失敗", e);
        }
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
          globalMax: undefined, // 預留位置給全域最高分
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
            if (isNaN(csvDate.getTime())) csvDate = new Date("2000-01-01");
            combinedRanks.push({
              n: (csvData[i][1] || "").split(" (")[0].trim(),
              s: scoreRaw,
              dateObj: csvDate,
              uid: null,
              lvl: null,
              globalMax: undefined,
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
      globalMax: undefined,
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

  // --- D. 會員身分大調查 (極速省電版 ⚡) ---
  const syncLevels = async (list) => {
    let topList = list.slice(0, limit);
    let myEntry = list.find((r) => r.n === myName);
    let syncTargets = [...topList];
    if (myEntry && !topList.includes(myEntry)) syncTargets.push(myEntry);

    const tasks = syncTargets
      .filter((p) => p.uid && p.uid !== "guest")
      .map(async (player) => {
        try {
          const db =
            typeof firebase !== "undefined" ? firebase.firestore() : null;
          if (!db) return;

          // ✨ 極速讀取：直接看使用者的身分證 (1次讀取)，絕不去翻歷史成績單
          const userDoc = await db.collection("users").doc(player.uid).get();

          if (userDoc.exists) {
            let userData = userDoc.data();
            // ✨ 三段式校正：身分證等級 -> Exp換算 -> 保底Lv1
            player.lvl =
              userData.level ||
              (userData.exp ? calculateLevel(userData.exp) : 1);
            player.globalMax =
              userData.globalMaxScore !== undefined
                ? userData.globalMaxScore
                : player.s;
          } else {
            player.lvl = 1;
            player.globalMax = player.s;
          }
        } catch (e) {
          console.warn("身分調查失敗", e);
          player.lvl = 1;
          player.globalMax = player.s;
        }
      });
    await Promise.all(tasks);
    return { topList, myEntry, fullList: list };
  };

  const dailyData = await syncLevels(fullDailyList);
  const allTimeData = await syncLevels(fullAllTimeList);

  // --- E. 渲染 UI (加入稱號徽章與戰力面板點擊) ---
  const renderBoard = (dataObj, title, isHell, fullList) => {
    const { topList, myEntry } = dataObj;
    let html = `<h3 style="${isHell ? "color:#ff4d4d" : ""}">${title}</h3>`;

    const getTitleHtml = (score) => {
      let pTitle = GLOBAL_TITLES[0];
      for (let i = GLOBAL_TITLES.length - 1; i >= 0; i--) {
        if (score >= GLOBAL_TITLES[i].min) {
          pTitle = GLOBAL_TITLES[i];
          break;
        }
      }
      return `<span style="background: ${pTitle.color}; color: white; font-size: 9px; padding: 2px 5px; border-radius: 6px; font-weight: bold; white-space: nowrap; box-shadow: 0 1px 2px rgba(0,0,0,0.3); margin-right: 4px; vertical-align: middle;">${pTitle.name}</span>`;
    };

    if (!topList.length) {
      html +=
        "<div class='board-row' style='justify-content:center;'>尚無挑戰者</div>";
    } else {
      topList.forEach((r, i) => {
        let lvlBadge =
          r.uid && r.uid !== "guest" && r.lvl
            ? `<span style="background:#f39c12; color:white; font-size:10px; padding:1px 5px; border-radius:6px; margin-left:6px; vertical-align: middle;">Lv.${r.lvl}</span>`
            : "";

        let currentMax = r.globalMax !== undefined ? r.globalMax : r.s;
        let titleBadge = getTitleHtml(currentMax);

        // ✨ 名字加上 onClick 觸發戰力面板
        html += `<div class="board-row" style="border-bottom: 1px solid #eee; display: flex; align-items: center; padding: 4px 0;">
                   <div style="flex: 1; display: flex; align-items: center; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;">
                     <span style="margin-right: 4px;">${i + 1}.</span>
                     ${titleBadge}
                     <span style="overflow: hidden; text-overflow: ellipsis; cursor: pointer; text-decoration: underline; text-underline-offset: 2px;" onclick="showPlayerStats('${
                       r.uid
                     }', '${r.n}')">${r.n}</span>
                     ${lvlBadge}
                   </div>
                   <strong style="margin-left: 8px;">${r.s}</strong>
                 </div>`;
      });
    }

    if (myName && myName !== "Guest" && myEntry) {
      let myRank = fullList.findIndex((r) => r.n === myName) + 1;
      let myRankColor = myRank <= limit ? "#2ecc71" : "#f1c40f";
      let myLvlBadge =
        myEntry.uid && myEntry.uid !== "guest" && myEntry.lvl
          ? `<span style="background:#f39c12; color:white; font-size:10px; padding:1px 5px; border-radius:6px; margin-left:4px; vertical-align: middle;">Lv.${myEntry.lvl}</span>`
          : "";

      let myMax =
        myEntry.globalMax !== undefined ? myEntry.globalMax : myEntry.s;
      let myTitleBadge = getTitleHtml(myMax);

      html += `
        <div style="margin-top: 8px; padding-top: 6px; border-top: 1px dashed #ccc; font-size: 11.5px; color: #2c3e50; text-align: left;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span>🙋‍♂️ 我的最高: <span style="color: #f39c12; font-weight: bold;">${myEntry.s}</span></span>
            <span style="opacity:0.8;">(排名第 <span style="color: ${myRankColor}; font-weight: bold;">${myRank}</span>)</span>
          </div>
          <div style="margin-top: 5px; display: flex; align-items: center;">
            ${myTitleBadge} ${myLvlBadge}
          </div>
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
// ==========================================
// 📊 8. 玩家戰力偵測面板 (極速省電版 + 場均分 🚀)
// ==========================================
async function showPlayerStats(uid, playerName) {
  if (!uid || uid === "guest" || uid === "null") {
    alert("⚠️ 這位玩家是神秘的訪客，無法查看詳細資料！");
    return;
  }

  // 1. 建立並顯示黑色的彈出視窗 (Modal)
  let modal = document.getElementById("player-stats-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "player-stats-modal";
    modal.style.cssText =
      "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 9999; display: flex; justify-content: center; align-items: center; opacity: 0; transition: opacity 0.3s; pointer-events: none;";
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div style="background: #1a1a2e; border: 2px solid #3498db; border-radius: 15px; padding: 20px; width: 85%; max-width: 350px; color: white; text-align: left; box-shadow: 0 10px 30px rgba(52, 152, 219, 0.4); position: relative;">
      <span onclick="document.getElementById('player-stats-modal').style.opacity='0'; setTimeout(()=>document.getElementById('player-stats-modal').style.pointerEvents='none',300);" style="position: absolute; top: 10px; right: 15px; font-size: 24px; cursor: pointer; color: #bdc3c7;">&times;</span>
      <h2 style="margin: 0 0 5px 0; color: #3498db; border-bottom: 1px solid #2c3e50; padding-bottom: 10px;">📊 玩家戰力雷達</h2>
      <div style="margin-top: 15px; text-align: center;">
        <span style="font-size: 20px; font-weight: bold; color: #ecf0f1;">${playerName}</span>
        <div id="stats-loading" style="color: #f1c40f; font-size: 13px; margin-top: 10px;">📡 正在連線偵測戰力...</div>
      </div>
      <div id="stats-content" style="display: none; margin-top: 15px;"></div>
    </div>
  `;

  modal.style.pointerEvents = "auto";
  modal.style.opacity = "1";

  // 2. 📡 僅花費 1 次讀取去拿他的身分證！
  try {
    const db = firebase.firestore();
    const userDoc = await db.collection("users").doc(uid).get();

    if (userDoc.exists) {
      let d = userDoc.data();

      // 計算答對率的公式
      const calcAcc = (c, w) => {
        let total = (c || 0) + (w || 0);
        return total === 0 ? "0%" : Math.round((c / total) * 100) + "%";
      };

      // ✨ 計算場均分的公式 (防呆處理舊玩家資料)
      const calcAvg = (totalScore, plays) => {
        if (!plays || plays === 0) return "尚無紀錄";
        if (totalScore === undefined) return "需再打一場解鎖"; // 舊玩家的防呆提示
        return Math.round(totalScore / plays) + " 分";
      };

      let totalPlays = d.total_plays || 0;
      let lvl = d.level || 1;

      let trigAcc = calcAcc(d.trig_correct, d.trig_wrong);
      let spaceAcc = calcAcc(d.space_correct, d.space_wrong);
      let permAcc = calcAcc(d.perm_correct, d.perm_wrong);

      let trigAvg = calcAvg(d.trig_score, d.trig_plays);
      let spaceAvg = calcAvg(d.space_score, d.space_plays);
      let permAvg = calcAvg(d.perm_score, d.perm_plays);

      document.getElementById("stats-loading").style.display = "none";
      document.getElementById("stats-content").style.display = "block";
      document.getElementById("stats-content").innerHTML = `
        <div style="display: flex; justify-content: space-between; background: rgba(255,255,255,0.1); padding: 8px 12px; border-radius: 8px; margin-bottom: 8px;">
          <span style="color: #bdc3c7;">🌟 當前等級</span>
          <span style="color: #f1c40f; font-weight: bold;">Lv. ${lvl}</span>
        </div>
        <div style="display: flex; justify-content: space-between; background: rgba(255,255,255,0.1); padding: 8px 12px; border-radius: 8px; margin-bottom: 8px;">
          <span style="color: #bdc3c7;">🎮 總遊玩局數</span>
          <span style="color: #fff; font-weight: bold;">${totalPlays} 局</span>
        </div>
        
        <div style="display: flex; flex-direction: column; background: rgba(39, 174, 96, 0.15); padding: 8px 12px; border-radius: 8px; margin-bottom: 8px; border-left: 3px solid #27ae60;">
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #27ae60; font-weight: bold;">📐 三角比答對率</span>
            <span style="color: #fff; font-weight: bold;">${trigAcc}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-top: 4px; font-size: 13px;">
            <span style="color: rgba(255,255,255,0.6);">⚡ 場均得分</span>
            <span style="color: #f1c40f; font-weight: bold;">${trigAvg}</span>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; background: rgba(142, 68, 173, 0.15); padding: 8px 12px; border-radius: 8px; margin-bottom: 8px; border-left: 3px solid #8e44ad;">
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #8e44ad; font-weight: bold;">🚀 空間坐標答對率</span>
            <span style="color: #fff; font-weight: bold;">${spaceAcc}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-top: 4px; font-size: 13px;">
            <span style="color: rgba(255,255,255,0.6);">⚡ 場均得分</span>
            <span style="color: #f1c40f; font-weight: bold;">${spaceAvg}</span>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; background: rgba(22, 160, 133, 0.15); padding: 8px 12px; border-radius: 8px; margin-bottom: 8px; border-left: 3px solid #16a085;">
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #16a085; font-weight: bold;">🎲 排列組合答對率</span>
            <span style="color: #fff; font-weight: bold;">${permAcc}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-top: 4px; font-size: 13px;">
            <span style="color: rgba(255,255,255,0.6);">⚡ 場均得分</span>
            <span style="color: #f1c40f; font-weight: bold;">${permAvg}</span>
          </div>
        </div>
      `;
    } else {
      document.getElementById("stats-loading").innerText =
        "⚠️ 找不到這位玩家的詳細資料！";
    }
  } catch (err) {
    document.getElementById("stats-loading").innerText =
      "⚠️ 連線失敗，無法偵測戰力！";
  }
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
          globalMax: undefined, // 預留位置給全域最高分
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
            if (isNaN(csvDate.getTime())) csvDate = new Date("2000-01-01");
            combinedRanks.push({
              n: (csvData[i][1] || "").split(" (")[0].trim(),
              s: scoreRaw,
              dateObj: csvDate,
              uid: null,
              lvl: null,
              globalMax: undefined,
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
      globalMax: undefined,
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

  // --- D. 會員身分大調查 (極速省電版 ⚡) ---
  const syncLevels = async (list) => {
    let topList = list.slice(0, limit);
    let myEntry = list.find((r) => r.n === myName);
    let syncTargets = [...topList];
    if (myEntry && !topList.includes(myEntry)) syncTargets.push(myEntry);

    const tasks = syncTargets
      .filter((p) => p.uid && p.uid !== "guest")
      .map(async (player) => {
        try {
          const db =
            typeof firebase !== "undefined" ? firebase.firestore() : null;
          if (!db) return;

          // ✨ 極速讀取：直接看使用者的身分證 (1次讀取)，絕不去翻歷史成績單
          const userDoc = await db.collection("users").doc(player.uid).get();

          if (userDoc.exists) {
            let userData = userDoc.data();
            // ✨ 三段式校正：身分證等級 -> Exp換算 -> 保底Lv1
            player.lvl =
              userData.level ||
              (userData.exp ? calculateLevel(userData.exp) : 1);
            player.globalMax =
              userData.globalMaxScore !== undefined
                ? userData.globalMaxScore
                : player.s;
          } else {
            player.lvl = 1;
            player.globalMax = player.s;
          }
        } catch (e) {
          console.warn("身分調查失敗", e);
          player.lvl = 1;
          player.globalMax = player.s;
        }
      });
    await Promise.all(tasks);
    return { topList, myEntry, fullList: list };
  };

  const dailyData = await syncLevels(fullDailyList);
  const allTimeData = await syncLevels(fullAllTimeList);

  // --- E. 渲染 UI (加入稱號徽章與戰力面板點擊) ---
  const renderBoard = (dataObj, title, isHell, fullList) => {
    const { topList, myEntry } = dataObj;
    let html = `<h3 style="${isHell ? "color:#ff4d4d" : ""}">${title}</h3>`;

    const getTitleHtml = (score) => {
      let pTitle = GLOBAL_TITLES[0];
      for (let i = GLOBAL_TITLES.length - 1; i >= 0; i--) {
        if (score >= GLOBAL_TITLES[i].min) {
          pTitle = GLOBAL_TITLES[i];
          break;
        }
      }
      return `<span style="background: ${pTitle.color}; color: white; font-size: 9px; padding: 2px 5px; border-radius: 6px; font-weight: bold; white-space: nowrap; box-shadow: 0 1px 2px rgba(0,0,0,0.3); margin-right: 4px; vertical-align: middle;">${pTitle.name}</span>`;
    };

    if (!topList.length) {
      html +=
        "<div class='board-row' style='justify-content:center;'>尚無挑戰者</div>";
    } else {
      topList.forEach((r, i) => {
        let lvlBadge =
          r.uid && r.uid !== "guest" && r.lvl
            ? `<span style="background:#f39c12; color:white; font-size:10px; padding:1px 5px; border-radius:6px; margin-left:6px; vertical-align: middle;">Lv.${r.lvl}</span>`
            : "";

        let currentMax = r.globalMax !== undefined ? r.globalMax : r.s;
        let titleBadge = getTitleHtml(currentMax);

        // ✨ 名字加上 onClick 觸發戰力面板
        html += `<div class="board-row" style="border-bottom: 1px solid #eee; display: flex; align-items: center; padding: 4px 0;">
                   <div style="flex: 1; display: flex; align-items: center; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;">
                     <span style="margin-right: 4px;">${i + 1}.</span>
                     ${titleBadge}
                     <span style="overflow: hidden; text-overflow: ellipsis; cursor: pointer; text-decoration: underline; text-underline-offset: 2px;" onclick="showPlayerStats('${
                       r.uid
                     }', '${r.n}')">${r.n}</span>
                     ${lvlBadge}
                   </div>
                   <strong style="margin-left: 8px;">${r.s}</strong>
                 </div>`;
      });
    }

    if (myName && myName !== "Guest" && myEntry) {
      let myRank = fullList.findIndex((r) => r.n === myName) + 1;
      let myRankColor = myRank <= limit ? "#2ecc71" : "#f1c40f";
      let myLvlBadge =
        myEntry.uid && myEntry.uid !== "guest" && myEntry.lvl
          ? `<span style="background:#f39c12; color:white; font-size:10px; padding:1px 5px; border-radius:6px; margin-left:4px; vertical-align: middle;">Lv.${myEntry.lvl}</span>`
          : "";

      let myMax =
        myEntry.globalMax !== undefined ? myEntry.globalMax : myEntry.s;
      let myTitleBadge = getTitleHtml(myMax);

      html += `
        <div style="margin-top: 8px; padding-top: 6px; border-top: 1px dashed #ccc; font-size: 11.5px; color: #2c3e50; text-align: left;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span>🙋‍♂️ 我的最高: <span style="color: #f39c12; font-weight: bold;">${myEntry.s}</span></span>
            <span style="opacity:0.8;">(排名第 <span style="color: ${myRankColor}; font-weight: bold;">${myRank}</span>)</span>
          </div>
          <div style="margin-top: 5px; display: flex; align-items: center;">
            ${myTitleBadge} ${myLvlBadge}
          </div>
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
// 🛡️ 9. 名稱查重與專屬綁定系統 (修復同機訪客漏洞版 ⚡)
// ==========================================
async function validateAndClaimName(desiredName) {
  // 1. 基礎防呆：Guest 不用查，直接過
  if (
    !desiredName ||
    desiredName.toUpperCase() === "GUEST" ||
    desiredName === "---"
  ) {
    return { valid: true };
  }

  // 取得目前玩家的 UID
  let user =
    firebase.auth && typeof firebase.auth === "function"
      ? firebase.auth().currentUser
      : null;
  const myUid = user
    ? user.uid
    : localStorage.getItem("mathGamePlayerUid") || "guest";

  // 2. ✨ 漏洞修復：VIP 快速通關「只限有登入的人」！訪客 (guest) 絕對要查庫！
  if (myUid !== "guest") {
    const savedName = localStorage.getItem("mathGamePlayerName");
    if (desiredName === savedName) {
      return { valid: true };
    }
  }

  const db = typeof firebase !== "undefined" ? firebase.firestore() : null;
  if (!db) return { valid: true };

  try {
    let isTaken = false;

    // 3. 核心查重：去 users 表找有沒有人登記了這個名字
    const userSnap = await db
      .collection("users")
      .where("name", "==", desiredName)
      .limit(1)
      .get();

    userSnap.forEach((doc) => {
      // 如果找到這名字，而且這張身分證不是我本人的，代表被搶走了！
      if (doc.id !== myUid) {
        isTaken = true;
      }
    });

    // ❌ 發現名字被「已登入的人」專屬綁定了：絕對擋下！
    if (isTaken) {
      return {
        valid: false,
        msg: `⚠️ 「${desiredName}」這個名稱已經被已登入的勇者專屬綁定了！請換一個名稱喔。`,
      };
    }

    // ✅ 驗證通過：
    // 如果是「有登入」的玩家，把這個新名字寫入他的身分證，正式宣示主權！
    if (myUid !== "guest") {
      await db
        .collection("users")
        .doc(myUid)
        .set({ name: desiredName }, { merge: true });
    }

    return { valid: true };
  } catch (e) {
    console.warn("名稱驗證受阻", e);
    return { valid: true }; // 防呆放行
  }
}
// ==========================================
// ⚔️ 10. 隨機配對與連線對戰引擎 (免登入 + 防殭屍超時版 🚀)
// ==========================================
let currentBattleRoom = null;
let isPlayer1 = false;
let battleUnsubscribe = null;
let tempBattleUid = "guest_" + Math.random().toString(36).substring(2, 10);
let matchTimeout = null; // ✨ 新增：配對超時計時器

async function startRandomMatch(unit) {
  const btn = document.getElementById("find-match-btn");
  const msg = document.getElementById("match-wait-msg");
  if (btn) {
    btn.disabled = true;
    btn.innerText = "連線中...";
  }
  if (msg) msg.style.display = "block";

  const db = firebase.firestore();
  let rawUid = localStorage.getItem("mathGamePlayerUid");
  const myUid = rawUid && rawUid !== "guest" ? rawUid : tempBattleUid;
  const myName = localStorage.getItem("mathGamePlayerName") || "匿名勇者";

  try {
    const waitingRooms = await db
      .collection("battles")
      .where("unit", "==", unit)
      .where("status", "==", "waiting")
      .get();

    let roomToJoin = null;
    let ghostRooms = [];

    waitingRooms.forEach((doc) => {
      const data = doc.data();
      if (data.player1 && data.player1.uid === myUid) {
        ghostRooms.push(doc.id);
      } else {
        if (!roomToJoin) roomToJoin = doc;
      }
    });

    ghostRooms.forEach((id) =>
      db
        .collection("battles")
        .doc(id)
        .delete()
        .catch((e) => console.log(e))
    );

    if (roomToJoin) {
      currentBattleRoom = roomToJoin.id;
      isPlayer1 = false;

      await db
        .collection("battles")
        .doc(currentBattleRoom)
        .update({
          player2: { uid: myUid, name: myName, score: 0, combo: 0 },
          status: "playing",
          startTime: firebase.firestore.FieldValue.serverTimestamp(),
        });
      listenToBattle();
    } else {
      const newRoomRef = await db.collection("battles").add({
        unit: unit,
        status: "waiting",
        player1: { uid: myUid, name: myName, score: 0, combo: 0 },
        player2: null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      currentBattleRoom = newRoomRef.id;
      isPlayer1 = true;
      listenToBattle();

      // ✨ 新增：60 秒配對超時防呆，時間到自動幫他取消並清掉房間！
      matchTimeout = setTimeout(() => {
        if (currentBattleRoom) {
          alert("⏳ 尋找對手超時！已自動為您取消，請稍後再試。");
          cancelMatch();
        }
      }, 60000); // 60000 毫秒 = 60 秒
    }
  } catch (e) {
    console.error("配對失敗", e);
    alert("連線失敗，請確認網路狀態後重試！");
    if (btn) {
      btn.disabled = false;
      btn.innerText = "⚔️ 尋找對手";
    }
    if (msg) msg.style.display = "none";
  }
}

function listenToBattle() {
  const db = firebase.firestore();
  battleUnsubscribe = db
    .collection("battles")
    .doc(currentBattleRoom)
    .onSnapshot((doc) => {
      if (doc.exists) {
        const data = doc.data();

        // ✨ 如果配對成功 (狀態變成 playing)，立刻把 60 秒炸彈拆除！
        if (data.status === "playing" && matchTimeout) {
          clearTimeout(matchTimeout);
          matchTimeout = null;
        }

        if (typeof syncBattleUI === "function") syncBattleUI(data);
      } else {
        if (typeof handleOpponentFlee === "function") handleOpponentFlee();
      }
    });
}

function cancelMatch() {
  if (battleUnsubscribe) {
    battleUnsubscribe();
    battleUnsubscribe = null;
  }
  // ✨ 取消時，順便把計時器清掉
  if (matchTimeout) {
    clearTimeout(matchTimeout);
    matchTimeout = null;
  }

  if (currentBattleRoom) {
    firebase
      .firestore()
      .collection("battles")
      .doc(currentBattleRoom)
      .delete()
      .catch((e) => console.log(e));
  }
  currentBattleRoom = null;
  isPlayer1 = false;

  const btn = document.getElementById("find-match-btn");
  const msg = document.getElementById("match-wait-msg");
  if (btn) {
    btn.disabled = false;
    btn.innerText = "⚔️ 尋找對手";
  }
  if (msg) msg.style.display = "none";
}

function updateBattleScore(score, combo) {
  if (!currentBattleRoom) return;
  const db = firebase.firestore();
  const updateKey = isPlayer1 ? "player1" : "player2";
  db.collection("battles")
    .doc(currentBattleRoom)
    .update({
      [`${updateKey}.score`]: score,
      [`${updateKey}.combo`]: combo,
    })
    .catch((e) => console.error("同步分數失敗:", e));
}

// ✨ 保留原本的最強保險絲：玩家關閉網頁、滑掉 APP、或按上一頁時，自動觸發炸毀房間！
window.addEventListener("pagehide", () => {
  if (currentBattleRoom) {
    firebase.firestore().collection("battles").doc(currentBattleRoom).delete();
  }
});
