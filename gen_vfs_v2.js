// generate-vfs-fonts.js
// Run this script to generate src/lib/vfs_fonts.js
// Example: node generate-vfs-fonts.js

const fs = require('fs');
const path = require('path');

// 1. Specify font files (update paths to your actual .ttf files)
// Ensure these paths are correct relative to where you run this script.
const fontFiles = {
  // Key 'TH SarabunPSK' matches the font family name used in your PDF docDefinition
  'TH SarabunPSK': {
    normal: 'fonts/TH SarabunPSK.ttf',
    bold: 'fonts/TH SarabunPSK Bold.ttf',
    italics: 'fonts/TH SarabunPSK Italic.ttf',
    bolditalics: 'fonts/TH SarabunPSK BoldItalic.ttf'
  },
  'TH Sarabun New': {
    normal: 'fonts/TH-SarabunPSK.ttf',
    bold: 'fonts/TH-SarabunPSK-Bold.ttf',
    italics: 'fonts/TH-SarabunPSK-Italic.ttf',
    bolditalics: 'fonts/TH-SarabunPSK-BoldItalic.ttf'
  }
};

// 2. Convert fonts to base64 and build VFS object
const vfs = {};
let allFontsProcessed = true;

for (const fontName in fontFiles) {
  const fontVariants = fontFiles[fontName];
  console.log(`[Font Script] Processing font family: ${fontName}`);
  for (const variant in fontVariants) {
    const fontPath = path.resolve(fontVariants[variant]);
    console.log(`[Font Script]   Checking ${variant}: ${fontPath}`);
    if (fs.existsSync(fontPath)) {
      try {
        const fontData = fs.readFileSync(fontPath);
        const base64Data = fontData.toString('base64');
        // Use the actual filename as the key in the VFS, as this is what pdfmake expects
        // when you specify the font in the docDefinition's `fonts` section.
        const fileName = path.basename(fontPath);
        vfs[fileName] = base64Data;
        console.log(`[Font Script]     ✅ Loaded ${fileName}`);
      } catch (readError) {
        console.error(`[Font Script]     ❌ Error reading file ${fontPath}:`, readError.message);
        allFontsProcessed = false;
      }
    } else {
      console.error(`[Font Script]     ❌ Font file not found: ${fontPath}`);
      // Depending on your needs, you might want to stop here or continue.
      // For now, let's warn but try to continue.
      allFontsProcessed = false;
    }
  }
}

if (!allFontsProcessed) {
    console.warn("[Font Script] ⚠️  Some fonts could not be processed. Please check the paths and files.");
    // You might choose to exit here if missing fonts are critical.
    // process.exit(1);
}

console.log(`[Font Script] ✅ All available fonts processed. VFS keys:`, Object.keys(vfs));

// 3. Generate vfs_fonts.js content
// This structure `this.pdfMake = ...; this.pdfMake.vfs = ...;` is suitable for direct script tag inclusion
// or for the import structure your API route expects (checking pdfFonts.vfs or pdfFonts.default.vfs).
const output = `this.pdfMake = this.pdfMake || {}; this.pdfMake.vfs = ${JSON.stringify(vfs)};`;

// 4. Write to file
// Ensure the output directory 'src/lib/' exists, or adjust the path as needed.
const outputPath = path.resolve('src/lib/vfs_fonts.js');
const outputDir = path.dirname(outputPath);

if (!fs.existsSync(outputDir)) {
    console.log(`[Font Script] Creating output directory: ${outputDir}`);
    fs.mkdirSync(outputDir, { recursive: true });
}

fs.writeFileSync(outputPath, output);
console.log(`[Font Script] ✅ vfs_fonts.js generated successfully at ${outputPath}!`);
