import numpy as np
import cv2


def generate_mjpeg(camera_manager, ai_scanner):
    """
    Generator trả về MJPEG stream cho Flask Response.
    Bắt mọi exception để tránh crash server (đặc biệt với RTSP).
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

            ret, buffer = cv2.imencode(".jpg", frame)
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

