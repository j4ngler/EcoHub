function formatSeconds(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

let lastOrderCode = null;
/** Đồng bộ với app_state.order_audio_nonce — mỗi lần tăng (quét mới hoặc cooldown pulse) thì phát lại TTS đơn. */
let lastOrderAudioNonce = null;
let lastShippingAnnouncementKey = null;
let shippingAnnouncementSeq = 0;
const ANNOUNCED_ORDER_CODES_KEY = "announcedOrderCodes.v1";
let statusAudioHydrated = false;
let serialAutoSubmitTimer = null;
let orderScanAutoSubmitTimer = null;
let serialSubmitInFlight = false;
let orderSubmitInFlight = false;
let scannerWedgeBuffer = "";
let scannerWedgeLastTs = 0;
let scannerWedgeFlushTimer = null;
let serialWedgeBuffer = "";
let serialWedgeLastTs = 0;
let serialWedgeFlushTimer = null;
let lastScannerAttentionAt = 0;
const SCANNER_ATTENTION_COOLDOWN_MS = 1200;

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
      void audioCtx.resume();
    }
    audioUnlocked = audioCtx.state === "running";
    return audioUnlocked;
  } catch (_) {
    return false;
  }
}

/** Dùng trước khi phát TTS/beep từ poll /status (không có gesture): phải await resume(). */
async function ensureAudioContextRunning() {
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      audioCtx = new Ctx();
    }
    if (audioCtx.state !== "running") {
      await audioCtx.resume();
    }
    audioUnlocked = audioCtx.state === "running";
    return audioCtx.state === "running";
  } catch (_) {
    return false;
  }
}

window.addEventListener("click", unlockAudioContext, { once: true });
window.addEventListener("keydown", unlockAudioContext, { once: true });
window.addEventListener("pointerdown", unlockAudioContext, { once: true, capture: true });
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

function playBeep(kind = "start") {
  if (!unlockAudioContext() || !audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.value = kind === "stop" ? 520 : 880;
  const now = audioCtx.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + (kind === "stop" ? 0.16 : 0.12));
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + (kind === "stop" ? 0.16 : 0.12));
}

async function playTokens(tokens, options = {}) {
  const showMissingToast = options.showMissingToast !== false;
  const missingToastOnce = options.missingToastOnce === true;
  let missingToastShown = false;
  const running = await ensureAudioContextRunning();
  if (!running) {
    if (showMissingToast) {
      showToast("⚠️ Hãy click vào trang để bật âm thanh, rồi quét lại.");
    }
    return false;
  }
  if (!tokens.length) {
    return true;
  }
  const myId = ++playSeqId;
  let playedAny = false;
  for (const t of tokens) {
    if (myId !== playSeqId) {
      return playedAny;
    }
    const src = audioPath(t);
    try {
      const buf = await loadBuffer(src);
      if (!buf) {
        continue;
      }
      await playBuffer(buf);
      playedAny = true;
    } catch (e) {
      console.warn("[TTS] Không phát được token:", t, e);
      if (showMissingToast && (!missingToastOnce || !missingToastShown)) {
        missingToastShown = true;
        showToast("⚠️ Thiếu/không đọc được file: " + `${t}.mp3`);
      }
    }
  }
  return playedAny;
}

function speakCountByAudio(totalItems) {
  const tokens = ["don_hang_co", ...numberToVietnameseTokens(totalItems), "san_pham"];
  lastSpeakTokens = tokens;
  // hủy chuỗi đang đọc và phát chuỗi mới
  playSeqId++;
  return playTokens(tokens, { showMissingToast: true, missingToastOnce: true });
}

function normalizeShippingStatus(raw) {
  return String(raw || "").trim().toUpperCase();
}

function getAnnouncedOrderCodes() {
  try {
    const raw = sessionStorage.getItem(ANNOUNCED_ORDER_CODES_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.map((x) => String(x)));
  } catch (_) {
    return new Set();
  }
}

function markOrderCodeAnnounced(code) {
  if (!code) return;
  try {
    const set = getAnnouncedOrderCodes();
    set.add(String(code));
    sessionStorage.setItem(ANNOUNCED_ORDER_CODES_KEY, JSON.stringify(Array.from(set)));
  } catch (_) {}
}

function hasAnnouncedOrderCode(code) {
  if (!code) return false;
  return getAnnouncedOrderCodes().has(String(code));
}

