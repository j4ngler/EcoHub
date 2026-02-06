function formatSeconds(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
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

    if (recordStatusEl && recordTimerEl && startBtn && stopBtn) {
      if (data.is_recording) {
        recordStatusEl.textContent = "Recording";
        recordStatusEl.className = "badge bg-danger";
        recordTimerEl.textContent = formatSeconds(data.recording_seconds);
        startBtn.disabled = true;
        stopBtn.disabled = false;
      } else {
        recordStatusEl.textContent = "Idle";
        recordStatusEl.className = "badge bg-secondary";
        recordTimerEl.textContent = "00:00";
        startBtn.disabled = false;
        stopBtn.disabled = true;
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
      alert(data.error || "Không dừng quay được.");
    } else {
      // Hiện thông báo "In xong" bằng toast
      showToast("✅ In xong! Thời lượng: " + (data.duration || 0) + " giây");
    }
  } catch (e) {
    console.error(e);
    alert("Lỗi kết nối. Kiểm tra server đã chạy chưa.");
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
  const resetOrderBtn = document.getElementById("resetOrderBtn");

  if (startBtn) startBtn.addEventListener("click", startRecording);
  if (stopBtn) stopBtn.addEventListener("click", stopRecording);
  if (resetOrderBtn) resetOrderBtn.addEventListener("click", resetOrder);

  // Poll mỗi 1s
  setInterval(fetchStatus, 1000);
  fetchStatus();
});

