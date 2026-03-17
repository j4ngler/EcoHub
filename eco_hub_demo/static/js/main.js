function formatSeconds(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

let lastOrderCode = null;

// Trạng thái packing lần trước để so sánh và trigger âm thanh/cảnh báo thông minh hơn.
let lastPackingStateJson = null;

// Một số trình duyệt chặn autoplay audio nếu chưa có tương tác người dùng.
// Dùng WebAudio: chỉ cần resume AudioContext 1 lần trong user gesture.
let audioCtx = null;
let audioUnlocked = false;

function unlockAudioContext() {
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      audioCtx = new Ctx();
    }
    if (audioCtx.state !== "running") {
      audioCtx.resume();
    }
    audioUnlocked = true;
    return true;
  } catch (_) {
    return false;
  }
}

window.addEventListener("click", unlockAudioContext, { once: true });
window.addEventListener("keydown", unlockAudioContext, { once: true });
document.addEventListener("input", unlockAudioContext, { once: true, capture: true });

const TTS_AUDIO_BASE = "/static/audio/tts";

function audioPath(token) {
  return `${TTS_AUDIO_BASE}/${token}.mp3`;
}

// Chuyển số -> danh sách token theo quy tắc tiếng Việt (đủ dùng tới 9999 cho POC).
// Token map sang file mp3:
// - 0..9
// - muoi (mười), muoi2 (mươi)
// - tram, nghin, le
// - mot (mốt), lam (lăm)
// - don_hang_co, san_pham
function numberToVietnameseTokens(n) {
  n = Number(n);
  if (!Number.isFinite(n)) return [];
  n = Math.floor(Math.abs(n));
  if (n === 0) return ["0"];

  const out = [];
  const onesToken = (d) => String(d); // 0..9

  function readTwoDigits(x, full) {
    const tens = Math.floor(x / 10);
    const unit = x % 10;
    const t = [];
    if (tens > 1) {
      t.push(onesToken(tens), "muoi2");
      if (unit === 1) t.push("mot"); // mốt
      else if (unit === 5) t.push("lam"); // lăm
      else if (unit > 0) t.push(onesToken(unit));
    } else if (tens === 1) {
      t.push("muoi");
      if (unit === 5) t.push("lam");
      else if (unit > 0) t.push(onesToken(unit));
    } else if (tens === 0) {
      if (full && unit > 0) t.push("le", onesToken(unit));
      else if (unit > 0) t.push(onesToken(unit));
    }
    return t;
  }

  function readThreeDigits(x) {
    const hundred = Math.floor(x / 100);
    const rest = x % 100;
    const t = [];
    if (hundred > 0) {
      t.push(onesToken(hundred), "tram");
      if (rest > 0) t.push(...readTwoDigits(rest, true));
    } else {
      t.push(...readTwoDigits(rest, false));
    }
    return t;
  }

  if (n < 100) return readTwoDigits(n, false);
  if (n < 1000) return readThreeDigits(n);
  if (n < 10000) {
    const thousand = Math.floor(n / 1000);
    const rest = n % 1000;
    out.push(onesToken(thousand), "nghin");
    if (rest > 0) {
      // 1005 => "một nghìn không trăm lẻ năm" => token: 1 nghin 0 tram le 5
      if (rest < 100) out.push("0", "tram");
      out.push(...readThreeDigits(rest));
    }
    return out;
  }

  // Nếu lớn hơn 9999: fallback đọc theo số từng chữ số (đảm bảo "đếm được càng nhiều càng tốt" mà không cần thêm file đơn vị)
  return String(n).split("").filter((c) => c >= "0" && c <= "9");
}

let audioQueue = [];
let currentAudio = null;
let lastSpeakTokens = null;

// WebAudio playback (tránh Range 416 và tránh bị chặn sau await)
const bufferCache = new Map();
let playSeqId = 0;

