// Run one plain-English objective through Kane CLI, attached to the Chrome that carries the Vegga test wallet.
import { spawn } from 'node:child_process';

export function runKane({ objective, url, cdpEndpoint, timeout = 240, maxSteps = 40, dry = false, onProgress = () => {} }) {
  const args = ['run', objective, '--agent', '--cdp-endpoint', cdpEndpoint, '--url', url, '--timeout', String(timeout), '--max-steps', String(maxSteps)];
  if (dry) { console.log(`kane-cli ${args.map((a) => JSON.stringify(a)).join(' ')}\n`); return Promise.resolve({ status: 'skipped' }); }
  const started = Date.now();
  return new Promise((resolve) => {
    const out = { status: 'error', steps: 0, failedStep: null };
    let child;
    try { child = spawn('kane-cli', args, { stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { out.summary = String(e); return resolve(out); }
    let buf = '';
    child.on('error', (e) => { out.summary = e.code === 'ENOENT' ? 'kane-cli not found. Run: npm install -g @testmuai/kane-cli' : String(e); resolve(out); });
    child.stdout.on('data', (d) => {
      buf += d; let nl;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!line.startsWith('{')) continue;
        let ev; try { ev = JSON.parse(line); } catch { continue; }
        if (ev.type === 'run_end') Object.assign(out, { status: ev.status, summary: ev.summary, oneLiner: ev.one_liner, reason: ev.reason, duration: ev.duration, credits: ev.credits, finalState: ev.final_state || {}, testUrl: ev.test_url });
        else if (ev.step !== undefined) {
          out.steps = Math.max(out.steps, ev.step); onProgress(ev);
          if (ev.status === 'failed') out.failedStep = { step: ev.step, remark: ev.remark };
        }
      }
    });
    child.on('close', (code) => {
      out.exitCode = code; out.wallSeconds = Math.round((Date.now() - started) / 1000);
      if (out.status === 'error' && code === 0) out.status = 'passed';
      if (code === 3) out.status = 'timeout';
      resolve(out);
    });
  });
}
