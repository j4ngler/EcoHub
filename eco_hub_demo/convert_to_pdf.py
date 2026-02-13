"""
Convert all Markdown documentation to PDF
"""
import os
import markdown
from weasyprint import HTML, CSS
from pathlib import Path

# List of documentation files to convert
DOC_FILES = [
    "README.md",
    "DOCS.md",
    "USER_MANUAL.md",
    "DEVELOPER_GUIDE.md",
    "ARCHITECTURE.md",
    "BUILD_GUIDE.md",
    "QUICK_REFERENCE.md",
    "CHANGELOG.md",
    "CAMERA_SAFE_START.md",
    "CAMERA_SETTINGS_UPDATE.md",
    "PYINSTALLER_FIX.md",
    "DOCUMENTATION_INDEX.md",
    "FINAL_SUMMARY.md",
]

# CSS styling for PDF
PDF_CSS = """
@page {
    size: A4;
    margin: 2cm;
}

body {
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.6;
    color: #333;
}

h1 {
    color: #2c3e50;
    border-bottom: 3px solid #3498db;
    padding-bottom: 10px;
    margin-top: 30px;
    font-size: 24pt;
}

h2 {
    color: #34495e;
    border-bottom: 2px solid #95a5a6;
    padding-bottom: 8px;
    margin-top: 25px;
    font-size: 20pt;
}

h3 {
    color: #555;
    margin-top: 20px;
    font-size: 16pt;
}

code {
    background-color: #f4f4f4;
    padding: 2px 6px;
    border-radius: 3px;
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 10pt;
}

pre {
    background-color: #f8f8f8;
    border: 1px solid #ddd;
    border-radius: 5px;
    padding: 15px;
    overflow-x: auto;
    font-size: 9pt;
}

pre code {
    background-color: transparent;
    padding: 0;
}

blockquote {
    border-left: 4px solid #3498db;
    padding-left: 15px;
    margin-left: 0;
    color: #555;
    font-style: italic;
}

table {
    border-collapse: collapse;
    width: 100%;
    margin: 15px 0;
}

table th {
    background-color: #3498db;
    color: white;
    padding: 10px;
    text-align: left;
}

table td {
    border: 1px solid #ddd;
    padding: 8px;
}

table tr:nth-child(even) {
    background-color: #f9f9f9;
}

a {
    color: #3498db;
    text-decoration: none;
}

ul, ol {
    margin-left: 20px;
}

li {
    margin: 5px 0;
}

.emoji {
    font-size: 1.2em;
}
"""

def convert_md_to_pdf(md_file, output_dir="pdf_docs"):
    """Convert a single Markdown file to PDF"""
    try:
        # Create output directory
        os.makedirs(output_dir, exist_ok=True)
        
        # Read markdown file
        with open(md_file, 'r', encoding='utf-8') as f:
            md_content = f.read()
        
        # Convert markdown to HTML
        html_content = markdown.markdown(
            md_content,
            extensions=[
                'extra',
                'codehilite',
                'tables',
                'fenced_code',
                'toc'
            ]
        )
        
        # Wrap in HTML structure
        full_html = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>{Path(md_file).stem}</title>
</head>
<body>
    {html_content}
</body>
</html>
        """
        
        # Generate PDF filename
        pdf_file = os.path.join(output_dir, f"{Path(md_file).stem}.pdf")
        
        # Convert HTML to PDF
        HTML(string=full_html).write_pdf(
            pdf_file,
            stylesheets=[CSS(string=PDF_CSS)]
        )
        
        print(f"✅ Converted: {md_file} → {pdf_file}")
        return True
        
    except Exception as e:
        print(f"❌ Error converting {md_file}: {e}")
        return False

def main():
    print("=" * 60)
    print("  MARKDOWN TO PDF CONVERTER")
    print("=" * 60)
    print()
    
    # Check if files exist
    existing_files = [f for f in DOC_FILES if os.path.exists(f)]
    
    if not existing_files:
        print("❌ No documentation files found!")
        return
    
    print(f"Found {len(existing_files)} documentation files to convert:")
    for f in existing_files:
        print(f"  - {f}")
    print()
    
    # Convert each file
    success_count = 0
    for md_file in existing_files:
        if convert_md_to_pdf(md_file):
            success_count += 1
    
    print()
    print("=" * 60)
    print(f"  CONVERSION COMPLETE")
    print("=" * 60)
    print(f"  Success: {success_count}/{len(existing_files)} files")
    print(f"  Output:  pdf_docs/ folder")
    print("=" * 60)

if __name__ == "__main__":
    main()
