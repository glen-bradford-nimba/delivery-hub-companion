#!/usr/bin/env node
/**
 * Generate branded PNG icons for Delivery Hub Companion.
 * Uses pure Node.js with zlib — no external dependencies.
 *
 * Run: node scripts/generate-icons.js
 * Output: icons/icon-16.png, icon-32.png, icon-48.png, icon-128.png
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Brand colors
const COLORS = {
    bgDark: [11, 20, 55],       // #0b1437 - Deep navy
    bgMid: [30, 58, 95],        // #1e3a5f - Mid navy
    accent: [13, 148, 136],     // #0d9488 - Teal
    accentLight: [20, 184, 166],// #14b8a6 - Light teal
    white: [255, 255, 255],
    check: [59, 130, 246],      // #3b82f6 - Blue
};

/**
 * Create a minimal valid PNG file from raw RGBA pixel data.
 */
function createPNG(width, height, pixels) {
    // PNG signature
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    // IHDR chunk
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // color type: RGBA
    ihdr[10] = 0; // compression
    ihdr[11] = 0; // filter
    ihdr[12] = 0; // interlace
    const ihdrChunk = makeChunk('IHDR', ihdr);

    // IDAT chunk - pixel data with filter byte per row
    const rawData = Buffer.alloc(height * (1 + width * 4));
    for (let y = 0; y < height; y++) {
        rawData[y * (1 + width * 4)] = 0; // filter: None
        for (let x = 0; x < width; x++) {
            const srcIdx = (y * width + x) * 4;
            const dstIdx = y * (1 + width * 4) + 1 + x * 4;
            rawData[dstIdx] = pixels[srcIdx];
            rawData[dstIdx + 1] = pixels[srcIdx + 1];
            rawData[dstIdx + 2] = pixels[srcIdx + 2];
            rawData[dstIdx + 3] = pixels[srcIdx + 3];
        }
    }
    const compressed = zlib.deflateSync(rawData);
    const idatChunk = makeChunk('IDAT', compressed);

    // IEND chunk
    const iendChunk = makeChunk('IEND', Buffer.alloc(0));

    return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const typeBuffer = Buffer.from(type, 'ascii');
    const crcData = Buffer.concat([typeBuffer, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcData), 0);
    return Buffer.concat([length, typeBuffer, data, crc]);
}

// CRC32 lookup table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
        if (c & 1) { c = 0xEDB88320 ^ (c >>> 1); }
        else { c = c >>> 1; }
    }
    crcTable[n] = c;
}

function crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
        crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Draw a filled circle with anti-aliasing into pixel buffer.
 */
function drawCircle(pixels, width, cx, cy, r, color, alpha = 255) {
    const r2 = r * r;
    const minX = Math.max(0, Math.floor(cx - r - 1));
    const maxX = Math.min(width - 1, Math.ceil(cx + r + 1));
    const minY = Math.max(0, Math.floor(cy - r - 1));
    const maxY = Math.min(width - 1, Math.ceil(cy + r + 1));

    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            const dx = x - cx;
            const dy = y - cy;
            const dist2 = dx * dx + dy * dy;

            if (dist2 <= (r - 1) * (r - 1)) {
                // Fully inside
                blendPixel(pixels, width, x, y, color, alpha);
            } else if (dist2 <= r2) {
                // Edge - anti-alias
                const dist = Math.sqrt(dist2);
                const edgeAlpha = Math.max(0, Math.min(1, r - dist)) * alpha;
                blendPixel(pixels, width, x, y, color, Math.round(edgeAlpha));
            }
        }
    }
}

/**
 * Draw the "DH" text into pixel buffer using a simple bitmap font approach.
 */
function drawDH(pixels, size) {
    // For each size, we define a scaled bitmap of "DH"
    // Using a procedural approach: draw D and H as geometric shapes

    const s = size / 128; // scale factor relative to 128px
    const cx = size / 2;
    const cy = size / 2;

    // Letter metrics
    const letterH = Math.round(36 * s);  // letter height
    const strokeW = Math.max(1, Math.round(6 * s)); // stroke width
    const gap = Math.round(3 * s);       // gap between letters
    const totalW = Math.round(50 * s);   // total text width

    const startX = cx - totalW / 2;
    const startY = cy - letterH / 2 + Math.round(2 * s);

    // Draw "D"
    const dLeft = startX;
    const dRight = dLeft + Math.round(20 * s);

    // D: vertical bar
    fillRect(pixels, size, Math.round(dLeft), Math.round(startY), strokeW, letterH, COLORS.white);
    // D: top horizontal
    fillRect(pixels, size, Math.round(dLeft), Math.round(startY), Math.round(14 * s), strokeW, COLORS.white);
    // D: bottom horizontal
    fillRect(pixels, size, Math.round(dLeft), Math.round(startY + letterH - strokeW), Math.round(14 * s), strokeW, COLORS.white);
    // D: right curve (approximated with a rounded edge)
    const dCurveX = dLeft + Math.round(14 * s);
    const dCurveR = letterH / 2;
    // Draw right half-circle for D
    for (let y = Math.round(startY); y < Math.round(startY + letterH); y++) {
        for (let x = Math.round(dCurveX - strokeW); x < Math.round(dRight + strokeW); x++) {
            if (x < 0 || x >= size || y < 0 || y >= size) continue;
            const dy = y - (startY + letterH / 2);
            const maxDx = Math.sqrt(Math.max(0, dCurveR * dCurveR - dy * dy));
            const dx = x - dCurveX;
            if (dx >= 0 && dx <= maxDx && dx >= maxDx - strokeW) {
                blendPixel(pixels, size, x, y, COLORS.white, 255);
            }
        }
    }

    // Draw "H"
    const hLeft = dRight + gap;
    const hRight = hLeft + Math.round(20 * s);

    // H: left vertical
    fillRect(pixels, size, Math.round(hLeft), Math.round(startY), strokeW, letterH, COLORS.white);
    // H: right vertical
    fillRect(pixels, size, Math.round(hRight - strokeW), Math.round(startY), strokeW, letterH, COLORS.white);
    // H: middle horizontal
    fillRect(pixels, size, Math.round(hLeft), Math.round(startY + letterH / 2 - strokeW / 2), Math.round(hRight - hLeft), strokeW, COLORS.white);

    return pixels;
}