function getShippingAnnouncement(order) {
  if (!order) return null;
  const st = normalizeShippingStatus(order.shipping_status || order.ship_status || order.delivery_status);
  if (!st) return null;

  const awaitingShipSet = new Set([
    "AWAITING_SHIPPED",
    "AWAITING_SHIPMENT",
    "PENDING_SHIPMENT",
    "READY_TO_SHIP",
    "TO_SHIP",
    "WAITING_FOR_SHIPPING",
  ]);
  const pickedSet = new Set(["PICKED_UP", "SHIP_PICKED_UP", "DA_LAY", "DA-LAY", "COLLECTED"]);
  const shippedSet = new Set([
    "SHIPPED",
    "DA_SHIP",
    "ĐÃ SHIP",
    "IN_TRANSIT",
    "DELIVERED",
    "FULFILLED",
  ]);
  const cancelledSet = new Set(["CANCELLED", "CANCELED", "VOIDED"]);

  if (awaitingShipSet.has(st)) return "Chờ vận chuyển";
  if (pickedSet.has(st)) return "Ship đã lấy";
  if (shippedSet.has(st)) return "Đã làm";
  if (cancelledSet.has(st)) return "Đơn đã hủy";
  return null;
}

function shippingAnnouncementToTokens(text) {
  const t = String(text || "").trim();
  // Cần có các file tương ứng trong static/audio/tts:
  // - cho_van_chuyen.mp3 (chờ vận chuyển / awaiting_shipped)
  // - da_ship.mp3
  // - ship_da_lay.mp3
  // - don_da_huy.mp3
  if (t === "Chờ vận chuyển") return ["cho_van_chuyen"];
  if (t === "Đã làm" || t === "Đã ship") return ["da_ship"];
  if (t === "Ship đã lấy") return ["ship_da_lay"];
  if (t === "Đơn đã hủy") return ["don_da_huy"];
  return [];
}

async function speakShippingStatusByAudio(text) {
  const tokens = shippingAnnouncementToTokens(text);
  if (!tokens.length) return true;
  // Dùng cùng cơ chế MP3 token như phần đọc số lượng.
  playSeqId++;
  return playTokens(tokens, { showMissingToast: true, missingToastOnce: true });
}

async function submitManualScanAjax(code) {
  try {
    const fd = new FormData();
    fd.set("code", code);
    const res = await fetch("/manual-scan-api", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      showToast("❌ " + (data.error || "Không gửi mã được"));
      return { ok: false, kind: data.kind || "unknown" };
    }
    return {
      ok: true,
      kind: data.kind || "serial",
      code: data.code || code,
      action: data.action || "scan",
    };
  } catch (e) {
    console.error(e);
    showToast("❌ Lỗi kết nối khi gửi mã");
    return { ok: false, kind: "unknown" };
  }
}

function focusSerialInput(options = {}) {
  const scanInput = document.getElementById("manualScanInput");
  const shell = document.getElementById("scannerInputShell");
  if (!scanInput) return;
  try {
    if (document.activeElement !== scanInput) {
      scanInput.focus();
    }
    if (options.clear) scanInput.value = "";
    if (options.highlight && shell) {
      const now = Date.now();
      if (now - lastScannerAttentionAt >= SCANNER_ATTENTION_COOLDOWN_MS) {
        lastScannerAttentionAt = now;
        shell.classList.add("scanner-input-shell--attention");
        setTimeout(() => {
          shell.classList.remove("scanner-input-shell--attention");
        }, 900);
      }
    } else if (options.highlight) {
      const now = Date.now();
      if (now - lastScannerAttentionAt >= SCANNER_ATTENTION_COOLDOWN_MS) {
        lastScannerAttentionAt = now;
        scanInput.classList.add("shadow-sm");
        setTimeout(() => {
          scanInput.classList.remove("shadow-sm");
        }, 900);
      }
    }
  } catch (_) {}
}

function focusOrderScanInput(options = {}) {
  const orderScanInput = document.getElementById("manualOrderScanInput");
  if (!orderScanInput || orderScanInput.closest(".d-none")) {
    focusSerialInput(options);
    return;
  }
  try {
    if (document.activeElement !== orderScanInput) {
      orderScanInput.focus();
    }
    if (options.clear) orderScanInput.value = "";
    if (options.highlight) {
      orderScanInput.classList.add("shadow-sm");
      setTimeout(() => {
        orderScanInput.classList.remove("shadow-sm");
      }, 900);
    }
  } catch (_) {}
}

const RECORDING_FLOW_FOLDER = { outbound: "hang_gui", return: "hang_hoan" };

