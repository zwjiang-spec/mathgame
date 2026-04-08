const GLOBAL_TITLES = [
  { min: 0, name: "初心者", color: "#95a5a6" },
  { min: 300, name: "狙擊手", color: "#3498db" },
  { min: 600, name: "預言家", color: "#9b59b6" },
  { min: 1000, name: "煉金師", color: "#e67e22" },
  { min: 1500, name: "戰神", color: "#df22e6" },
  { min: 2000, name: "至尊", color: "#c0392b" },
];

// ==========================================
// ⚔️ 牌位積分系統 (皇室戰爭 0分起步版)
// ==========================================
function getBattleRank(mmr) {
  let score = mmr !== undefined ? mmr : 0; // ✨ 預設從 0 分開始！
  if (score < 400)
    return { name: "🥉 青銅勇者", color: "#cd7f32", shadow: "none" };
  if (score < 800)
    return { name: "🥈 白銀戰士", color: "#bdc3c7", shadow: "none" };
  if (score < 1200)
    return {
      name: "🥇 黃金大師",
      color: "#f1c40f",
      shadow: "0 0 5px rgba(241,196,15,0.5)",
    };
  if (score < 1600)
    return {
      name: "💎 鑽石菁英",
      color: "#00ced1",
      shadow: "0 0 8px rgba(0,206,209,0.6)",
    };
  if (score < 2000)
    return {
      name: "🌟 星耀王者",
      color: "#9b59b6",
      shadow: "0 0 10px rgba(155,89,182,0.8)",
    };
  return { name: "👑 傳說戰神", color: "#e74c3c", shadow: "0 0 15px #e74c3c" };
}

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

