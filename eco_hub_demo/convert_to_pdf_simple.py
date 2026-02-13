"""
Simple Markdown to PDF converter using markdown and pdfkit
Alternative method if weasyprint doesn't work
"""
import os
import sys
import markdown
from pathlib import Path

# Fix Windows console encoding
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except:
        pass

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

# HTML template with CSS
HTML_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>{title}</title>
    <style>
        @page {{
            size: A4;
            margin: 2cm;
        }}
        
        body {{
            font-family: 'Segoe UI', Arial, sans-serif;
            font-size: 11pt;
            line-height: 1.6;
            color: #333;
            max-width: 900px;
            margin: 0 auto;
        }}
        
        h1 {{
            color: #2c3e50;
            border-bottom: 3px solid #3498db;
            padding-bottom: 10px;
            margin-top: 30px;
            font-size: 24pt;
            page-break-before: auto;
        }}
        
        h2 {{
            color: #34495e;
            border-bottom: 2px solid #95a5a6;
            padding-bottom: 8px;
            margin-top: 25px;
            font-size: 18pt;
        }}
        
        h3 {{
            color: #555;
            margin-top: 20px;
            font-size: 14pt;
        }}
        
        code {{
            background-color: #f4f4f4;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 9pt;
            color: #c7254e;
        }}
        
        pre {{
            background-color: #f8f8f8;
            border: 1px solid #ddd;
            border-radius: 5px;
            padding: 12px;
            overflow-x: auto;
            font-size: 8pt;
            line-height: 1.4;
        }}
        
        pre code {{
            background-color: transparent;
            padding: 0;
            color: #333;
        }}
        
        blockquote {{
            border-left: 4px solid #3498db;
            padding-left: 15px;
            margin-left: 0;
            color: #555;
            font-style: italic;
            background-color: #f9f9f9;
            padding: 10px 15px;
        }}
        
        table {{
            border-collapse: collapse;
            width: 100%;
            margin: 15px 0;
            font-size: 10pt;
        }}
        
        table th {{
            background-color: #3498db;
            color: white;
            padding: 8px;
            text-align: left;
        }}
        
        table td {{
            border: 1px solid #ddd;
            padding: 6px;
        }}
        
        table tr:nth-child(even) {{
            background-color: #f9f9f9;
        }}
        
        a {{
            color: #3498db;
            text-decoration: none;
        }}
        
        ul, ol {{
            margin-left: 20px;
        }}
        
        li {{
            margin: 5px 0;
        }}
        
        hr {{
            border: none;
            border-top: 2px solid #ddd;
            margin: 30px 0;
        }}
        
        img {{
            max-width: 100%;
            height: auto;
        }}
        
        .page-break {{
            page-break-after: always;
        }}
    </style>
</head>
<body>
{content}
</body>
</html>
"""

def convert_md_to_html(md_file, output_dir="html_docs"):
    """Convert Markdown to HTML (for printing to PDF)"""
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
        
        # Wrap in HTML template
        full_html = HTML_TEMPLATE.format(
            title=Path(md_file).stem,
            content=html_content
        )
        
        # Generate HTML filename
        html_file = os.path.join(output_dir, f"{Path(md_file).stem}.html")
        
        # Save HTML
        with open(html_file, 'w', encoding='utf-8') as f:
            f.write(full_html)
        
        print(f"✅ Converted: {md_file} → {html_file}")
        return html_file
        
    except Exception as e:
        print(f"❌ Error converting {md_file}: {e}")
        return None

def convert_html_to_pdf_pdfkit(html_file, pdf_file):
    """Convert HTML to PDF using pdfkit (wkhtmltopdf)"""
    try:
        import pdfkit
        pdfkit.from_file(html_file, pdf_file)
        return True
    except ImportError:
        return False
    except Exception as e:
        print(f"   pdfkit error: {e}")
        return False

def convert_html_to_pdf_weasyprint(html_file, pdf_file):
    """Convert HTML to PDF using weasyprint"""
    try:
        from weasyprint import HTML
        HTML(filename=html_file).write_pdf(pdf_file)
        return True
    except ImportError:
        return False
    except Exception as e:
        print(f"   weasyprint error: {e}")
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
    
    # Step 1: Convert all to HTML
    print("[Step 1/2] Converting Markdown to HTML...")
    html_files = []
    for md_file in existing_files:
        html_file = convert_md_to_html(md_file)
        if html_file:
            html_files.append((md_file, html_file))
    
    print()
    print(f"✅ Created {len(html_files)} HTML files in html_docs/")
    print()
    
    # Step 2: Try to convert HTML to PDF
    print("[Step 2/2] Attempting to convert HTML to PDF...")
    print()
    
    # Check which PDF converter is available
    pdf_method = None
    
    try:
        import weasyprint
        pdf_method = "weasyprint"
        print("✅ WeasyPrint is available")
    except ImportError:
        print("⚠️  WeasyPrint not available")
    
    try:
        import pdfkit
        if pdf_method is None:
            pdf_method = "pdfkit"
        print("✅ pdfkit is available")
    except ImportError:
        print("⚠️  pdfkit not available")
    
    print()
    
    if pdf_method:
        print(f"Using {pdf_method} to generate PDFs...")
        os.makedirs("pdf_docs", exist_ok=True)
        
        success_count = 0
        for md_file, html_file in html_files:
            pdf_file = os.path.join("pdf_docs", f"{Path(md_file).stem}.pdf")
            
            if pdf_method == "weasyprint":
                success = convert_html_to_pdf_weasyprint(html_file, pdf_file)
            else:
                success = convert_html_to_pdf_pdfkit(html_file, pdf_file)
            
            if success:
                print(f"✅ PDF created: {pdf_file}")
                success_count += 1
            else:
                print(f"❌ Failed: {pdf_file}")
        
        print()
        print("=" * 60)
        print(f"  CONVERSION COMPLETE")
        print("=" * 60)
        print(f"  HTML: {len(html_files)} files → html_docs/")
        print(f"  PDF:  {success_count} files → pdf_docs/")
        print("=" * 60)
    else:
        print("=" * 60)
        print("  NO PDF CONVERTER AVAILABLE")
        print("=" * 60)
        print()
        print("HTML files have been created in html_docs/ folder.")
        print()
        print("To convert to PDF, you have 3 options:")
        print()
        print("Option 1 - Install WeasyPrint:")
        print("  pip install weasyprint")
        print()
        print("Option 2 - Install pdfkit + wkhtmltopdf:")
        print("  pip install pdfkit")
        print("  Download: https://wkhtmltopdf.org/downloads.html")
        print()
        print("Option 3 - Manual conversion:")
        print("  1. Open HTML files in Chrome/Edge")
        print("  2. Press Ctrl+P (Print)")
        print("  3. Choose 'Save as PDF'")
        print("  4. Save to pdf_docs/ folder")
        print()
        print("=" * 60)

if __name__ == "__main__":
    main()