function syncRecordingFlowControls(data) {
  const picker = document.getElementById("recordingFlowPicker");
  const hint = document.getElementById("recordingFlowHint");
  const outbound = document.getElementById("recordingFlowOutbound");
  const ret = document.getElementById("recordingFlowReturn");
  if (!outbound || !ret) return;

  const flow = data.recording_flow === "return" ? "return" : "outbound";
  const locked = !!data.is_recording;
  outbound.checked = flow === "outbound";
  ret.checked = flow === "return";
  outbound.disabled = locked;
  ret.disabled = locked;
  if (picker) picker.classList.toggle("is-locked", locked);

  if (hint) {
    const folder = RECORDING_FLOW_FOLDER[flow] || "hang_gui";
    let html = `Video lưu tại: <code>mã NV / ca / ${folder}</code>`;
    if (locked) html += ' · <span class="text-warning">Không đổi khi đang quay</span>';
    hint.innerHTML = html;
  }
}

async function setRecordingFlow(flow) {
  try {
    const res = await fetch("/api/recording_flow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recording_flow: flow }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      showToast("❌ " + (data.error || "Không đổi chế độ quay được"));
      queueFetchStatus();
      return false;
    }
    syncRecordingFlowControls({
      recording_flow: data.recording_flow,
      is_recording: false,
    });
    const label = data.label || (data.recording_flow === "return" ? "Hàng hoàn" : "Hàng gửi");
    showToast("✅ Chế độ quay: " + label);
    return true;
  } catch (e) {
    console.error(e);
    showToast("❌ Lỗi kết nối khi đổi chế độ quay");
    return false;
  }
}

function renderRecordingState(data, refs) {
  const {
    recordStatusEl,
    recordTimerEl,
    startBtn,
    stopBtn,
    pauseBtn,
    resumeBtn,
    recordCardEl,
    recordHintEl,
  } = refs;
  if (!(recordStatusEl && recordTimerEl && startBtn && stopBtn)) return;

  const isRecording = !!data.is_recording;
  const isPaused = !!data.is_paused;
  if (recordCardEl) {
    recordCardEl.classList.remove("is-recording", "is-paused");
  }

  if (isRecording) {
    if (isPaused) {
      recordStatusEl.className = "record-status-badge is-paused";
      recordStatusEl.innerHTML = '<span class="record-dot" aria-hidden="true"></span>Tạm dừng';
      if (recordHintEl) recordHintEl.textContent = "Đang tạm dừng";
      if (recordCardEl) recordCardEl.classList.add("is-paused");
    } else {
      recordStatusEl.className = "record-status-badge is-recording";
      recordStatusEl.innerHTML = '<span class="record-dot" aria-hidden="true"></span>Đang ghi';
      if (recordHintEl) recordHintEl.textContent = "Đang ghi hình";
      if (recordCardEl) recordCardEl.classList.add("is-recording");
    }
    recordTimerEl.textContent = formatSeconds(data.recording_seconds);
    startBtn.disabled = true;
    startBtn.classList.remove("btn-pulse-ready");
    stopBtn.disabled = false;
    if (pauseBtn) pauseBtn.disabled = isPaused;
    if (resumeBtn) resumeBtn.disabled = !isPaused;
  } else {
    recordStatusEl.className = "record-status-badge is-idle";
    recordStatusEl.innerHTML = '<span class="record-dot" aria-hidden="true"></span>Idle';
    if (recordHintEl) recordHintEl.textContent = "Sẵn sàng ghi hình";
    recordTimerEl.textContent = "00:00";
    startBtn.disabled = false;
    startBtn.classList.add("btn-pulse-ready");
    stopBtn.disabled = true;
    if (pauseBtn) pauseBtn.disabled = true;
    if (resumeBtn) resumeBtn.disabled = true;
  }
}

