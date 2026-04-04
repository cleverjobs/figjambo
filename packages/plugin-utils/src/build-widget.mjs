import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

const watch = process.argv.includes('--watch');
const cwd = process.cwd();

async function build() {
  // Widget main code (JSX → figma.widget.h)
  const widgetCtx = await esbuild.context({
    entryPoints: [path.join(cwd, 'widget-src/widget.tsx')],
    bundle: true,
    outfile: path.join(cwd, 'dist/code.js'),
    target: 'es6',
    format: 'iife',
    jsx: 'transform',
    jsxFactory: 'figma.widget.h',
    jsxFragment: 'figma.widget.Fragment',
    logLevel: 'info',
  });

  await widgetCtx.rebuild();

  // Optional: bundle UI iframe if ui-src/ exists
  const uiSrcDir = path.join(cwd, 'ui-src');
  if (fs.existsSync(uiSrcDir)) {
    const uiCtx = await esbuild.context({
      entryPoints: [path.join(uiSrcDir, 'app.ts')],
      bundle: true,
      write: false,
      target: 'es2020',
      format: 'iife',
      logLevel: 'info',
    });

    const uiResult = await uiCtx.rebuild();
    const uiJs = uiResult.outputFiles[0].text;
    const htmlTemplate = fs.readFileSync(path.join(uiSrcDir, 'index.html'), 'utf-8');
    const inlinedHtml = htmlTemplate.replace(
      '<script src="app.ts"></script>',
      `<script>${uiJs}</script>`
    );
    fs.writeFileSync(path.join(cwd, 'dist/ui.html'), inlinedHtml);
    console.log('  dist/ui.html — inlined');

    if (!watch) await uiCtx.dispose();
  }

  if (watch) {
    console.log('\nWatching for changes...');
    await widgetCtx.watch();
  } else {
    await widgetCtx.dispose();
  }
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
