import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

const watch = process.argv.includes('--watch');
const cwd = process.cwd();

async function build() {
  // Step 1: Bundle main thread code
  const codeCtx = await esbuild.context({
    entryPoints: [path.join(cwd, 'src/code.ts')],
    bundle: true,
    outfile: path.join(cwd, 'dist/code.js'),
    target: 'es2017',
    format: 'iife',
    logLevel: 'info',
  });

  // Step 2: Bundle UI script and inline into HTML
  const uiCtx = await esbuild.context({
    entryPoints: [path.join(cwd, 'src/ui.ts')],
    bundle: true,
    write: false,
    target: 'es2017',
    format: 'iife',
    logLevel: 'info',
  });

  async function buildAll() {
    await codeCtx.rebuild();

    const uiResult = await uiCtx.rebuild();
    const uiJs = uiResult.outputFiles[0].text;

    const htmlTemplate = fs.readFileSync(path.join(cwd, 'src/ui.html'), 'utf-8');
    const inlinedHtml = htmlTemplate.replace(
      '<script src="ui.ts"></script>',
      `<script>${uiJs}</script>`
    );

    fs.mkdirSync(path.join(cwd, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'dist/ui.html'), inlinedHtml);
    console.log('  dist/ui.html — inlined');
  }

  await buildAll();

  if (watch) {
    console.log('\nWatching for changes...');
    // Watch source files and rebuild
    const srcDir = path.join(cwd, 'src');
    fs.watch(srcDir, { recursive: true }, async (_event, filename) => {
      if (!filename) return;
      console.log(`\nChanged: ${filename}`);
      try {
        await buildAll();
      } catch (e) {
        console.error('Build error:', e.message);
      }
    });
  } else {
    await codeCtx.dispose();
    await uiCtx.dispose();
  }
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
