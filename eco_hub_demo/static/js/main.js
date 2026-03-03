function formatSeconds(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

let lastOrderCode = null;

// Trạng thái packing lần trước để so sánh và trigger âm thanh/cảnh báo thông minh hơn.
let lastPackingStateJson = null;

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
      lastOrderCode = currentCode;
    }

    // Cảnh báo âm thanh khi thừa serial: phát khi vừa chuyển sang has_excess (đọc state cũ trước khi render ghi đè).
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
      // Cảnh báo âm thanh khi backend chặn vì chưa quét đủ hoặc thừa serial
      const packing = data.packing_state || {};
      if (packing.has_missing || packing.has_excess) {
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

  // Poll mỗi 1s
  setInterval(fetchStatus, 1000);
  fetchStatus();
});

