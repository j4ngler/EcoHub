# 🔧 PYINSTALLER FIX - STATIC/TEMPLATES/CONFIG

## ❌ **VẤN ĐỀ:**

Khi build bằng PyInstaller, thiếu các files:
- `static/` folder
- `templates/` folder  
- `config.key` file

## ✅ **GIẢI PHÁP:**

### **1. Sửa `build.spec` - Thêm `config.key`**

```python
datas=[
    ('templates', 'templates'),
    ('static', 'static'),
    ('config.json', '.'),
    ('config.key', '.'),  # ← Thêm dòng này
    ('README.md', '.'),
],
```

### **2. Sửa `app.py` - Handle PyInstaller paths**

#### **A. Thêm hàm `get_base_path()`:**

```python
def get_base_path():
    """Get base path - works for both dev and PyInstaller"""
    if getattr(sys, 'frozen', False):
        # Running in PyInstaller bundle
        return sys._MEIPASS
    else:
        # Running in normal Python
        return os.path.dirname(os.path.abspath(__file__))
```

#### **B. Sử dụng đúng paths:**

```python
BASE_DIR = get_base_path()

# Data directory cho config và videos (writable)
if getattr(sys, 'frozen', False):
    # PyInstaller: Dùng user's app data directory
    DATA_DIR = os.path.join(os.path.expanduser('~'), 'EcoHub_QR_Scanner')
else:
    # Dev: Dùng project directory
    DATA_DIR = os.path.dirname(os.path.abspath(__file__))

VIDEOS_DIR = os.path.join(DATA_DIR, "videos")
CONFIG_FILE = os.path.join(DATA_DIR, "config.json")
CONFIG_KEY_FILE = os.path.join(DATA_DIR, "config.key")
```

#### **C. Copy default configs khi first run:**

```python
# Copy default config files if not exist (for first run)
import shutil
if not os.path.exists(CONFIG_FILE):
    default_config = os.path.join(BASE_DIR, "config.json")
    if os.path.exists(default_config):
        shutil.copy(default_config, CONFIG_FILE)
        print(f"[STARTUP] Copied default config.json to {CONFIG_FILE}")

if not os.path.exists(CONFIG_KEY_FILE):
    default_key = os.path.join(BASE_DIR, "config.key")
    if os.path.exists(default_key):
        shutil.copy(default_key, CONFIG_KEY_FILE)
        print(f"[STARTUP] Copied config.key to {CONFIG_KEY_FILE}")
```

#### **D. Khởi tạo Flask với explicit paths:**

```python
# Flask app với paths cho PyInstaller
template_folder = os.path.join(BASE_DIR, 'templates')
static_folder = os.path.join(BASE_DIR, 'static')

app = Flask(__name__, 
            template_folder=template_folder,
            static_folder=static_folder)

print(f"[STARTUP] BASE_DIR: {BASE_DIR}")
print(f"[STARTUP] Templates: {template_folder}")
print(f"[STARTUP] Static: {static_folder}")
print(f"[STARTUP] Videos: {VIDEOS_DIR}")
```

#### **E. Sử dụng CONFIG_KEY_FILE cho encryption:**

```python
# Encryption cho sensitive data (use CONFIG_KEY_FILE from DATA_DIR)
encryptor = get_encryptor(CONFIG_KEY_FILE)
```

---

## 🗂️ **CẤU TRÚC PATHS:**

### **Khi DEV (python app.py):**

```
eco_hub_demo/
├── app.py                  ← Chạy từ đây
├── static/                 ← BASE_DIR = đây
├── templates/              ← BASE_DIR = đây
├── config.json             ← DATA_DIR = BASE_DIR
├── config.key              ← DATA_DIR = BASE_DIR
└── videos/                 ← DATA_DIR = BASE_DIR
```

### **Khi PYINSTALLER (EcoHub_QR_Scanner.exe):**

```
dist/EcoHub_QR_Scanner/
├── EcoHub_QR_Scanner.exe
└── _internal/
    ├── static/             ← BASE_DIR = _MEIPASS (_internal)
    ├── templates/          ← BASE_DIR = _MEIPASS (_internal)
    ├── config.json         ← BASE_DIR = _MEIPASS (read-only)
    └── config.key          ← BASE_DIR = _MEIPASS (read-only)

C:\Users\<user>\EcoHub_QR_Scanner/
├── config.json             ← DATA_DIR (writable copy)
├── config.key              ← DATA_DIR (writable copy)
└── videos/                 ← DATA_DIR (writable)
```

**Logic:**
- **Templates/Static**: Đọc từ `_MEIPASS` (built-in)
- **Config files**: Copy từ `_MEIPASS` → User home (first run)
- **Videos**: Lưu vào User home (writable)

---

## 📋 **KIỂM TRA KẾT QUẢ:**

### **Test 1: Files trong dist**

```bash
dir "dist\EcoHub_QR_Scanner\_internal" | findstr /I "static templates config"
```

**Kết quả:**
```
✅ d----- static/
✅ d----- templates/
✅ -a---- config.json (899 bytes)
✅ -a---- config.key (44 bytes)
```

### **Test 2: Chạy EXE**

```bash
dist\EcoHub_QR_Scanner\EcoHub_QR_Scanner.exe
```

**Console output:**
```
[STARTUP] BASE_DIR: C:\Users\...\AppData\Local\Temp\_MEI123456
[STARTUP] Templates: ...\AppData\Local\Temp\_MEI123456\templates
[STARTUP] Static: ...\AppData\Local\Temp\_MEI123456\static
[STARTUP] Videos: C:\Users\<user>\EcoHub_QR_Scanner\videos
[STARTUP] Copied default config.json to C:\Users\<user>\EcoHub_QR_Scanner\config.json
[STARTUP] Copied config.key to C:\Users\<user>\EcoHub_QR_Scanner\config.key
```

---

## ⚙️ **BUILD LỆNH:**

```bash
# Clean
powershell -Command "Remove-Item -Recurse -Force 'dist','build'"

# Build
pyinstaller build.spec --clean

# Check
dir "dist\EcoHub_QR_Scanner\_internal" | findstr /I "static templates config"
```

---

## 🎯 **KẾT QUẢ:**

✅ **Tất cả files có mặt trong build**
✅ **Flask tìm thấy templates/static**
✅ **Config files được copy vào user directory**
✅ **App chạy OK cả dev và PyInstaller**

---

## 📝 **FILES ĐÃ SỬA:**

1. **`build.spec`** - Thêm `config.key` vào `datas`
2. **`app.py`** - Thêm:
   - `get_base_path()` function
   - DATA_DIR for writable files
   - Copy default configs on first run
   - Flask explicit paths (template_folder, static_folder)
   - Use CONFIG_KEY_FILE for encryption
