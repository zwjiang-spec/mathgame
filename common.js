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

async function loadGlobalLeaderboard(csvUrl, newRecord = null) {
  const dailyBoard = document.getElementById("daily-board");
  const allTimeBoard = document.getElementById("alltime-board");
  if (!csvUrl || !csvUrl.startsWith("http")) {
    dailyBoard.innerHTML =
      "<div class='board-row' style='justify-content:center; color:#e74c3c;'>尚未綁定資料庫</div>";
    allTimeBoard.innerHTML =
      "<div class='board-row' style='justify-content:center; color:#e74c3c;'>尚未綁定資料庫</div>";
    return;
  }
  try {
    let res = await fetch(csvUrl + "&t=" + new Date().getTime(), {
      cache: "no-store",
    });
    let text = await res.text();
    let data = parseCSV(text);
    let ranks = [];
    let todayObj = new Date();
    let y = todayObj.getFullYear(),
      m = todayObj.getMonth() + 1,
      d = todayObj.getDate();
    let todayPatterns = [
      `${y}/${m}/${d}`,
      `${y}/${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}`,
      `${y}-${m}-${d}`,
      `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    ];

    for (let i = 1; i < data.length; i++) {
      if (data[i].length >= 3) {
        let timeRaw = data[i][0] || "";
        let nameRaw = data[i][1] || "";
        let scoreRaw = parseInt(data[i][2]);
        if (isNaN(scoreRaw)) continue;
        let cleanName = nameRaw.split(" (錯題:")[0].split(" (全對")[0].trim();
        let isToday = todayPatterns.some((p) => timeRaw.startsWith(p));
        ranks.push({ n: cleanName, s: scoreRaw, isToday: isToday });
      }
    }
    if (newRecord) ranks.push(newRecord);

    let daily = ranks
      .filter((r) => r.isToday)
      .sort((a, b) => b.s - a.s)
      .slice(0, 5);
    let dailyHtml = "<h3>🌟 今日全班 Top 5</h3>";
    if (daily.length === 0)
      dailyHtml +=
        "<div class='board-row' style='justify-content:center;'>尚無紀錄</div>";
    daily.forEach(
      (r, i) =>
        (dailyHtml += `<div class="board-row"><span>${i + 1}. ${
          r.n
        }</span><strong>${r.s}</strong></div>`)
    );
    dailyBoard.innerHTML = dailyHtml;

    let allTime = [...ranks].sort((a, b) => b.s - a.s).slice(0, 5);
    let allTimeHtml = "<h3>🏆 歷史全班 Top 5</h3>";
    if (allTime.length === 0)
      allTimeHtml +=
        "<div class='board-row' style='justify-content:center;'>尚無紀錄</div>";
    allTime.forEach(
      (r, i) =>
        (allTimeHtml += `<div class="board-row"><span>${i + 1}. ${
          r.n
        }</span><strong>${r.s}</strong></div>`)
    );
    allTimeBoard.innerHTML = allTimeHtml;
  } catch (err) {
    dailyBoard.innerHTML =
      "<div class='board-row' style='justify-content:center;'>讀取失敗</div>";
    allTimeBoard.innerHTML =
      "<div class='board-row' style='justify-content:center;'>讀取失敗</div>";
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