async function submitManualOrderAjax(orderCode) {
  try {
    const fd = new FormData();
    fd.set("order_code", orderCode);
    const res = await fetch("/manual-order", {
      method: "POST",
      body: fd,
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      showToast("❌ " + (data.error || "Không lấy đơn được"));
      return { ok: false, action: "error" };
    }
    showToast("✅ " + (data.message || "Đã lấy đơn"));
    return { ok: true, action: data.action || "scan" };
  } catch (e) {
    console.error(e);
    showToast("❌ Lỗi kết nối khi lấy đơn");
    return { ok: false, action: "error" };
  }
}

let audioNeedInteractionToastShown = false;
const TOAST_DEDUP_WINDOW_MS = 1500;
let lastToastMessage = "";
let lastToastAt = 0;

/** Chỉ cho phép 1 fetchStatus chạy cùng lúc; nếu có yêu cầu mới thì chạy lại ngay sau đó. */
let fetchStatusInFlight = false;
let fetchStatusPending = false;
function queueFetchStatus() {
  if (fetchStatusInFlight) {
    fetchStatusPending = true;
    return;
  }
  fetchStatusInFlight = true;
  fetchStatus()
    .catch((err) => console.error("fetchStatus error", err))
    .finally(() => {
      fetchStatusInFlight = false;
      if (fetchStatusPending) {
        fetchStatusPending = false;
        queueFetchStatus();
      }
    });
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
    const recordCardEl = document.querySelector(".record-card-modern");
    const recordHintEl = document.getElementById("recordHint");
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
      html += `<p class="mb-1 order-info-line"><strong>Mã đơn:</strong> ${order.order_id}</p>`;
      html += `<p class="mb-1 order-info-line"><strong>Nền tảng:</strong> ${order.platform}</p>`;
      if (order.shipping_status) {
        html += `<p class="mb-1 order-info-line"><strong>Trạng thái ship:</strong> ${order.shipping_status}</p>`;
      }
      if (order.shop_id) {
        html += `<p class="mb-1 order-info-line"><strong>Shop ID:</strong> ${order.shop_id}</p>`;
      }
      if (order.product_id) {
        html += `<p class="mb-1 order-info-line"><strong>Product ID:</strong> ${order.product_id}</p>`;
      }
      if (order.sku_id) {
        html += `<p class="mb-1 order-info-line"><strong>SKU ID:</strong> ${order.sku_id}</p>`;
      }
      const items = order.items || [];
      if (items.length) {
        html += '<ul class="mb-0 ps-3 order-info-list">';
        items.forEach((it) => {
          html += `<li>${it.qty} x ${it.name}`;
          if (it.product_id) {
            html += `<br><small class="text-muted">Product: ${it.product_id}</small>`;
          }
          if (it.sku_id) {
            html += `<br><small class="text-muted">SKU: ${it.sku_id}</small>`;
          }
          html += "</li>";
        });
        html += "</ul>";
      } else {
        html +=
          '<p class="small text-muted mb-0">Chưa có chi tiết sản phẩm (Shopee/khác hoặc chưa nối API).</p>';
      }
      orderInfoEl.innerHTML = html;
    } else if (orderInfoEl && !data.order_info) {
      orderInfoEl.innerHTML =
        '<p class="text-muted small mb-0">Quét mã QR/Barcode bằng camera để hiển thị đơn hàng.</p>';
    }

    syncRecordingFlowControls(data);

    // Cảnh báo âm thanh khi quét đơn mới có nhiều sản phẩm
    renderRecordingState(data, {
      recordStatusEl,
      recordTimerEl,
      startBtn,
      stopBtn,
      pauseBtn,
      resumeBtn,
      recordCardEl,
      recordHintEl,
    });
    const currentCode = data.current_order_code || null;
    const orderForAudio = data.order_info;
    const totalItems = typeof data.total_items === "number" ? data.total_items : 0;
    const WARNING_THRESHOLD = 5; // Đơn có từ 5 sản phẩm trở lên sẽ cảnh báo
    const shippingAnnouncement = getShippingAnnouncement(data.order_info);
    const shippingKey = currentCode && shippingAnnouncement ? `${currentCode}:${shippingAnnouncement}` : null;
    const isFirstStatusHydration = !statusAudioHydrated;

    // Hết đơn (reset) => cho phép lần sau quét lại cùng mã vẫn có TTS/beep.
    const scanInputEl = document.getElementById("manualScanInput");
    const hadKnownOrderBeforeReset = !!lastOrderCode;
    if (!currentCode) {
      lastOrderCode = null;
      lastOrderAudioNonce = null;
      lastShippingAnnouncementKey = null;
      try {
        sessionStorage.removeItem(ANNOUNCED_ORDER_CODES_KEY);
      } catch (_) {}
      if (hadKnownOrderBeforeReset) {
        focusSerialInput({ clear: true, highlight: true });
      } else if (scanInputEl && document.activeElement !== scanInputEl) {
        focusSerialInput({ clear: false, highlight: false });
      }
    }

    if (!isFirstStatusHydration && currentCode && currentCode !== lastOrderCode) {
      if (totalItems >= WARNING_THRESHOLD && qtyWarningAudio) {
        try {
          qtyWarningAudio.currentTime = 0;
          await qtyWarningAudio.play();
        } catch (e) {
          console.warn("Không phát được âm thanh cảnh báo:", e);
        }
      }
      focusSerialInput({ clear: true, highlight: false });
    }

    const prevAudioNonce = lastOrderAudioNonce == null ? -1 : lastOrderAudioNonce;
    const audioNonce =
      typeof data.order_audio_nonce === "number" ? data.order_audio_nonce : -1;

    // Khi vừa mở/quay lại Dashboard, chỉ đồng bộ trạng thái hiện tại để tránh đọc lại
    // đơn cũ. Audio chỉ nên phát sau khi có lần quét đơn mới làm nonce tăng tiếp.
    if (isFirstStatusHydration) {
      lastOrderCode = currentCode;
      lastOrderAudioNonce = audioNonce;
      lastShippingAnnouncementKey = shippingKey;
      statusAudioHydrated = true;
    }

    const shouldPlayOrderTts =
      statusAudioHydrated &&
      currentCode &&
      orderForAudio &&
      typeof orderForAudio === "object" &&
      audioNonce > prevAudioNonce;

    if (shouldPlayOrderTts) {
      lastOrderAudioNonce = audioNonce;
      const mySeq = ++shippingAnnouncementSeq;
      const playedCount = await speakCountByAudio(totalItems);
      if (playedCount && mySeq === shippingAnnouncementSeq && shippingAnnouncement) {
        await speakShippingStatusByAudio(shippingAnnouncement);
      }
      if (playedCount) {
        lastOrderCode = currentCode;
        lastShippingAnnouncementKey = shippingKey;
      } else if (!audioNeedInteractionToastShown) {
        audioNeedInteractionToastShown = true;
        showToast(
          "⚠️ Âm thanh: trình duyệt chặn autoplay. Hãy click hoặc chạm một lần lên trang (hoặc gõ phím), rồi quét lại — quét chỉ bằng camera không đủ để mở loa."
        );
      }
    } else if (
      orderForAudio &&
      typeof orderForAudio === "object" &&
      currentCode &&
      audioNonce <= prevAudioNonce &&
      currentCode !== lastOrderCode
    ) {
      // Backend cũ không có order_audio_nonce: giữ hành vi cũ (chỉ khi đổi mã trên UI).
      let audioCommitted = hasAnnouncedOrderCode(currentCode);
      if (!audioCommitted) {
        const mySeq = ++shippingAnnouncementSeq;
        const playedCount = await speakCountByAudio(totalItems);
        if (playedCount && mySeq === shippingAnnouncementSeq && shippingAnnouncement) {
          await speakShippingStatusByAudio(shippingAnnouncement);
        }
        if (playedCount) {
          markOrderCodeAnnounced(currentCode);
          audioCommitted = true;
        } else if (!audioNeedInteractionToastShown) {
          audioNeedInteractionToastShown = true;
          showToast(
            "⚠️ Âm thanh: trình duyệt chặn autoplay. Hãy click hoặc chạm một lần lên trang (hoặc gõ phím), rồi quét lại — quét chỉ bằng camera không đủ để mở loa."
          );
        }
      }
      if (audioCommitted) {
        lastOrderCode = currentCode;
        lastShippingAnnouncementKey = shippingKey;
      }
    } else if (
      currentCode &&
      currentCode !== lastOrderCode &&
      (!orderForAudio || typeof orderForAudio !== "object")
    ) {
      const running = await ensureAudioContextRunning();
      if (running) {
        playBeep("start");
        if (shippingAnnouncement) {
          await speakShippingStatusByAudio(shippingAnnouncement);
        }
        markOrderCodeAnnounced(currentCode);
        lastOrderCode = currentCode;
        lastShippingAnnouncementKey = shippingKey;
      } else if (!audioNeedInteractionToastShown) {
        audioNeedInteractionToastShown = true;
        showToast("⚠️ Âm thanh: hãy click/chạm trang một lần để bật loa, rồi quét lại.");
      }
    } else if (shippingKey && shippingKey !== lastShippingAnnouncementKey) {
      // Trạng thái ship thay đổi trên cùng mã đơn => đọc lại bằng audio token.
      await speakShippingStatusByAudio(shippingAnnouncement);
      lastShippingAnnouncementKey = shippingKey;
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
      if (recordCardEl) {
        recordCardEl.classList.remove("is-recording", "is-paused");
      }

      if (isRecording) {
        if (isPaused) {
          recordStatusEl.className = "record-status-badge is-paused";
          recordStatusEl.innerHTML = '<span class="record-dot" aria-hidden="true"></span>Tạm dừng';
          if (recordHintEl) recordHintEl.textContent = "Đang tạm dừng";
          if (recordCardEl) recordCardEl.classList.add("is-paused");
        } else {
          recordStatusEl.className = "record-status-badge is-recording";
          recordStatusEl.innerHTML = '<span class="record-dot" aria-hidden="true"></span>Đang ghi';
          if (recordHintEl) recordHintEl.textContent = "Đang ghi hình";
          if (recordCardEl) recordCardEl.classList.add("is-recording");
        }
        recordTimerEl.textContent = formatSeconds(data.recording_seconds);

        startBtn.disabled = true;
        startBtn.classList.remove("btn-pulse-ready");
        stopBtn.disabled = false;
        if (pauseBtn) pauseBtn.disabled = isPaused;
        if (resumeBtn) resumeBtn.disabled = !isPaused;
      } else {
        recordStatusEl.className = "record-status-badge is-idle";
        recordStatusEl.innerHTML = '<span class="record-dot" aria-hidden="true"></span>Idle';
        if (recordHintEl) recordHintEl.textContent = "Sẵn sàng ghi hình";
        recordTimerEl.textContent = "00:00";

        startBtn.disabled = false;
        startBtn.classList.add("btn-pulse-ready");
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
      showToast(formatNotificationToastMessage(level, msg));
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
    } else {
      await ensureAudioContextRunning();
      playBeep("start");
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
    const res = await fetch("/stop_recording", {
      method: "POST",
      headers: {
        "X-EcoHub-Force-Stop": "1",
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const packing = data.packing_state || {};
      const serialErrorEl = document.getElementById("serialErrorAudio");
      if (serialErrorEl && (packing.has_excess || packing.has_missing)) {
        try {
          serialErrorEl.currentTime = 0;
          serialErrorEl.play();
        } catch (_) {}
      }
      alert(data.error || "Không dừng quay được.");
    } else {
      if (data.forced_stop) {
        showToast("⚠️ Đã kết thúc. Thời lượng: " + (data.duration || 0) + " giây");
      } else {
        showToast("✅ In xong! Thời lượng: " + (data.duration || 0) + " giây");
      }
      playBeep("stop");
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
  const normalizedMessage = String(message || "").trim();
  const now = Date.now();
  if (
    normalizedMessage &&
    normalizedMessage === lastToastMessage &&
    now - lastToastAt < TOAST_DEDUP_WINDOW_MS
  ) {
    return;
  }
  lastToastMessage = normalizedMessage;
  lastToastAt = now;

  const toastEl = document.getElementById("successToast");
  const toastBody = document.getElementById("toastBody");
  if (toastBody) toastBody.textContent = normalizedMessage;
  if (toastEl) {
    const toast = new bootstrap.Toast(toastEl, { delay: 4000 });
    toast.show();
  }
}

function formatNotificationToastMessage(level, message) {
  const msg = String(message || "");
  if (!msg) return "";
  if (/^[\u2705\u274c\u26a0\u2139\ud83c\udfa5\u23f9]/u.test(msg)) {
    return msg;
  }
  if (level === "error") return "❌ " + msg;
  if (level === "warning") return "⚠️ " + msg;
  return msg;
}

async function resetOrder() {
  try {
    const res = await fetch("/reset_order", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast("❌ " + (data.error || "Không reset được mã hiện tại"));
      return;
    }
    if (data.discarded) {
      showToast("🗑️ Đã hủy phiên quay và xóa video nháp");
    } else {
      showToast("✅ " + (data.message || "Đã reset mã hiện tại"));
    }
    queueFetchStatus();
  } catch (e) {
    console.error(e);
    showToast("❌ Lỗi kết nối khi reset mã");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");
  const pauseBtn = document.getElementById("pauseBtn");
  const resumeBtn = document.getElementById("resumeBtn");
  const resetOrderBtn = document.getElementById("resetOrderBtn");
  const flowOutbound = document.getElementById("recordingFlowOutbound");
  const flowReturn = document.getElementById("recordingFlowReturn");

  if (flowOutbound) {
    flowOutbound.addEventListener("change", () => {
      if (flowOutbound.checked) void setRecordingFlow("outbound");
    });
  }
  if (flowReturn) {
    flowReturn.addEventListener("change", () => {
      if (flowReturn.checked) void setRecordingFlow("return");
    });
  }

  if (startBtn) startBtn.addEventListener("click", startRecording);
  if (stopBtn) stopBtn.addEventListener("click", stopRecording);
  if (pauseBtn) pauseBtn.addEventListener("click", pauseRecording);
  if (resumeBtn) resumeBtn.addEventListener("click", resumeRecording);
  if (resetOrderBtn) resetOrderBtn.addEventListener("click", resetOrder);

  document.querySelectorAll("#cameraStream, .camera-wrap img").forEach((el) => {
    el.addEventListener(
      "pointerdown",
      () => {
        void ensureAudioContextRunning();
      },
      { passive: true }
    );
  });

  document.addEventListener("keydown", (e) => {
    if (e.code !== "Space") return;
    const target = e.target;
    const tag = (target && target.tagName ? target.tagName : "").toLowerCase();
    const isTypingContext =
      tag === "input" ||
      tag === "textarea" ||
      tag === "select" ||
      (target && target.isContentEditable);
    if (isTypingContext) return;
    if (!startBtn || !stopBtn) return;
    e.preventDefault();
    if (!stopBtn.disabled) {
      stopRecording();
    } else if (!startBtn.disabled) {
      startRecording();
    }
  });

  // Tránh scanner dính chuỗi nhiều mã (do input không được clear kịp).
  const scanForm = document.getElementById("manualScanForm");
  const scanInput = document.getElementById("manualScanInput");
  const orderScanForm = document.getElementById("manualOrderScanForm");
  const orderScanInput = document.getElementById("manualOrderScanInput");
  const manualOrderForm = document.getElementById("manualOrderForm");
  const manualOrderInput = document.getElementById("manualOrderInput");

  const submitScannerInput = async (targetInput) => {
    if (targetInput === orderScanInput) {
      if (!orderScanInput || orderSubmitInFlight) return;
      const orderCode = (orderScanInput.value || "").trim();
      if (!orderCode) return;
      orderSubmitInFlight = true;
      unlockAudioContext();
      setTimeout(() => {
        try { orderScanInput.value = ""; } catch (_) {}
      }, 0);
      const result = await submitManualOrderAjax(orderCode);
      const ok = result && result.ok;
      orderSubmitInFlight = false;
      if (ok) {
        showToast("✅ Đã nhận mã đơn: " + orderCode);
        focusSerialInput({ clear: true, highlight: true });
        setTimeout(queueFetchStatus, 100);
      } else {
        focusOrderScanInput({ clear: true });
      }
      return;
    }
  };

  async function submitSerialScanFromInput() {
    if (!scanInput || serialSubmitInFlight) return;
    const code = (scanInput.value || "").trim();
    if (!code) return;
    serialSubmitInFlight = true;
    unlockAudioContext();
    setTimeout(() => {
      try { scanInput.value = ""; scanInput.focus(); } catch (_) {}
    }, 0);
    const result = await submitManualScanAjax(code);
    serialSubmitInFlight = false;
    if (result && result.ok) {
      if (result.kind === "order-stop" || result.action === "stop") {
        showToast("⏹️ Đã kết thúc quay: " + (result.code || code));
        focusSerialInput({ clear: true, highlight: true });
        setTimeout(queueFetchStatus, 100);
        return;
      }
      if (result.kind === "order") {
        showToast("✅ Đã nhận mã đơn: " + (result.code || code));
        focusSerialInput({ clear: true, highlight: true });
        setTimeout(queueFetchStatus, 100);
        return;
      }
      if (result.kind === "order-stop" || result.action === "stop") {
        showToast("✅ Đã nhận mã đơn: " + (result.code || code));
        focusSerialInput({ clear: true, highlight: true });
      } else {
        showToast("✅ Đã quét serial: " + (result.code || code));
        focusSerialInput({ clear: true });
      }
      setTimeout(queueFetchStatus, 100);
    }
  }

  async function submitOrderScanFromInput() {
    if (!orderScanInput || orderSubmitInFlight) return;
    const orderCode = (orderScanInput.value || "").trim();
    if (!orderCode) return;
    orderSubmitInFlight = true;
    unlockAudioContext();
    setTimeout(() => {
      try { orderScanInput.value = ""; } catch (_) {}
    }, 0);
    const result = await submitManualOrderAjax(orderCode);
    const ok = result && result.ok;
    orderSubmitInFlight = false;
    if (ok) {
      showToast("✅ Đã nhận mã đơn: " + orderCode);
      focusSerialInput({ clear: true, highlight: true });
      setTimeout(queueFetchStatus, 100);
    } else {
      focusOrderScanInput({ clear: true });
    }
  }

  if (scanForm && scanInput) {
    scanForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (serialAutoSubmitTimer) {
        clearTimeout(serialAutoSubmitTimer);
        serialAutoSubmitTimer = null;
      }
      await submitSerialScanFromInput();
    });

    scanInput.addEventListener("input", () => {
      if (serialAutoSubmitTimer) clearTimeout(serialAutoSubmitTimer);
      const raw = (scanInput.value || "").trim();
      if (!raw) return;
      serialAutoSubmitTimer = setTimeout(() => {
        serialAutoSubmitTimer = null;
        void submitSerialScanFromInput();
      }, 180);
    });

    scanInput.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      if (serialAutoSubmitTimer) {
        clearTimeout(serialAutoSubmitTimer);
        serialAutoSubmitTimer = null;
      }
    });

    const flushWedgeBufferToSerialInput = async () => {
      if (!serialWedgeBuffer || serialSubmitInFlight) return;
      const bufferedCode = serialWedgeBuffer.trim();
      serialWedgeBuffer = "";
      serialWedgeLastTs = 0;
      if (!bufferedCode) return;
      scanInput.value = bufferedCode;
      await submitSerialScanFromInput();
    };

    document.addEventListener(
      "keydown",
      (e) => {
        const active = document.activeElement;
        const target = e.target;
        const targetTag = (target && target.tagName ? target.tagName : "").toLowerCase();
        const isTypingContext =
          target === scanInput ||
          target === orderScanInput ||
          target === manualOrderInput ||
          targetTag === "textarea" ||
          targetTag === "select" ||
          (target && target.isContentEditable);

        if (isTypingContext) return;

        const now = Date.now();
        if (now - serialWedgeLastTs > 120) {
          serialWedgeBuffer = "";
        }
        serialWedgeLastTs = now;

        if (e.key === "Enter") {
          if (!serialWedgeBuffer) return;
          e.preventDefault();
          if (serialWedgeFlushTimer) {
            clearTimeout(serialWedgeFlushTimer);
            serialWedgeFlushTimer = null;
          }
          focusSerialInput({ clear: true });
          void flushWedgeBufferToSerialInput();
          return;
        }

        if (e.key.length !== 1) return;
        if (e.ctrlKey || e.altKey || e.metaKey) return;

        serialWedgeBuffer += e.key;
        focusSerialInput({ clear: true });
        scanInput.value = serialWedgeBuffer;
        e.preventDefault();

        if (serialWedgeFlushTimer) clearTimeout(serialWedgeFlushTimer);
        serialWedgeFlushTimer = setTimeout(() => {
          serialWedgeFlushTimer = null;
          void flushWedgeBufferToSerialInput();
        }, 220);
      },
      true
    );
  }

  if (orderScanForm && orderScanInput) {
    orderScanForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (orderScanAutoSubmitTimer) {
        clearTimeout(orderScanAutoSubmitTimer);
        orderScanAutoSubmitTimer = null;
      }
      await submitOrderScanFromInput();
    });

    orderScanInput.addEventListener("input", () => {
      if (orderScanAutoSubmitTimer) clearTimeout(orderScanAutoSubmitTimer);
      const raw = (orderScanInput.value || "").trim();
      if (!raw) return;
      orderScanAutoSubmitTimer = setTimeout(() => {
        orderScanAutoSubmitTimer = null;
        void submitOrderScanFromInput();
      }, 180);
    });

    orderScanInput.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      if (orderScanAutoSubmitTimer) {
        clearTimeout(orderScanAutoSubmitTimer);
        orderScanAutoSubmitTimer = null;
      }
    });
  }

  if (manualOrderForm && manualOrderInput) {
    manualOrderForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      // Giống form quét scanner: mở WebAudio trong user gesture để TTS không bị chặn.
      unlockAudioContext();
      const orderCode = (manualOrderInput.value || "").trim();
      if (!orderCode) {
        showToast("❌ Vui lòng nhập mã đơn");
        manualOrderInput.focus();
        return;
      }
      const result = await submitManualOrderAjax(orderCode);
      if (result && result.ok) {
        manualOrderInput.focus();
        manualOrderInput.select();
        // Cập nhật ngay thông tin đơn thay vì chờ poll 1s.
        queueFetchStatus();
      }
    });
  }

  // Poll mỗi 1s — xếp hàng để không chồng await TTS giữa các tick
  setInterval(queueFetchStatus, 300);
  queueFetchStatus();
});
