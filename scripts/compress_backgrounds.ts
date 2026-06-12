/**
 * Lossy-compress background PNGs from raw-assets into public/assets.
 *
 * Full-size originals live in raw-assets/backgrounds/; this overwrites the
 * shipped copies under public/assets/backgrounds/ with palette-quantized PNGs.
 *
 * Run: bun scripts/compress_backgrounds.ts
 *      bun scripts/compress_backgrounds.ts --quality 20 --skip 1,2
 *      bun scripts/compress_backgrounds.ts --dry-run
 *
 * Per-file minimum quality: edit QUALITY_OVERRIDE below (basename without .png).
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const SRC_DIR = join(ROOT, 'raw-assets/backgrounds');
const OUT_DIR = join(ROOT, 'public/assets/backgrounds');
const PNGQUANT = join(ROOT, 'node_modules/.bin/pngquant');

const DEFAULT_QUALITY = 20;

/** Basename (no extension) → minimum pngquant quality. Unlisted files use --quality / DEFAULT_QUALITY. */
const QUALITY_OVERRIDE: Record<string, number> = {
  'main-menu': 90,
};

type CliOptions = {
  dryRun: boolean;
  quality: number;
  skip: Set<string>;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    dryRun: false,
    quality: DEFAULT_QUALITY,
    skip: new Set(),
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--quality') {
      const value = Number(argv[++i]);
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        throw new Error('--quality must be a number between 0 and 100');
      }
      options.quality = value;
      continue;
    }
    if (arg === '--skip') {
      const value = argv[++i];
      if (!value) {
        throw new Error('--skip requires a comma-separated list of basenames');
      }
      for (const name of value.split(',')) {
        const trimmed = name.trim();
        if (trimmed) {
          options.skip.add(trimmed);
        }
      }
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printHelp(): void {
  console.log(`Usage: bun scripts/compress_backgrounds.ts [options]

Options:
  --quality <n>   Default minimum pngquant quality (0-100). Default: ${DEFAULT_QUALITY}
                  Per-file overrides: QUALITY_OVERRIDE in this script (e.g. main-menu: 80).
  --skip <list>   Comma-separated basenames to skip (e.g. 1,2,shop)
  --dry-run       Print actions without writing files
  -h, --help      Show this help
`);
}

const BACKGROUND_BASENAME = /^(?:\d+|shop|main-menu)\.png$/i;

function isBackgroundPng(basename: string): boolean {
  return BACKGROUND_BASENAME.test(basename);
}

function stemFromBasename(basename: string): string {
  return basename.replace(/\.png$/i, '');
}

function resolveQuality(basename: string, defaultQuality: number): number {
  return QUALITY_OVERRIDE[stemFromBasename(basename)] ?? defaultQuality;
}

function collectPngFiles(dir: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectPngFiles(fullPath));
      continue;
    }
    if (entry.isFile() && isBackgroundPng(entry.name)) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function compressPng(
  inputPath: string,
  outputPath: string,
  quality: number,
): 'written' | 'skipped-larger' {
  const result = spawnSync(
    PNGQUANT,
    [
      `--quality=${quality}`,
      '--skip-if-larger',
      '--force',
      '--output',
      outputPath,
      inputPath,
    ],
    { encoding: 'utf8' },
  );

  if (result.error) {
    throw result.error;
  }

  // 99 = quality constraint could not be met (pngquant still may have written output)
  if (result.status !== 0 && result.status !== 99) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
    throw new Error(
      `pngquant failed for ${relative(ROOT, inputPath)} (exit ${result.status})${detail ? `: ${detail}` : ''}`,
    );
  }

  if (!statSync(outputPath, { throwIfNoEntry: false })) {
    return 'skipped-larger';
  }

  return 'written';
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));

  if (!statSync(PNGQUANT, { throwIfNoEntry: false })) {
    throw new Error('pngquant not found. Run: bun install');
  }
  if (!statSync(SRC_DIR, { throwIfNoEntry: false })) {
    throw new Error(`Source directory not found: ${relative(ROOT, SRC_DIR)}`);
  }

  const sources = collectPngFiles(SRC_DIR);
  if (sources.length === 0) {
    console.log('No PNG files found in raw-assets/backgrounds/.');
    return;
  }

  let processed = 0;
  let skipped = 0;
  let unchanged = 0;
  let inputBytes = 0;
  let outputBytes = 0;

  console.log(
    `Compressing ${sources.length} PNG(s) at quality ${options.quality} from raw-assets → public/assets`,
  );
  if (options.dryRun) {
    console.log('(dry run — no files will be written)\n');
  }

  for (const inputPath of sources) {
    const relPath = relative(SRC_DIR, inputPath);
    const basename = relPath.split('/').pop() ?? relPath;

    if (options.skip.has(basename)) {
      console.log(`skip  ${relPath}`);
      skipped++;
      continue;
    }

    const quality = resolveQuality(basename, options.quality);
    const outputPath = join(OUT_DIR, relPath);
    const before = statSync(inputPath).size;
    inputBytes += before;

    if (options.dryRun) {
      const qNote = quality !== options.quality ? `, quality ${quality}` : '';
      console.log(`would compress ${relPath} (${formatBytes(before)}${qNote})`);
      processed++;
      continue;
    }

    mkdirSync(dirname(outputPath), { recursive: true });
    const result = compressPng(inputPath, outputPath, quality);
    if (result === 'skipped-larger') {
      console.log(`keep  ${relPath}  (${formatBytes(before)} — compressed output would be larger)`);
      unchanged++;
      continue;
    }

    const after = statSync(outputPath).size;
    outputBytes += after;
    processed++;

    const ratio = before > 0 ? ((after / before) * 100).toFixed(1) : '0.0';
    const qNote = quality !== options.quality ? ` q${quality}` : '';
    console.log(
      `ok    ${relPath}  ${formatBytes(before)} → ${formatBytes(after)} (${ratio}%)${qNote}`,
    );
  }

  console.log('');
  if (options.dryRun) {
    console.log(`Dry run complete: ${processed} file(s) would be compressed, ${skipped} skipped.`);
    return;
  }

  const totalRatio = inputBytes > 0 ? ((outputBytes / inputBytes) * 100).toFixed(1) : '0.0';
  console.log(
    `Done: ${processed} compressed, ${skipped} skipped, ${unchanged} unchanged. ${formatBytes(inputBytes)} → ${formatBytes(outputBytes)} (${totalRatio}%).`,
  );
}

main();