async function loadBuffer(src) {
  if (!audioCtx) return null;
  if (bufferCache.has(src)) return bufferCache.get(src);
  const res = await fetch(src, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const arr = await res.arrayBuffer();
  const buf = await audioCtx.decodeAudioData(arr);
  bufferCache.set(src, buf);
  return buf;
}

function playBuffer(buf) {
  return new Promise((resolve) => {
    if (!audioCtx || !buf) return resolve();
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(audioCtx.destination);
    src.onended = () => resolve();
    src.start();
  });
}

async function playTokens(tokens) {
  if (!unlockAudioContext()) {
    showToast("⚠️ Hãy click vào trang để bật âm thanh, rồi quét lại.");
    return;
  }
  const myId = ++playSeqId;
  for (const t of tokens) {
    if (myId !== playSeqId) return; // bị hủy bởi lần đọc mới
    const src = audioPath(t);
    try {
      const buf = await loadBuffer(src);
      await playBuffer(buf);
    } catch (_) {
      showToast("⚠️ Thiếu/không đọc được file: " + `${t}.mp3`);
      // skip token lỗi
    }
  }
}

function speakCountByAudio(totalItems) {
  const tokens = ["don_hang_co", ...numberToVietnameseTokens(totalItems), "san_pham"];
  lastSpeakTokens = tokens;
  showToast("🔊 Đang đọc: " + tokens.join(" "));
  // hủy chuỗi đang đọc và phát chuỗi mới
  playSeqId++;
  playTokens(tokens);
}

async function submitManualScanAjax(code) {
  try {
    const fd = new FormData();
    fd.set("code", code);
    const res = await fetch("/manual-scan-api", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      showToast("❌ " + (data.error || "Không gửi mã được"));
      return false;
    }
    return true;
  } catch (e) {
    console.error(e);
    showToast("❌ Lỗi kết nối khi gửi mã");
    return false;
  }
}

async function fetchStatus() {
  try {
    const res = await fetch("/status");
    if (!res.ok) return;
    const data = await res.json().catch(() => ({}));

    const orderCodeEl = document.getElementById("orderCode");
    const orderInfoEl = document.getElementById("orderInfo");
    const recordStatusEl = document.getElementById("recordStatus");
    const recordTimerEl = document.getElementById("recordTimer");
    const startBtn = document.getElementById("startBtn");
    const stopBtn = document.getElementById("stopBtn");
    const pauseBtn = document.getElementById("pauseBtn");
    const resumeBtn = document.getElementById("resumeBtn");
    const qtyWarningAudio = document.getElementById("qtyWarningAudio");
    const serialErrorAudio = document.getElementById("serialErrorAudio");
    const packingStatusEl = document.getElementById("packingStatus");

    if (orderCodeEl) {
      orderCodeEl.textContent = data.current_order_code || "Chưa quét được mã";
    }

    if (orderInfoEl && data.order_info) {
      const order = data.order_info;
      let html = "";
      html += `<p><strong>Mã đơn:</strong> ${order.order_id}</p>`;
      html += `<p><strong>Nền tảng:</strong> ${order.platform}</p>`;
      html += "<ul>";
      (order.items || []).forEach((it) => {
        html += `<li>${it.qty} x ${it.name}</li>`;
      });
      html += "</ul>";
      orderInfoEl.innerHTML = html;
    }

    // Cảnh báo âm thanh khi quét đơn mới có nhiều sản phẩm
    const currentCode = data.current_order_code || null;
    const totalItems = typeof data.total_items === "number" ? data.total_items : 0;
    const WARNING_THRESHOLD = 5; // Đơn có từ 5 sản phẩm trở lên sẽ cảnh báo

    if (currentCode && currentCode !== lastOrderCode) {
      if (totalItems >= WARNING_THRESHOLD && qtyWarningAudio) {
        try {
          qtyWarningAudio.currentTime = 0;
          qtyWarningAudio.play();
        } catch (e) {
          console.warn("Không phát được âm thanh cảnh báo:", e);
        }
      }
      // Đọc số lượng sản phẩm bằng tiếng Việt bằng MP3 tokens
      speakCountByAudio(totalItems);
      lastOrderCode = currentCode;
    }

    // Cảnh báo âm thanh khi sai số lượng (thừa): phát khi vừa chuyển sang has_excess.
    const packing = data.packing_state || {};
    let prevPacking = null;
    try {
      prevPacking = lastPackingStateJson ? JSON.parse(lastPackingStateJson) : null;
    } catch (_) {}
    const nowExcess = !!packing.has_excess;
    const prevExcess = prevPacking && prevPacking.has_excess;
    if (serialErrorAudio && nowExcess && !prevExcess) {
      try {
        serialErrorAudio.currentTime = 0;
        serialErrorAudio.play();
      } catch (e) {
        console.warn("Không phát được âm thanh cảnh báo serial:", e);
      }
    }

    // Render bảng trạng thái đóng gói (POC) — sau render sẽ cập nhật lastPackingStateJson cho lần poll tiếp theo.
    if (packingStatusEl) {
      renderPackingStatus(packingStatusEl, data.packing_state);
    }

    if (recordStatusEl && recordTimerEl && startBtn && stopBtn) {
      const isRecording = !!data.is_recording;
      const isPaused = !!data.is_paused;

      if (isRecording) {
        if (isPaused) {
          recordStatusEl.textContent = "Paused";
          recordStatusEl.className = "badge bg-warning";
        } else {
          recordStatusEl.textContent = "Recording";
          recordStatusEl.className = "badge bg-danger";
        }
        recordTimerEl.textContent = formatSeconds(data.recording_seconds);

        startBtn.disabled = true;
        stopBtn.disabled = false;
        if (pauseBtn) pauseBtn.disabled = isPaused;
        if (resumeBtn) resumeBtn.disabled = !isPaused;
      } else {
        recordStatusEl.textContent = "Idle";
        recordStatusEl.className = "badge bg-secondary";
        recordTimerEl.textContent = "00:00";

        startBtn.disabled = false;
        stopBtn.disabled = true;
        if (pauseBtn) pauseBtn.disabled = true;
        if (resumeBtn) resumeBtn.disabled = true;
      }
    }

    // Hiển thị notifications từ backend (toast)
    const notifs = Array.isArray(data.notifications) ? data.notifications : [];
    notifs.forEach((n) => {
      const level = (n && n.level) ? String(n.level) : "info";
      const msg = (n && n.message) ? String(n.message) : "";
      if (!msg) return;
      // Dùng toast sẵn có (màu xanh). Với lỗi nghiêm trọng có thể alert.
      if (level === "error") {
        showToast("❌ " + msg);
      } else if (level === "warning") {
        showToast("⚠️ " + msg);
      } else {
        showToast(msg);
      }
    });
  } catch (e) {
    console.error("fetchStatus error", e);
  }
}

async function startRecording() {
  try {
    const res = await fetch("/start_recording", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errorMsg = data.error || "Không bắt đầu quay được.";
      
      // Kiểm tra lỗi OpenCV VideoWriter codec
      if (errorMsg.includes("opencv-contrib-python")) {
        alert(
          "❌ THIẾU CODEC VIDEO!\n\n" +
          "OpenCV trên máy bạn không hỗ trợ ghi video.\n\n" +
          "CÁCH SỬA:\n" +
          "1. Mở terminal/CMD\n" +
          "2. Chạy 2 lệnh:\n" +
          "   pip uninstall opencv-python\n" +
          "   pip install opencv-contrib-python\n\n" +
          "3. Restart Flask: python app.py\n\n" +
          "Chi tiết: " + errorMsg
        );
      } else {
        alert("❌ Lỗi: " + errorMsg);
      }
    }
  } catch (e) {
    console.error(e);
    alert("Lỗi kết nối. Kiểm tra server đã chạy chưa.");
  }
}

async function stopRecording() {
  if (!confirm("Bạn có chắc muốn kết thúc quay?\n\n✅ Bấm OK: Lưu video, reset mã (sẵn sàng quét mã mới)\n❌ Bấm Cancel: Tiếp tục quay")) {
    return;
  }
  try {
    const res = await fetch("/stop_recording", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Chỉ cảnh báo âm thanh khi sai số lượng (thừa). Thiếu serial sẽ do máy quét cảnh báo.
      const packing = data.packing_state || {};
      if (packing.has_excess) {
        const serialErrorEl = document.getElementById("serialErrorAudio");
        if (serialErrorEl) {
          try {
            serialErrorEl.currentTime = 0;
            serialErrorEl.play();
          } catch (_) {}
        }
      }
      alert(data.error || "Không dừng quay được.");
    } else {
      showToast("✅ In xong! Thời lượng: " + (data.duration || 0) + " giây");
    }
  } catch (e) {
    console.error(e);
    alert("Lỗi kết nối. Kiểm tra server đã chạy chưa.");
  }
}

async function pauseRecording() {
  try {
    const res = await fetch("/pause_recording", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || "Không tạm dừng được.");
    }
  } catch (e) {
    console.error(e);
    alert("Lỗi kết nối. Kiểm tra server đã chạy chưa.");
  }
}

