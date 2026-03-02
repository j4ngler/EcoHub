const fs = require('fs');
const path = require('path');
const { convertMarkdownToDocx } = require('@mohtasham/md-to-docx');

const inputPath = path.join(__dirname, '..', 'PROJECT_SUMMARY.md');
const outputPath = path.join(__dirname, '..', 'PROJECT_SUMMARY.docx');

async function run() {
  const markdown = fs.readFileSync(inputPath, 'utf8');
  const blob = await convertMarkdownToDocx(markdown);
  const buffer = Buffer.from(await blob.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
  console.log('Đã tạo:', outputPath);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
