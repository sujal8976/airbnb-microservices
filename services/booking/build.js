import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist', { recursive: true });
}

// Build configuration
esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  outfile: 'dist/index.cjs',
  minify: true,
  sourcemap: false,
}).then(() => {
  console.log('✅ Build completed successfully!');
  console.log('📦 Bundled server: dist/index.cjs');
}).catch((error) => {
  console.error('❌ Build failed:', error);
  process.exit(1);
});
