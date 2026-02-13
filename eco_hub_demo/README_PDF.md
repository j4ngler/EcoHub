# 📄 HƯỚNG DẪN TẠO PDF TỪ TÀI LIỆU

## ✅ ĐÃ TẠO HTML FILES

Tất cả tài liệu đã được convert sang HTML:
```
html_docs/
├── README.html
├── DOCS.html
├── USER_MANUAL.html
├── DEVELOPER_GUIDE.html
├── ARCHITECTURE.html
├── BUILD_GUIDE.html
├── QUICK_REFERENCE.html
├── CHANGELOG.html
├── CAMERA_SAFE_START.html
├── CAMERA_SETTINGS_UPDATE.html
├── PYINSTALLER_FIX.html
├── DOCUMENTATION_INDEX.html
└── FINAL_SUMMARY.html
```

---

## 🔄 CÁCH CONVERT SANG PDF

### **Cách 1: Manual (Đơn giản nhất - Khuyến nghị)**

1. Mở folder `html_docs/`
2. Double-click file `.html` bất kỳ → Mở bằng Chrome/Edge
3. Nhấn `Ctrl+P` (Print)
4. Chọn **"Save as PDF"**
5. Save vào folder `pdf_docs/`
6. Lặp lại cho 13 files

**Settings cho PDF đẹp:**
- Layout: Portrait (dọc)
- Paper size: A4
- Margins: Default
- Scale: 100%
- Options: ☑ Background graphics

---

### **Cách 2: Dùng wkhtmltopdf (Tự động hơn)**

#### **Bước 1: Download wkhtmltopdf**
```
https://wkhtmltopdf.org/downloads.html
→ Windows 64-bit installer
→ Cài đặt (Next → Next → Install)
```

#### **Bước 2: Chạy script**
```bash
convert_to_pdf_wkhtmltopdf.bat
```

Script sẽ tự động convert tất cả HTML sang PDF.

---

### **Cách 3: Dùng Chrome Headless (Command line)**

```bash
# Mở PowerShell trong folder html_docs

# Convert 1 file
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --headless --disable-gpu --print-to-pdf="pdf_docs\README.pdf" `
  "README.html"

# Hoặc dùng script tự động (đã tạo sẵn)
..\convert_html_to_pdf_chrome.ps1
```

---

### **Cách 4: Online converter (Nếu không có Chrome/Edge)**

1. Upload HTML file lên:
   - https://www.html-to-pdf.net/
   - https://pdfcrowd.com/html-to-pdf/
   - https://www.sejda.com/html-to-pdf

2. Convert & Download PDF

---

## 📦 KẾT QUẢ

Sau khi convert xong, bạn sẽ có:

```
pdf_docs/
├── README.pdf
├── DOCS.pdf
├── USER_MANUAL.pdf
├── DEVELOPER_GUIDE.pdf
├── ARCHITECTURE.pdf
├── BUILD_GUIDE.pdf
├── QUICK_REFERENCE.pdf
├── CHANGELOG.pdf
├── CAMERA_SAFE_START.pdf
├── CAMERA_SETTINGS_UPDATE.pdf
├── PYINSTALLER_FIX.pdf
├── DOCUMENTATION_INDEX.pdf
└── FINAL_SUMMARY.pdf
```

**Tổng:** 13 PDF files

---

## 💡 TIPS

### **Để PDF đẹp hơn:**
- Dùng Chrome/Edge thay vì Firefox
- Chọn "Background graphics" khi print
- Scale 100% (không zoom)
- Margins: Default hoặc Small

### **Để file nhỏ hơn:**
- Scale 90%
- Margins: Normal
- Grayscale (nếu không cần màu)

### **Troubleshooting:**
- Nếu font bị lỗi → Dùng Chrome/Edge
- Nếu code block bị cắt → Giảm scale xuống 90%
- Nếu emoji không hiện → OK, không ảnh hưởng content

---

## ⚡ SCRIPT TỰ ĐỘNG

Tôi đã tạo sẵn các script tự động:

1. **convert_to_pdf_simple.py** - Tạo HTML files ✅
2. **convert_to_pdf_wkhtmltopdf.bat** - Convert với wkhtmltopdf (cần cài)
3. **convert_html_to_pdf_chrome.ps1** - Convert với Chrome headless

Chọn cách nào tùy bạn!

---

**Updated:** 09/02/2026