async function resumeRecording() {
  try {
    const res = await fetch("/resume_recording", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || "Không tiếp tục quay được.");
    }
  } catch (e) {
    console.error(e);
    alert("Lỗi kết nối. Kiểm tra server đã chạy chưa.");
  }
}

/**
 * Render trạng thái đóng gói lên card #packingStatus.
 *
 * POC hiện tại chỉ có 1 bucket "__all__" đại diện cho toàn bộ số lượng sản phẩm.
 * Các trạng thái:
 * - missing: chưa quét đủ serial / số lượng
 * - ok     : đã quét đủ
 * - excess : đang thừa serial / số lượng
 */
function renderPackingStatus(container, packingState) {
  if (!container) return;

  if (!packingState || !Array.isArray(packingState.items) || packingState.items.length === 0) {
    container.innerHTML =
      '<p class="mb-0 text-muted">Chưa có dữ liệu serial. Hãy quét mã đơn, sau đó quét serial trong quá trình đóng gói.</p>';
    lastPackingStateJson = null;
    return;
  }

  const items = packingState.items;

  // Hiện tại POC chỉ quan tâm tới bucket tổng "__all__",
  // nhưng code vẫn lặp qua toàn bộ để dễ mở rộng sau này.
  let rowsHtml = "";
  items.forEach((it) => {
    const status = it.status || "missing";
    let badgeClass = "bg-secondary";
    let label = "Chưa rõ";

    if (status === "ok") {
      badgeClass = "bg-success";
      label = "Đủ";
    } else if (status === "missing") {
      badgeClass = "bg-warning text-dark";
      label = "Thiếu";
    } else if (status === "excess") {
      badgeClass = "bg-danger";
      label = "Thừa";
    }

    rowsHtml += `
      <tr>
        <td>Tổng tất cả sản phẩm</td>
        <td class="text-end">${it.required_qty}</td>
        <td class="text-end">${it.scanned_count}</td>
        <td class="text-center"><span class="badge ${badgeClass}">${label}</span></td>
      </tr>
    `;
  });

  container.innerHTML = `
    <div class="table-responsive">
      <table class="table table-sm align-middle mb-0">
        <thead>
          <tr>
            <th>Sản phẩm</th>
            <th class="text-end">SL yêu cầu</th>
            <th class="text-end">SL đã quét</th>
            <th class="text-center">Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `;

  // Lưu snapshot để sau này có thể so sánh và trigger âm thanh tinh vi hơn nếu cần.
  try {
    lastPackingStateJson = JSON.stringify(packingState);
  } catch {
    lastPackingStateJson = null;
  }
}