// ================= 2. 萬能上傳函數 =================
async function uploadGameRecord(
  status,
  score,
  errorLogMap,
  isHellMode,
  correctCount = 0,
  wrongCount = 0,
  resolvedLogMap = null,
  mmrChange = 0 // ✨ 完美對接！直接接收 trig.html 算好的 Elo 分數
) {
  if (typeof firebase === "undefined") return Promise.reject("Firebase 未載入");
  const db = firebase.firestore();

  const urlParams = new URLSearchParams(window.location.search);
  const isBattleMode = urlParams.get("mode") === "battle";
  const isRandomOrigin = urlParams.get("isRandom") === "true"; // ✨ 追加讀取是否為隨機玩家

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
        count: data.count || 1, // ✨ 記錄同一題錯了幾次
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
  else if (path.includes("prob")) unit = "prob";
  else if (path.includes("plane")) unit = "plane";
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
      : "normal",
    isRandom: isRandomOrigin, // ✨ 把隨機標籤存入戰績！
    mmrChange: Number(mmrChange), // ✨ 把獎盃變化存入戰績！
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
        // ✨ 經驗值對戰 1.5 倍加成
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
          battle_mmr: firebase.firestore.FieldValue.increment(
            Number(mmrChange) || 0
          ),
          battle_wins:
            Number(mmrChange) > 0
              ? firebase.firestore.FieldValue.increment(1)
              : firebase.firestore.FieldValue.increment(0),
          battle_plays: isBattleMode
            ? firebase.firestore.FieldValue.increment(1)
            : firebase.firestore.FieldValue.increment(0),
        };

        // 更新個人資料庫
        db.collection("users")
          .doc(playerUid)
          .set(userUpdates, { merge: true })
          .catch((e) => console.warn("玩家數據更新失敗", e));

        // 💀 世界 Boss 傷害結算 (防塞車省錢架構)
        let day = new Date().getDay();
        let isBonus = false;
        if ((day === 1 || day === 4) && unit === "trig") isBonus = true;
        if ((day === 2 || day === 5) && unit === "space") isBonus = true;
        if ((day === 3 || day === 6) && unit === "perm") isBonus = true;
        if (day === 0) isBonus = true;

        let dmg = Math.max(0, Number(score));
        if (isBonus) dmg = Math.floor(dmg * 1.25);
        if (isHellMode) dmg *= 2;
        if (isBattleMode) dmg = Math.floor(dmg * 1.5);

        if (dmg > 0) {
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

              // 如果在慶祝冷卻期內，傷害就「偷偷加在」總傷害裡，等時間到直接扣除下一階血量，不去算排行榜！
              let cooldownUntil = bData.cooldownUntil || 0;
              if (cooldownUntil && Date.now() < cooldownUntil) {
                t.set(
                  bossRef,
                  { totalDamage: firebase.firestore.FieldValue.increment(dmg) },
                  { merge: true }
                );
                return;
              }

              let level = bData.level || 1;
              let totalDmg = bData.totalDamage || 0;
              let pMap = bData.playerMap || {};
              let pastMVPs = bData.pastMVPs || {};

              let newTotalDmg = totalDmg + dmg;
              let maxHp = 500000 + (level - 1) * 200000;
              let updates = {};

              // 魔王被打死了！
              if (newTotalDmg >= maxHp) {
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
                  "👑 傳說弒神者",
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

                t.update(bossRef, updates);
              } else {
                // 魔王還沒死，使用最高效的「屬性路徑增量」語法，避免覆蓋別人剛打出的傷害！
                let safePlayerPath = `playerMap.${playerUid}`;
                t.update(bossRef, {
                  totalDamage: firebase.firestore.FieldValue.increment(dmg),
                  [`${safePlayerPath}.damage`]:
                    firebase.firestore.FieldValue.increment(dmg),
                  [`${safePlayerPath}.name`]: name,
                });
              }
            });
          } catch (e) {
            console.warn("更新世界Boss資料失敗", e);
          }
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
  if (window.location.pathname.toLowerCase().includes("prob")) unit = "prob";
  if (window.location.pathname.toLowerCase().includes("plane")) unit = "plane";
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
          globalMax: undefined,
        });
      });
    }
  } catch (e) {
    console.warn("Firebase 讀取受阻，跳過:", e);
  }

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
          const userDoc = await db.collection("users").doc(player.uid).get();
          if (userDoc.exists) {
            let userData = userDoc.data();
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
          player.lvl = 1;
          player.globalMax = player.s;
        }
      });
    await Promise.all(tasks);
    return { topList, myEntry, fullList: list };
  };

  const dailyData = await syncLevels(fullDailyList);
  const allTimeData = await syncLevels(fullAllTimeList);

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
  else if (path.includes("prob")) currentUnit = "prob";
  else if (path.includes("plane")) currentUnit = "plane";

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
            <svg viewBox="0 0 50 100" preserveAspectRatio="none"><path d="M 5 60 L 15 60 L 30 95 L 48 5" stroke="currentColor" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
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
// 📊 8. 玩家戰力偵測面板 (極速省電版 + 場均分 + 天梯排位 🚀)
// ==========================================
async function showPlayerStats(uid, playerName) {
  if (!uid || uid === "guest" || uid === "null") {
    alert("⚠️ 這位玩家是神秘的訪客，無法查看詳細資料！");
    return;
  }

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

  try {
    const db = firebase.firestore();
    const userDoc = await db.collection("users").doc(uid).get();

    if (userDoc.exists) {
      let d = userDoc.data();

      const calcAcc = (c, w) => {
        let total = (c || 0) + (w || 0);
        return total === 0 ? "0%" : Math.round((c / total) * 100) + "%";
      };

      const calcAvg = (totalScore, plays) => {
        if (!plays || plays === 0) return "尚無紀錄";
        if (totalScore === undefined) return "需再打一場解鎖";
        return Math.round(totalScore / plays) + " 分";
      };

      let totalPlays = d.total_plays || 0;
      let lvl = d.level || 1;

      let trigAcc = calcAcc(d.trig_correct, d.trig_wrong);
      let spaceAcc = calcAcc(d.space_correct, d.space_wrong);
      let permAcc = calcAcc(d.perm_correct, d.perm_wrong);
      let probAcc = calcAcc(d.prob_correct, d.prob_wrong);
      let planeAcc = calcAcc(d.plane_correct, d.plane_wrong);
      let trigAvg = calcAvg(d.trig_score, d.trig_plays);
      let spaceAvg = calcAvg(d.space_score, d.space_plays);
      let permAvg = calcAvg(d.perm_score, d.perm_plays);
      let probAvg = calcAvg(d.prob_score, d.prob_plays);
      let planeAvg = calcAvg(d.plane_score, d.plane_plays);
      // ✨ 對戰天梯牌位資訊
      let battleMMR = d.battle_mmr !== undefined ? d.battle_mmr : 0;
      let battleWins = d.battle_wins || 0;
      let battlePlays = d.battle_plays || 0; // 撈取對戰總場次
      let battleWinRate =
        battlePlays > 0
          ? Math.round((battleWins / battlePlays) * 100) + "%"
          : "0%"; // ✨ 計算勝率！
      let rankInfo = getBattleRank(battleMMR);

      document.getElementById("stats-loading").style.display = "none";
      document.getElementById("stats-content").style.display = "block";
      document.getElementById("stats-content").innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; background: rgba(0,0,0,0.3); padding: 12px; border-radius: 12px; margin-bottom: 12px; border: 1px solid ${
          rankInfo.color
        }; box-shadow: ${rankInfo.shadow || "none"};">
          <div style="color: #bdc3c7; font-size: 12px; margin-bottom: 4px;">⚔️ 競技場排位</div>
          <div style="color: ${
            rankInfo.color
          }; font-size: 22px; font-weight: 900; letter-spacing: 2px;">${
        rankInfo.name
      }</div>
          <div style="display: flex; gap: 15px; margin-top: 8px; font-size: 13px;">
            <span style="color: #f1c40f; font-weight: bold;">積分: ${battleMMR}</span>
            <span style="color: #2ecc71; font-weight: bold;">勝場: ${battleWins}</span>
            <span style="color: #3498db; font-weight: bold;">勝率: ${battleWinRate}</span> </div>
        </div>
        </div>

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

        <div style="display: flex; flex-direction: column; background: rgba(230, 126, 34, 0.15); padding: 8px 12px; border-radius: 8px; margin-bottom: 8px; border-left: 3px solid #e67e22;">
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #e67e22; font-weight: bold;">🎲 機率與期望值答對率</span>
            <span style="color: #fff; font-weight: bold;">${probAcc}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-top: 4px; font-size: 13px;">
            <span style="color: rgba(255,255,255,0.6);">⚡ 場均得分</span>
            <span style="color: #f1c40f; font-weight: bold;">${probAvg}</span>
          </div>
        </div>
        <div style="display: flex; flex-direction: column; background: rgba(41, 128, 185, 0.15); padding: 8px 12px; border-radius: 8px; margin-bottom: 8px; border-left: 3px solid #2980b9;">
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #2980b9; font-weight: bold;">🧩 平面與直線答對率</span>
            <span style="color: #fff; font-weight: bold;">${planeAcc}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-top: 4px; font-size: 13px;">
            <span style="color: rgba(255,255,255,0.6);">⚡ 場均得分</span>
            <span style="color: #f1c40f; font-weight: bold;">${planeAvg}</span>
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

// ==========================================
// 🛡️ 9. 名稱查重與專屬綁定系統
// ==========================================
async function validateAndClaimName(desiredName) {
  if (
    !desiredName ||
    desiredName.toUpperCase() === "GUEST" ||
    desiredName === "---"
  ) {
    return { valid: true };
  }

  let user =
    firebase.auth && typeof firebase.auth === "function"
      ? firebase.auth().currentUser
      : null;
  const myUid = user
    ? user.uid
    : localStorage.getItem("mathGamePlayerUid") || "guest";

  if (myUid !== "guest") {
    const savedName = localStorage.getItem("mathGamePlayerName");
    if (desiredName === savedName) return { valid: true };
  }

  const db = typeof firebase !== "undefined" ? firebase.firestore() : null;
  if (!db) return { valid: true };

  try {
    let isTaken = false;
    const userSnap = await db
      .collection("users")
      .where("name", "==", desiredName)
      .limit(1)
      .get();

    userSnap.forEach((doc) => {
      if (doc.id !== myUid) isTaken = true;
    });

    if (isTaken) {
      return {
        valid: false,
        msg: `⚠️ 「${desiredName}」這個名稱已經被已登入的勇者專屬綁定了！請換一個名稱喔。`,
      };
    }

    if (myUid !== "guest") {
      await db
        .collection("users")
        .doc(myUid)
        .set({ name: desiredName }, { merge: true });
    }

    return { valid: true };
  } catch (e) {
    console.warn("名稱驗證受阻", e);
    return { valid: true };
  }
}

let currentBattleRoom = null;
let isPlayer1 = false;
let battleUnsubscribe = null;
let tempBattleUid = "guest_" + Math.random().toString(36).substring(2, 10);
let matchTimeout = null;

// ==========================================
// ⚔️ 10. 隨機配對與連線對戰引擎 (全服補位傳送版)
// ==========================================
async function startRandomMatch(unit, existingRoomId = null) {
  const db = firebase.firestore();
  let rawUid = localStorage.getItem("mathGamePlayerUid");
  const myUid = rawUid && rawUid !== "guest" ? rawUid : tempBattleUid;
  const myName = localStorage.getItem("mathGamePlayerName") || "匿名勇者";

  // 1. 如果是被系統傳送過來的 (帶有 roomId)，直接加入戰場！
  if (existingRoomId) {
    currentBattleRoom = existingRoomId;
    const docSnap = await db.collection("battles").doc(existingRoomId).get();
    if (docSnap.exists) {
      isPlayer1 = docSnap.data().player1.uid === myUid;
      if (typeof listenToBattle === "function") listenToBattle();
    }
    return;
  }

  // 2. 正常按下按鈕的配對流程
  const btn = document.getElementById("find-match-btn");
  const msg = document.getElementById("match-wait-msg");
  if (btn) {
    btn.disabled = true;
    btn.innerText = "連線中...";
  }
  if (msg) msg.style.display = "block";

  try {
    // ✨ 核心邏輯：隨機玩家找「所有房間」，指定單元找「同單元 + 隨機玩家房間」
    let query = db.collection("battles").where("status", "==", "waiting");
    if (unit !== "any") {
      query = query.where("unit", "in", [unit, "any"]);
    }

    const waitingRooms = await query.get();

    let roomToJoin = null;
    let ghostRooms = [];
    let validRooms = [];

    waitingRooms.forEach((doc) => {
      const data = doc.data();
      if (data.player1 && data.player1.uid === myUid) ghostRooms.push(doc.id);
      else validRooms.push(doc);
    });

    ghostRooms.forEach((id) =>
      db
        .collection("battles")
        .doc(id)
        .delete()
        .catch((e) => e)
    );

    if (validRooms.length > 0) {
      // 隨機挑一個正在等待的房間加入
      roomToJoin = validRooms[Math.floor(Math.random() * validRooms.length)];
      currentBattleRoom = roomToJoin.id;
      isPlayer1 = false;

      // 決定雙方最終要玩的單元
      let finalUnit = roomToJoin.data().unit;
      if (finalUnit === "any" && unit === "any") {
        const units = ["trig", "space", "perm", "prob", "plane"];
        finalUnit = units[Math.floor(Math.random() * units.length)]; // 兩個都隨機，系統抽籤
      } else if (finalUnit === "any" && unit !== "any") {
        finalUnit = unit; // 房主隨機，我選了特定單元，聽我的
      }

      await db
        .collection("battles")
        .doc(currentBattleRoom)
        .update({
          unit: finalUnit,
          player2: { uid: myUid, name: myName, score: 0, combo: 0 },
          status: "playing",
          startTime: firebase.firestore.FieldValue.serverTimestamp(),
        });
      if (typeof listenToBattle === "function") listenToBattle();
    } else {
      // 自己開房當房主等別人
      const newRoomRef = await db.collection("battles").add({
        unit: unit, // 如果是按隨機匹配，這裡會存入 "any"
        status: "waiting",
        player1: { uid: myUid, name: myName, score: 0, combo: 0 },
        player2: null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      currentBattleRoom = newRoomRef.id;
      isPlayer1 = true;
      if (typeof listenToBattle === "function") listenToBattle();

      matchTimeout = setTimeout(() => {
        if (currentBattleRoom) {
          alert("⏳ 尋找對手超時！已自動為您取消，請稍後再試。");
          cancelMatch();
        }
      }, 60000);
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

        if (data.status === "playing") {
          if (matchTimeout) {
            clearTimeout(matchTimeout);
            matchTimeout = null;
          }

          // ✨ 神奇跳轉魔法！
          // 系統會檢查「房間決定的單元」跟「你現在的網頁」是不是同一個
          // 如果你人在大廳(index)或不同單元，馬上瞬間傳送你過去！
          const currentPage = window.location.pathname;
          if (!currentPage.includes(data.unit)) {
            window.location.href = `${data.unit}.html?mode=battle&roomId=${doc.id}`;
            return;
          }

          // 如果在正確的單元，就開始對戰動畫
          if (typeof syncBattleUI === "function") syncBattleUI(data);
        }
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
      .catch((e) => e);
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

  // 移除隨機配對的全螢幕 UI
  const overlay = document.getElementById("quick-match-overlay");
  if (overlay) overlay.remove();
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
    .catch((e) => e);
}

window.addEventListener("pagehide", () => {
  if (currentBattleRoom) {
    firebase.firestore().collection("battles").doc(currentBattleRoom).delete();
  }
});
// ==========================================
// 🏆 11. 競技場天梯榜 (Top 5 + 我的戰績與盃數)
// ==========================================
async function loadBattleLeaderboard() {
  const listEl = document.getElementById("battle-leaderboard-list");
  if (!listEl) return;

  // 把天梯榜右上角的說明改為獎盃
  const subtitleEl = listEl.parentElement.querySelector("span");
  if (subtitleEl) subtitleEl.innerText = "(獎盃數排序)";

  try {
    const db = firebase.firestore();
    const snapshot = await db
      .collection("users")
      .orderBy("battle_mmr", "desc")
      .limit(5)
      .get();

    let html = "";
    let rank = 1;
    const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];

    if (snapshot.empty) {
      html = `<div style="color: #95a5a6; text-align: center;">尚無天梯戰神，快去搶首殺！</div>`;
    } else {
      snapshot.forEach((doc) => {
        const data = doc.data();
        const mmr = data.battle_mmr !== undefined ? data.battle_mmr : 0;

        const name = data.name || "神秘勇者";
        const wins = data.battle_wins || 0;
        const plays = data.battle_plays || 0;
        const winRate =
          plays > 0 ? Math.round((wins / plays) * 100) + "%" : "0%";
        const rankInfo =
          typeof getBattleRank === "function"
            ? getBattleRank(mmr)
            : { name: "未知牌位", color: "#ccc" };

        html += `
          <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.3); padding: 8px 10px; border-radius: 8px; border-left: 3px solid ${
            rankInfo.color
          }; margin-bottom: 8px;">
            <div style="display: flex; align-items: center; gap: 8px; overflow: hidden;">
              <span style="font-size: 16px; width: 22px; text-align: center;">${
                medals[rank - 1] || rank
              }</span>
              <div style="display: flex; flex-direction: column;">
                <span style="color: white; font-weight: bold; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100px;">${name}</span>
                <span style="color: ${
                  rankInfo.color
                }; font-size: 10px; font-weight: bold; text-shadow: ${
          rankInfo.shadow || "none"
        };">${rankInfo.name}</span>
              </div>
            </div>
            <div style="text-align: right; display: flex; flex-direction: column;">
              <span style="color: #f1c40f; font-weight: 900; font-size: 15px;"><span style="font-size:12px;">🏆</span> ${mmr}</span>
              <span style="color: #2ecc71; font-size: 10px; font-weight: bold;">勝 ${wins} <span style="color:#bdc3c7;">(${winRate})</span></span>
            </div>
          </div>
        `;
        rank++;
      });
    }

    // ✨ 追加顯示「自己的獎盃、名次與勝率」
    const myUid = localStorage.getItem("mathGamePlayerUid");
    if (myUid && myUid !== "guest") {
      const myDoc = await db.collection("users").doc(myUid).get();
      let myMmr = 0;
      let myWins = 0;
      let myPlays = 0;

      if (myDoc.exists) {
        myMmr =
          myDoc.data().battle_mmr !== undefined ? myDoc.data().battle_mmr : 0;
        myWins = myDoc.data().battle_wins || 0;
        myPlays = myDoc.data().battle_plays || 0;
      }

      let myWinRate =
        myPlays > 0 ? Math.round((myWins / myPlays) * 100) + "%" : "0%";

      // 🏆 計算名次大腦
      let myRankNum = "-";
      try {
        const higherMmrSnap = await db
          .collection("users")
          .where("battle_mmr", ">", myMmr)
          .get();
        myRankNum = higherMmrSnap.size + 1;
      } catch (e) {
        console.warn("計算名次受阻", e);
      }

      const myRankInfo =
        typeof getBattleRank === "function"
          ? getBattleRank(myMmr)
          : { name: "未知牌位", color: "#ccc" };

      html += `
        <div style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed #7f8c8d; display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 16px;">🙋‍♂️</span>
            <div style="display: flex; flex-direction: column;">
              <div style="color: #ecf0f1; font-weight: bold; font-size: 13px;">
                我的戰績 <span style="color: #f39c12; font-size: 11px; margin-left: 2px;">(第 ${myRankNum} 名)</span>
              </div>
              <span style="color: ${
                myRankInfo.color
              }; font-size: 11px; font-weight: bold; text-shadow: ${
        myRankInfo.shadow || "none"
      };">${myRankInfo.name}</span>
            </div>
          </div>
          <div style="text-align: right; display: flex; flex-direction: column;">
            <span style="color: #f1c40f; font-weight: 900; font-size: 14px;"><span style="font-size:12px;">🏆</span> ${myMmr}</span>
            <span style="color: #2ecc71; font-size: 10px; font-weight: bold;">勝 ${myWins} <span style="color:#bdc3c7;">(${myWinRate})</span></span>
          </div>
        </div>
      `;
    } else {
      html += `<div style="margin-top: 12px; padding-top: 8px; border-top: 1px dashed #7f8c8d; font-size: 12px; color: #95a5a6; text-align: center;">登入後可查看個人排位與名次</div>`;
    }

    listEl.innerHTML = html;
  } catch (e) {
    console.error("讀取天梯榜失敗", e);
    listEl.innerHTML = `<div style="color: #e74c3c; text-align: center;">連線失敗，請稍後重試</div>`;
  }
}
// ==========================================
// ⚔️ 12. 全域對戰引擎 (Battle Engine)
// ==========================================
window.BattleEngine = {
  isBattleMode: false,
  hasStarted: false,
  enemyFinalScore: 0,
  enemyFinalName: "敵方",
  enemyUidForElo: null,
  opponentFled: false,

  // 1. 初始化對戰 UI
  init: function () {
    const urlParams = new URLSearchParams(window.location.search);
    this.isBattleMode = urlParams.get("mode") === "battle";
    const roomIdParam = urlParams.get("roomId"); // ✨ 接接看有沒有被傳送過來

    if (this.isBattleMode) {
      if (document.getElementById("start-ui-group"))
        document.getElementById("start-ui-group").style.display = "none";
      if (document.getElementById("unit-avg-board"))
        document.getElementById("unit-avg-board").style.display = "none";
      if (document.getElementById("leaderboards"))
        document.getElementById("leaderboards").style.display = "none";
      if (document.getElementById("rules-box"))
        document.getElementById("rules-box").style.display = "none";
      if (document.getElementById("battle-lobby-ui"))
        document.getElementById("battle-lobby-ui").classList.remove("hidden");
      if (document.getElementById("phase-indicator")) {
        document.getElementById("phase-indicator").innerText =
          "⚔️ 準備進入對戰...";
        document.getElementById("phase-indicator").style.color = "#e74c3c";
      }
      if (document.querySelector("#overlay h1")) {
        document.querySelector("#overlay h1").innerText = "⚔️ 雙人對決";
      }
      const abandonBtn = document.getElementById("abandon-btn");
      if (abandonBtn) abandonBtn.innerHTML = "🏳️ 投降";

      // ✨ 如果玩家是被「系統傳送」過來的，直接光速連線開戰，不用再按按鈕！
      if (roomIdParam) {
        document.getElementById("battle-lobby-ui").classList.add("hidden");
        startRandomMatch(null, roomIdParam);
      }
    }
  },

  // 2. 處理連線同步與 3, 2, 1 動畫
  syncUI: function (roomData, startCallback) {
    if (roomData.status === "playing" && !this.hasStarted) {
      this.hasStarted = true;
      document.getElementById("battle-lobby-ui").classList.add("hidden");
      const myName = localStorage.getItem("mathGamePlayerName") || "勇者";
      document.getElementById("player-name").value = myName;

      const enemyData = isPlayer1 ? roomData.player2 : roomData.player1;
      const enemyName = enemyData ? enemyData.name : "未知對手";

      let cdUI = document.createElement("div");
      cdUI.id = "battle-countdown-ui";
      cdUI.style.cssText =
        "position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0, 0, 0, 0.9); z-index: 9999; display: flex; flex-direction: column; justify-content: center; align-items: center; color: white;";
      cdUI.innerHTML = `
        <div style="font-size: 24px; font-weight: bold; color: #3498db; margin-bottom: 20px; text-shadow: 0 0 10px #3498db; letter-spacing: 2px;">
          ${myName} <span style="color: white; margin: 0 10px;">VS</span> <span style="color: #e74c3c;">${enemyName}</span>
        </div>
        <div id="cd-number" style="font-size: 130px; font-weight: 900; color: #e74c3c; text-shadow: 0 0 40px #e74c3c; transition: transform 0.2s;">3</div>
        <div style="margin-top: 30px; font-size: 16px; color: #f1c40f; letter-spacing: 3px;">🔥 準備好你的計算紙...</div>
      `;
      document.body.appendChild(cdUI);

      let count = 3;
      let cdTimer = setInterval(() => {
        count--;
        const numEl = document.getElementById("cd-number");
        if (!numEl) {
          clearInterval(cdTimer);
          return;
        }
        if (count > 0) {
          numEl.innerText = count;
          numEl.style.transform = "scale(1.2)";
          setTimeout(() => (numEl.style.transform = "scale(1)"), 150);
        } else if (count === 0) {
          numEl.innerText = "FIGHT!";
          numEl.style.color = "#f1c40f";
          numEl.style.textShadow = "0 0 50px #f1c40f";
          numEl.style.transform = "scale(1.3)";
        } else {
          clearInterval(cdTimer);
          cdUI.remove();
          document
            .getElementById("battle-hp-container")
            .classList.remove("hidden");
          if (startCallback) startCallback();
        }
      }, 1000);
    }

    if (
      this.hasStarted &&
      (roomData.status === "playing" || roomData.status === "finished")
    ) {
      const myData = isPlayer1 ? roomData.player1 : roomData.player2;
      const enemyData = isPlayer1 ? roomData.player2 : roomData.player1;
      if (myData && enemyData) {
        this.enemyFinalScore = enemyData.score || 0;
        this.enemyFinalName = enemyData.name || "敵方";
        this.enemyUidForElo = enemyData.uid || null;
        if (document.getElementById("my-score-display"))
          document.getElementById("my-score-display").innerText = myData.score;
        if (document.getElementById("enemy-score-display"))
          document.getElementById("enemy-score-display").innerText =
            enemyData.score;

        let diff = myData.score - enemyData.score;
        let myHp = 50 + (diff / 150) * 50;
        let enemyHp = 50 - (diff / 150) * 50;
        myHp = Math.max(0, Math.min(100, myHp));
        enemyHp = Math.max(0, Math.min(100, enemyHp));

        if (document.getElementById("my-hp-bar"))
          document.getElementById("my-hp-bar").style.width = myHp + "%";
        if (document.getElementById("enemy-hp-bar"))
          document.getElementById("enemy-hp-bar").style.width = enemyHp + "%";
      }
    }
  },

  // 3. 處理對手逃跑
  handleFlee: function (endCallback) {
    let cdUI = document.getElementById("battle-countdown-ui");
    if (cdUI) cdUI.remove();
    if (this.hasStarted && !window.isGameOver) {
      this.opponentFled = true;
      alert("🏃‍♂️ 敵方靈壓消失了！對手已中途逃跑，您贏得了這場對決！");
      if (endCallback) endCallback();
    } else if (!this.hasStarted) {
      alert("⚠️ 對方已取消配對，請重新尋找對手。");
      if (typeof cancelMatch === "function") cancelMatch();
    }
  },

  // 4. 結算獎盃 Elo 分數 (嚴格防洗分與訪客判定)
  calculateEloAndRender: async function (myScore) {
    document.getElementById("final-score-text").classList.add("hidden");
    const battleBox = document.getElementById("battle-result-box");
    const titleEl = document.getElementById("battle-result-title");
    if (battleBox) battleBox.classList.remove("hidden");

    if (document.getElementById("battle-result-my-score"))
      document.getElementById("battle-result-my-score").innerText = myScore;
    if (document.getElementById("battle-result-enemy-score"))
      document.getElementById("battle-result-enemy-score").innerText =
        this.enemyFinalScore;
    if (document.getElementById("battle-result-enemy-name"))
      document.getElementById("battle-result-enemy-name").innerText =
        this.enemyFinalName;

    let battleResult = this.opponentFled
      ? "win"
      : myScore > this.enemyFinalScore
      ? "win"
      : myScore < this.enemyFinalScore
      ? "lose"
      : "draw";

    const myUid = localStorage.getItem("mathGamePlayerUid");
    const isMeGuest = !myUid || myUid === "guest" || myUid.startsWith("guest");
    const isOppGuest =
      !this.enemyUidForElo ||
      this.enemyUidForElo === "guest" ||
      this.enemyUidForElo.startsWith("guest");

    // 🛑 只要有任何一方是訪客，啟動「休閒模式」，不寫入天梯資料！
    if (isMeGuest || isOppGuest) {
      let mmrText = `<div style='color:#bdc3c7; font-size:15px; margin-top:10px; font-weight:bold;'>🤝 休閒對戰 (不計獎盃)</div>`;

      if (battleResult === "win") {
        if (titleEl) {
          titleEl.innerText = this.opponentFled
            ? "🏃‍♂️ 對手逃跑 (休閒)"
            : "🏆 勝利！ (休閒)";
          titleEl.style.color = "#f1c40f";
          titleEl.style.textShadow = "0 0 15px #f1c40f";
        }
        if (battleBox) battleBox.style.borderColor = "#f1c40f";
      } else if (battleResult === "lose") {
        if (titleEl) {
          titleEl.innerText = "💀 戰敗... (休閒)";
          titleEl.style.color = "#95a5a6";
          titleEl.style.textShadow = "0 0 15px #7f8c8d";
        }
        if (battleBox) battleBox.style.borderColor = "#95a5a6";
      } else {
        if (titleEl) {
          titleEl.innerText = "🤝 平手！ (休閒)";
          titleEl.style.color = "#3498db";
          titleEl.style.textShadow = "0 0 15px #3498db";
        }
        if (battleBox) battleBox.style.borderColor = "#3498db";
      }

      if (!document.getElementById("battle-mmr-display")) {
        battleBox.insertAdjacentHTML(
          "beforeend",
          `<div id="battle-mmr-display" style="text-align:center;">${mmrText}</div>`
        );
      } else {
        document.getElementById("battle-mmr-display").innerHTML = mmrText;
      }

      return 0; // 回傳 0 盃，防止寫入戰績
    }

    // ==========================================
    // 👑 以下為「雙方皆為正式登入玩家」的正規天梯計分邏輯
    // ==========================================
    let myMMR = 0,
      enemyMMR = 0;
    try {
      const db = firebase.firestore();
      const myDoc = await db.collection("users").doc(myUid).get();
      if (myDoc.exists && myDoc.data().battle_mmr !== undefined) {
        myMMR = myDoc.data().battle_mmr;
      }

      const enemyDoc = await db
        .collection("users")
        .doc(this.enemyUidForElo)
        .get();
      if (enemyDoc.exists && enemyDoc.data().battle_mmr !== undefined) {
        enemyMMR = enemyDoc.data().battle_mmr;
      }
    } catch (e) {
      console.warn("Elo 積分讀取干擾", e);
    }

    let expectedWin = 1 / (1 + Math.pow(10, (enemyMMR - myMMR) / 400));
    let actualScore =
      battleResult === "win" ? 1 : battleResult === "lose" ? 0 : 0.5;
    let baseChange = Math.round(60 * (actualScore - expectedWin));

    let finalMmrChange = 0;
    if (battleResult === "win") {
      finalMmrChange = Math.max(12, Math.min(48, baseChange));
    } else if (battleResult === "lose") {
      finalMmrChange = Math.min(-12, Math.max(-48, baseChange));
      if (myMMR + finalMmrChange < 0) {
        finalMmrChange = -myMMR;
        if (finalMmrChange > 0) finalMmrChange = 0;
      }
    } else {
      finalMmrChange = baseChange;
    }

    let mmrText =
      finalMmrChange > 0
        ? `<div style='color:#2ecc71; font-size:15px; margin-top:10px; font-weight:bold;'>📈 獎盃 +${finalMmrChange}</div>`
        : finalMmrChange < 0
        ? `<div style='color:#e74c3c; font-size:15px; margin-top:10px; font-weight:bold;'>📉 獎盃 ${finalMmrChange}</div>`
        : `<div style='color:#3498db; font-size:15px; margin-top:10px; font-weight:bold;'>🤝 獎盃 +0</div>`;

    if (battleResult === "win") {
      if (titleEl) {
        titleEl.innerText = this.opponentFled
          ? "🏃‍♂️ 對手逃跑 (不戰而勝)"
          : "🏆 壓倒性勝利！";
        titleEl.style.color = "#f1c40f";
        titleEl.style.textShadow = "0 0 15px #f1c40f";
      }
      if (battleBox) battleBox.style.borderColor = "#f1c40f";
    } else if (battleResult === "lose") {
      if (titleEl) {
        titleEl.innerText = "💀 戰敗...";
        titleEl.style.color = "#95a5a6";
        titleEl.style.textShadow = "0 0 15px #7f8c8d";
      }
      if (battleBox) battleBox.style.borderColor = "#95a5a6";
    } else {
      if (titleEl) {
        titleEl.innerText = "🤝 勢均力敵 (平手)";
        titleEl.style.color = "#3498db";
        titleEl.style.textShadow = "0 0 15px #3498db";
      }
      if (battleBox) battleBox.style.borderColor = "#3498db";
    }

    if (!document.getElementById("battle-mmr-display")) {
      battleBox.insertAdjacentHTML(
        "beforeend",
        `<div id="battle-mmr-display" style="text-align:center;">${mmrText}</div>`
      );
    } else {
      document.getElementById("battle-mmr-display").innerHTML = mmrText;
    }

    return finalMmrChange;
  },

  // 5. 防範逃跑/拔線系統
  setupAntiQuit: function (getGameData) {
    window.abandonGame = function () {
      const confirmMsg = BattleEngine.isBattleMode
        ? "🏳️ 確定要舉白旗投降嗎？\n⚠️ 投降後對手將直接獲得勝利，且您的分數會被結算！"
        : "🚪 確定要放棄這局遊戲嗎？\n⚠️ 警告：中途退出仍會將「目前的分數」送出並計入平均成績！";

      if (confirm(confirmMsg)) {
        if (typeof currentBattleRoom !== "undefined" && currentBattleRoom) {
          firebase
            .firestore()
            .collection("battles")
            .doc(currentBattleRoom)
            .delete()
            .catch((e) => console.log(e));
        }
        if (
          !window.isGameOver &&
          typeof window.startTime !== "undefined" &&
          window.startTime
        ) {
          window.isGameOver = true;
          if (typeof window.timer !== "undefined") clearInterval(window.timer);
          if (document.getElementById("display-area"))
            document.getElementById("display-area").innerHTML =
              "<h2 style='color:#c0392b; text-align:center;'>紀錄送出中...</h2>";
          if (document.getElementById("keypad-container"))
            document.getElementById("keypad-container").style.display = "none";

          const isHellMode =
            new URLSearchParams(window.location.search).get("mode") === "hell";
          const gd = getGameData();
          uploadGameRecord(
            "abandoned",
            gd.score,
            gd.errorLogMap,
            isHellMode,
            gd.correctCount,
            gd.wrongCount,
            null,
            BattleEngine.isBattleMode ? -30 : 0
          ).finally(() => {
            location.href = "index.html";
          });
        } else {
          location.href = "index.html";
        }
      }
    };

    window.addEventListener("pagehide", () => {
      if (
        !window.isGameOver &&
        typeof window.startTime !== "undefined" &&
        window.startTime
      ) {
        window.isGameOver = true;
        const isHellMode =
          new URLSearchParams(window.location.search).get("mode") === "hell";
        const gd = getGameData();
        uploadGameRecord(
          "abandoned",
          gd.score,
          gd.errorLogMap,
          isHellMode,
          gd.correctCount,
          gd.wrongCount,
          null,
          BattleEngine.isBattleMode ? -30 : 0
        );
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        if (
          typeof currentBattleRoom !== "undefined" &&
          currentBattleRoom &&
          !BattleEngine.hasStarted
        ) {
          if (typeof cancelMatch === "function") cancelMatch();
        } else if (
          typeof currentBattleRoom !== "undefined" &&
          currentBattleRoom &&
          BattleEngine.hasStarted &&
          !window.isGameOver
        ) {
          firebase
            .firestore()
            .collection("battles")
            .doc(currentBattleRoom)
            .delete();
          window.isGameOver = true;
          if (typeof window.timer !== "undefined") clearInterval(window.timer);
          const isHellMode =
            new URLSearchParams(window.location.search).get("mode") === "hell";
          const gd = getGameData();
          uploadGameRecord(
            "abandoned",
            gd.score,
            gd.errorLogMap,
            isHellMode,
            gd.correctCount,
            gd.wrongCount,
            null,
            BattleEngine.isBattleMode ? -30 : 0
          ).finally(() => {
            location.href = "index.html";
          });
        }
      }
    });
  },
};

// 覆寫系統連線廣播，轉接給 BattleEngine
function syncBattleUI(roomData) {
  BattleEngine.syncUI(roomData, () => {
    if (typeof window.startGame === "function") window.startGame();
  });
}
function handleOpponentFlee() {
  BattleEngine.handleFlee(() => {
    if (typeof window.timer !== "undefined") clearInterval(window.timer);
    if (typeof window.endGame === "function") window.endGame();
  });
}
