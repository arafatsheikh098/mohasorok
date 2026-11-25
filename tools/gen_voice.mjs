// Generate the helper & passenger voice clips (whole sentences) into public/voice/ + manifest.json.
//
//   cd prototype-web && EDGE_TTS=/path/to/venv/bin/edge-tts node tools/gen_voice.mjs
//       Microsoft neural voices via edge-tts (pip install edge-tts). Needs internet; only the Bangla line
//       texts from src/voiceLines.js are sent to the service.
//   node tools/gen_voice.mjs --engine=say
//       Offline fallback: the macOS "Piya" (bn_IN) voice + ffmpeg. Sounds robotic; only for working offline.
//
// The clip list comes from allClips() in src/voiceLines.js: one sentence per (line, variant, voice, place).
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { allClips } from '../src/voiceLines.js';

const run = promisify(execFile);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, 'public', 'voice');
const engine = (process.argv.find((a) => a.startsWith('--engine=')) || '--engine=edge').split('=')[1];
const EDGE = process.env.EDGE_TTS || 'edge-tts';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mohasorok-voice-'));
fs.mkdirSync(outDir, { recursive: true });
const hash = (t) => createHash('sha1').update(t).digest('hex').slice(0, 12);

async function render(c, file) {
  if (engine === 'say') {
    const aiff = path.join(tmp, `${hash(c.key)}.aiff`);
    await run('say', ['-v', 'Piya', '-r', '175', '-o', aiff, c.text]);
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', aiff, '-ac', '1', '-ar', '24000', '-b:a', '48k', file]);
  } else {
    // edge-tts writes 24 kHz 48 kbit/s mono mp3; retry a couple of times on network hiccups
    for (let i = 0; ; i++) {
      try { await run(EDGE, ['--voice', c.voice.name, `--rate=${c.voice.rate}`, ...(c.voice.pitch ? [`--pitch=${c.voice.pitch}`] : []), '--text', c.text, '--write-media', file]); break; }
      catch (e) { if (i >= 4) throw e; await new Promise((r) => setTimeout(r, 2000 * (i + 1))); }
    }
  }
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return +(+stdout).toFixed(3);
}

const clips = allClips();
const manifest = { engine, clips: {} };
const keep = new Set(['manifest.json']);
let next = 0, done = 0;
const failed = [];
async function worker() {
  while (next < clips.length) {
    const c = clips[next++];
    // the file name follows the text and voice, so an unchanged line is not re-downloaded
    const f = `${hash(`${engine}|${c.voice.name}|${c.voice.rate}|${c.voice.pitch ? `${c.voice.pitch}|` : ''}${c.text}`)}.mp3`;
    const file = path.join(outDir, f);
    let dur;
    try {
      dur = fs.existsSync(file) && fs.statSync(file).size > 1000 ? +(+(await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file])).stdout).toFixed(3) : await render(c, file);
    } catch (e) {
      failed.push(c.key); fs.rmSync(file, { force: true });
      console.warn(`failed: ${c.key} (${String(e.stderr || e.message).trim().split('\n').pop()})`);
      continue;
    }
    manifest.clips[c.key] = { f, dur };
    keep.add(f);
    if (++done % 20 === 0) console.log(`${done}/${clips.length}`);
  }
}
await Promise.all(Array.from({ length: engine === 'say' ? 4 : 3 }, worker));
for (const f of fs.readdirSync(outDir)) if (!keep.has(f)) fs.unlinkSync(path.join(outDir, f));   // drop old clips
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1));
fs.rmSync(tmp, { recursive: true, force: true });
const bytes = fs.readdirSync(outDir).reduce((a, f) => a + fs.statSync(path.join(outDir, f)).size, 0);
if (failed.length) { console.warn(`${failed.length} clips failed; run again to retry them`); process.exitCode = 1; }
console.log(`${clips.length - failed.length}/${clips.length} clips (${engine}), ${(bytes / 1024 / 1024).toFixed(2)} MB in public/voice`);
