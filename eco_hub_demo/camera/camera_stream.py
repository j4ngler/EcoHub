import numpy as np
import cv2


def generate_mjpeg(camera_manager, ai_scanner):
    """
    Generator trả về MJPEG stream cho Flask Response.
    Bắt mọi exception để tránh crash server (đặc biệt với RTSP).
    OPTIMIZATION: Giảm quality và resize để tăng tốc encoding.
    """
    h = getattr(camera_manager, "height", 720)
    w = getattr(camera_manager, "width", 1280)
    fallback_frame = np.zeros((max(240, h), max(320, w), 3), dtype=np.uint8)

    while True:
        try:
            frame = camera_manager.get_frame()
            if frame is None:
                frame = fallback_frame.copy()
            else:
                try:
                    # Vẽ QR detection boxes
                    detections = ai_scanner.get_detections()
                    for det in detections:
                        x, y, dw, dh = det["x"], det["y"], det["w"], det["h"]
                        text = det.get("text", "")
                        cv2.rectangle(frame, (x, y), (x + dw, y + dh), (0, 255, 0), 2)
                        cv2.putText(
                            frame, text, (x, max(0, y - 10)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2,
                        )
                except Exception:
                    pass
                
                # OPTIMIZATION: Resize để giảm băng thông và tăng tốc encoding
                fh, fw = frame.shape[:2]
                if fw > 960:  # Resize xuống 960px nếu quá lớn
                    scale = 960.0 / fw
                    frame = cv2.resize(frame, (960, int(fh * scale)))

            # OPTIMIZATION: Giảm JPEG quality từ 95 xuống 75 (nhanh gấp 2x)
            encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), 75]
            ret, buffer = cv2.imencode(".jpg", frame, encode_param)
            if not ret:
                continue
            jpg_bytes = buffer.tobytes()
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n" + jpg_bytes + b"\r\n"
            )
        except GeneratorExit:
            break
        except Exception:
            try:
                ret, buffer = cv2.imencode(".jpg", fallback_frame)
                if ret:
                    yield (
                        b"--frame\r\n"
                        b"Content-Type: image/jpeg\r\n\r\n" + buffer.tobytes() + b"\r\n"
                    )
            except Exception:
                pass