function fillRect(pixels, size, x, y, w, h, color) {
    for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
            const px = x + dx;
            const py = y + dy;
            if (px >= 0 && px < size && py >= 0 && py < size) {
                blendPixel(pixels, size, px, py, color, 255);
            }
        }
    }
}

function blendPixel(pixels, width, x, y, color, alpha) {
    const idx = (y * width + x) * 4;
    const srcA = alpha / 255;
    const dstA = pixels[idx + 3] / 255;
    const outA = srcA + dstA * (1 - srcA);

    if (outA > 0) {
        pixels[idx] = Math.round((color[0] * srcA + pixels[idx] * dstA * (1 - srcA)) / outA);
        pixels[idx + 1] = Math.round((color[1] * srcA + pixels[idx + 1] * dstA * (1 - srcA)) / outA);
        pixels[idx + 2] = Math.round((color[2] * srcA + pixels[idx + 2] * dstA * (1 - srcA)) / outA);
        pixels[idx + 3] = Math.round(outA * 255);
    }
}

/**
 * Generate an icon at the specified size.
 */
function generateIcon(size) {
    const pixels = new Uint8Array(size * size * 4);

    // Background: gradient circle
    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2;

    // Draw background circle with gradient
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const dx = x - cx;
            const dy = y - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist <= radius) {
                // Gradient from top-left to bottom-right
                const t = Math.min(1, (x + y) / (size * 2));
                const r = Math.round(COLORS.bgDark[0] * (1 - t) + COLORS.bgMid[0] * t);
                const g = Math.round(COLORS.bgDark[1] * (1 - t) + COLORS.bgMid[1] * t);
                const b = Math.round(COLORS.bgDark[2] * (1 - t) + COLORS.bgMid[2] * t);

                // Anti-alias edge
                const edgeDist = radius - dist;
                const alpha = edgeDist < 1 ? Math.round(edgeDist * 255) : 255;

                const idx = (y * size + x) * 4;
                pixels[idx] = r;
                pixels[idx + 1] = g;
                pixels[idx + 2] = b;
                pixels[idx + 3] = alpha;
            }
        }
    }

    // Draw "DH" text
    drawDH(pixels, size);

    // Draw teal accent badge (bottom-right)
    const badgeR = Math.max(2, Math.round(size * 0.18));
    const badgeCx = size - badgeR - Math.round(size * 0.04);
    const badgeCy = size - badgeR - Math.round(size * 0.04);
    drawCircle(pixels, size, badgeCx, badgeCy, badgeR, COLORS.accent, 255);

    // Draw checkmark in badge
    if (size >= 32) {
        const checkScale = badgeR / 11;
        // Simple checkmark: short line going down-right, then long line going up-right
        const checkPoints = [
            [-4, 0], [-1, 3], [5, -4] // relative to badge center
        ];

        for (let i = 0; i < checkPoints.length - 1; i++) {
            const x0 = badgeCx + checkPoints[i][0] * checkScale;
            const y0 = badgeCy + checkPoints[i][1] * checkScale;
            const x1 = badgeCx + checkPoints[i + 1][0] * checkScale;
            const y1 = badgeCy + checkPoints[i + 1][1] * checkScale;
            drawLine(pixels, size, x0, y0, x1, y1, Math.max(1, Math.round(1.5 * checkScale)), COLORS.white);
        }
    }

    return createPNG(size, size, pixels);
}

function drawLine(pixels, size, x0, y0, x1, y1, thickness, color) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.ceil(len * 2);

    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const cx = x0 + dx * t;
        const cy = y0 + dy * t;

        // Draw a small circle at each point for thickness
        const r = thickness / 2;
        for (let py = Math.floor(cy - r); py <= Math.ceil(cy + r); py++) {
            for (let px = Math.floor(cx - r); px <= Math.ceil(cx + r); px++) {
                if (px >= 0 && px < size && py >= 0 && py < size) {
                    const ddx = px - cx;
                    const ddy = py - cy;
                    const dist = Math.sqrt(ddx * ddx + ddy * ddy);
                    if (dist <= r) {
                        const alpha = dist < r - 0.5 ? 255 : Math.round((r - dist) * 2 * 255);
                        blendPixel(pixels, size, px, py, color, Math.min(255, alpha));
                    }
                }
            }
        }
    }
}

// Generate all sizes
const sizes = [16, 32, 48, 128];
const iconsDir = path.join(__dirname, '..', 'icons');

for (const size of sizes) {
    const png = generateIcon(size);
    const filePath = path.join(iconsDir, `icon-${size}.png`);
    fs.writeFileSync(filePath, png);
    console.log(`Generated ${filePath} (${png.length} bytes)`);
}

console.log('Done! All icons generated.');