function showToast(message) {
  const toastEl = document.getElementById("successToast");
  const toastBody = document.getElementById("toastBody");
  if (toastBody) toastBody.textContent = message;
  if (toastEl) {
    const toast = new bootstrap.Toast(toastEl, { delay: 4000 });
    toast.show();
  }
}

async function resetOrder() {
  try {
    await fetch("/reset_order", { method: "POST" });
  } catch (e) {
    console.error(e);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");
  const pauseBtn = document.getElementById("pauseBtn");
  const resumeBtn = document.getElementById("resumeBtn");
  const resetOrderBtn = document.getElementById("resetOrderBtn");

  if (startBtn) startBtn.addEventListener("click", startRecording);
  if (stopBtn) stopBtn.addEventListener("click", stopRecording);
  if (pauseBtn) pauseBtn.addEventListener("click", pauseRecording);
  if (resumeBtn) resumeBtn.addEventListener("click", resumeRecording);
  if (resetOrderBtn) resetOrderBtn.addEventListener("click", resetOrder);

  // Tránh scanner dính chuỗi nhiều mã (do input không được clear kịp).
  const scanForm = document.getElementById("manualScanForm");
  const scanInput = document.getElementById("manualScanInput");
  if (scanForm && scanInput) {
    scanForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      // Scanner submit bằng Enter => unlock WebAudio ngay trong user gesture
      unlockAudioContext();
      const code = (scanInput.value || "").trim();
      // Clear ngay để lần quét tiếp theo không bị nối chuỗi
      setTimeout(() => {
        try { scanInput.value = ""; scanInput.focus(); } catch (_) {}
      }, 0);
      if (!code) return;
      const ok = await submitManualScanAjax(code);
      if (ok) {
        // Pull status ngay để trigger đọc số lượng
        setTimeout(fetchStatus, 100);
      }
    });
  }

  // Poll mỗi 1s
  setInterval(fetchStatus, 1000);
  fetchStatus();
});

