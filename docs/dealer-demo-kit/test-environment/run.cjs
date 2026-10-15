const fs = require('node:fs');
const path = require('node:path');
const { openSandbox, SCENARIOS } = require('./runtime.cjs');
const { render } = require('./view.cjs');
const args = process.argv.slice(2), command = args[0] || 'inspect';
const stateFlag = args.indexOf('--state');
const stateDirectory = stateFlag >= 0 ? args[stateFlag + 1] : undefined;
if (stateFlag >= 0 && !stateDirectory) throw new Error('Provide a dedicated empty or previously marked test directory.');
const sandbox = openSandbox(stateDirectory);
async function main() {
  if (command === 'run' || command === 'retry') await sandbox.run(args[1], command === 'retry');
  else if (!['inspect', 'export', 'serve'].includes(command)) throw new Error('Use run <scenario>, retry <scenario>, inspect, export or serve.');
  if (command === 'serve') {
    // Optional owner-computer recording mode. Not started in managed Sites QA.
    const http = require('node:http'), host = '127.0.0.1', port = 4287, origin = `http://${host}:${port}`;
    const server = http.createServer(async (request, response) => {
      response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
      if (request.headers.host !== `${host}:${port}`) { response.writeHead(403); return response.end('Loopback host required.'); }
      try {
        if (request.method === 'GET' && request.url === '/') { response.setHeader('Content-Type', 'text/html; charset=utf-8'); return response.end(render(sandbox.snapshot(), true)); }
        if (request.method === 'POST' && ['/run', '/retry'].includes(request.url)) {
          if (request.headers.origin !== origin || !String(request.headers['content-type'] || '').startsWith('application/x-www-form-urlencoded')) { response.writeHead(403); return response.end('Use the local demonstration form.'); }
          let body = ''; for await (const chunk of request) { body += chunk; if (body.length > 200) { response.writeHead(413); return response.end('Fixture request too large.'); } }
          const scenario = new URLSearchParams(body).get('scenario'); if (!SCENARIOS.includes(scenario)) { response.writeHead(400); return response.end('Choose a fixed fictional scenario.'); }
          await sandbox.run(scenario, request.url === '/retry'); response.writeHead(303, { Location: '/' }); return response.end();
        }
        response.writeHead(404); response.end('Not found.');
      } catch { response.writeHead(500); response.end('The test action failed. Reload the staff view and inspect the saved state.'); }
    });
    server.listen(port, host, () => console.log(`Fictional local test only: ${origin}. No outbound network calls or actual messages.`));
    process.on('SIGINT', () => server.close(() => { sandbox.close(); process.exit(0); }));
    return;
  }
  const snapshot = sandbox.snapshot();
  if (command === 'export') {
    const output = path.join(sandbox.directory, 'staff-view.html'); fs.writeFileSync(output, render(snapshot));
    fs.writeFileSync(path.join(sandbox.directory, 'staff-view.json'), JSON.stringify(snapshot, null, 2));
    console.log(JSON.stringify({ output, actualPhoneCall: 'NOT TESTED', externalNotificationDelivery: 'NOT TESTED' }));
  } else console.log(JSON.stringify(snapshot, null, 2));
  sandbox.close();
}
main().catch(error => { console.error(error.message); sandbox.close(); process.exitCode = 1; });
