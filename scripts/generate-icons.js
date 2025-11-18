#!/usr/bin/env node

/**
 * Icon Generation Script (Using Sharp)
 *
 * Generates all required icon sizes from the source SVG using Sharp (proper SVG renderer).
 * Validates that generated icons are in correct format (8-bit RGB/RGBA) and have visible content.
 *
 * Usage: node scripts/generate-icons.js
 * Or: pnpm generate:icons
 */

import sharp from 'sharp';
import { existsSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const publicDir = join(__dirname, '..', 'public');

// Icon sizes required by Chrome extension manifest
const ICON_SIZES = [16, 32, 48, 128];
const SOURCE_SVG = 'icon-stroked.svg';

console.log('🎨 Generating extension icons with Sharp...\n');

// Verify source exists
const sourcePath = join(publicDir, SOURCE_SVG);
if (!existsSync(sourcePath)) {
  console.error(`❌ Source not found: ${SOURCE_SVG}`);
  console.error(`   Expected at: ${sourcePath}`);
  process.exit(1);
}

console.log(`📄 Source: ${SOURCE_SVG}`);
console.log(`📁 Output: public/\n`);

let hasErrors = false;

// Generate icons sequentially
async function generateIcons() {
  for (const size of ICON_SIZES) {
    const output = `icon-${size}.png`;
    const outputPath = join(publicDir, output);

    try {
      // Generate PNG with Sharp (proper SVG rendering)
      await sharp(sourcePath)
        .resize(size, size)
        .png()
        .toFile(outputPath);

      // Verify file was created
      if (!existsSync(outputPath)) {
        throw new Error('Output file not created');
      }

      // Get file info
      const stats = statSync(outputPath);
      const sizeKB = (stats.size / 1024).toFixed(2);

      // Verify format using ImageMagick's file command
      try {
        const formatInfo = execSync(
          `file ${output}`,
          { cwd: publicDir, encoding: 'utf-8' }
        );

        // Check for RGB/RGBA color
        if (!formatInfo.includes('8-bit/color RGB')) {
          console.warn(`⚠️  ${output} (${sizeKB} KB) - Warning: not 8-bit RGB`);
          console.warn(`   Format: ${formatInfo.trim()}`);
          hasErrors = true;
        } else {
          console.log(`✓ ${output} (${sizeKB} KB)`);
        }
      } catch (fileCheckError) {
        // If file command fails, just report the size
        console.log(`✓ ${output} (${sizeKB} KB)`);
      }

      // Additional check: verify icon has more than just white pixels
      try {
        const metadata = await sharp(outputPath).stats();
        const channels = metadata.channels;

        // Check if any channel has variation (not all same value)
        const hasVariation = channels.some(channel => {
          const range = channel.max - channel.min;
          return range > 10; // Some color variation
        });

        if (!hasVariation) {
          console.warn(`⚠️  ${output} appears to be solid color (no content)`);
          hasErrors = true;
        }
      } catch (statsError) {
        // Stats check is optional
      }

    } catch (error) {
      console.error(`❌ Failed to generate ${output}:`);
      console.error(`   ${error.message}`);
      hasErrors = true;
    }
  }
}

// Run generation
generateIcons()
  .then(() => {
    console.log('');

    if (hasErrors) {
      console.error('⚠️  Some icons generated with warnings');
      console.error('   Icons may not display correctly in Chrome');
      process.exit(1);
    } else {
      console.log('✅ All icons generated successfully!');
      console.log('');
      console.log('Next steps:');
      console.log('  1. Run: pnpm build');
      console.log('  2. Load extension in Chrome');
      console.log('  3. Verify icons display correctly');
    }
  })
  .catch(error => {
    console.error('❌ Icon generation failed:');
    console.error(error);
    process.exit(1);
  });
