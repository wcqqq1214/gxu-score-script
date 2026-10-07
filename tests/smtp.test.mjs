import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import tls from "node:tls";
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let directory;
let credentials;
before(() => {
  directory = mkdtempSync(join(tmpdir(), "gxu-smtp-"));
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-days",
      "1",
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=DNS:localhost",
      "-keyout",
      join(directory, "key.pem"),
      "-out",
      join(directory, "cert.pem"),
    ],
    { stdio: "ignore" },
  );
  credentials = { key: readFileSync(join(directory, "key.pem")), cert: readFileSync(join(directory, "cert.pem")) };
});
after(() => rmSync(directory, { recursive: true, force: true }));

async function runSmtp(mode, trusted = true, legacyPolicy = false) {
  const transcript = [];
  const sockets = new Set();
  const implicit = mode === "implicit";
  function handle(socket, encrypted = false, greeting = true) {
    sockets.add(socket);
    socket.on("error", () => {});
    socket.on("close", () => sockets.delete(socket));
    socket.setEncoding("utf8");
    if (greeting) socket.write("220 localhost fixture\r\n");
    let buffer = "";
    let inData = false;
    function data(chunk) {
      buffer += chunk;
      while (buffer.includes("\r\n")) {
        const index = buffer.indexOf("\r\n");
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        transcript.push({ line, encrypted });
        if (inData) {
          if (line === ".") {
            inData = false;
            socket.write("250 queued\r\n");
          }
        } else if (line.startsWith("EHLO")) {
          if (mode === "fail-ehlo") socket.write("500 no EHLO\r\n");
          else
            socket.write(
              `250-localhost\r\n${!encrypted && mode !== "no-starttls" ? "250-STARTTLS\r\n" : ""}250 AUTH PLAIN\r\n`,
            );
        } else if (line.startsWith("HELO")) {
          socket.write("250 localhost\r\n");
        } else if (line === "STARTTLS") {
          if (["no-starttls", "reject-starttls"].includes(mode)) {
            socket.write("454 TLS unavailable\r\n");
          } else {
            socket.removeListener("data", data);
            socket.write("220 upgrade\r\n");
            const secure = new tls.TLSSocket(socket, {
              isServer: true,
              secureContext: tls.createSecureContext(credentials),
            });
            handle(secure, true, false);
          }
        } else if (line.startsWith("AUTH")) {
          socket.write("235 authenticated\r\n");
        } else if (line.startsWith("MAIL FROM") || line.startsWith("RCPT TO")) {
          socket.write("250 ok\r\n");
        } else if (line === "DATA") {
          inData = true;
          socket.write("354 send message\r\n");
        } else if (line === "QUIT") socket.end("221 bye\r\n");
      }
    }
    socket.on("data", data);
  }
  const server = implicit ? tls.createServer(credentials, (socket) => handle(socket, true)) : net.createServer(handle);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    const source = `
      import assert from 'node:assert/strict';
      import nodemailer from 'nodemailer';
      import { notify } from './src/notify.ts';
      ${
        legacyPolicy
          ? `const create = nodemailer.createTransport.bind(nodemailer);
      nodemailer.createTransport = options => create({ ...options, requireTLS: false });`
          : ""
      }
      ${
        implicit
          ? `const create = nodemailer.createTransport.bind(nodemailer);
      nodemailer.createTransport = options => {
        assert.equal(options.secure, true);
        return create({ ...options, port: ${port} });
      };`
          : ""
      }
      try {
        await notify({ added: [{kcmc:'fixture-course', bfzcj:'90'}], changed: [] },
          {host:'localhost',port:${implicit ? 465 : port},user:'fixture-user',pass:'fixture-password',to:'recipient@example.invalid'});
      } catch { process.exitCode = 1; }
    `;
    const env = { ...process.env };
    delete env.NODE_TLS_REJECT_UNAUTHORIZED;
    delete env.NODE_EXTRA_CA_CERTS;
    if (trusted) env.NODE_EXTRA_CA_CERTS = join(directory, "cert.pem");
    const child = spawn(process.execPath, ["--import", "tsx/esm", "--input-type=module", "-e", source], { env });
    let output = "";
    child.stdout.on("data", (data) => (output += data));
    child.stderr.on("data", (data) => (output += data));
    const timer = setTimeout(() => child.kill("SIGKILL"), 10000);
    const [code, signal] = await new Promise((resolve) => child.on("exit", (...args) => resolve(args)));
    clearTimeout(timer);
    assert.equal(signal, null, output);
    return { code, transcript, output };
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  }
}

for (const mode of ["no-starttls", "reject-starttls", "fail-ehlo"]) {
  test(`SMTP ${mode}: refuses to send credentials or message before TLS`, async () => {
    const result = await runSmtp(mode);
    assert.equal(result.code, 1, result.output);
    assert.ok(
      !result.transcript.some(({ line }) => /^(AUTH|MAIL FROM|DATA)/.test(line)),
      JSON.stringify(result.transcript),
    );
  });
}

test("SMTP rejects an untrusted TLS certificate before authentication", async () => {
  const result = await runSmtp("starttls", false);
  assert.equal(result.code, 1, result.output);
  assert.ok(!result.transcript.some(({ line }) => /^(AUTH|MAIL FROM|DATA)/.test(line)));
});

for (const mode of ["starttls", "implicit"]) {
  test(`SMTP ${mode}: trusted encrypted delivery still succeeds`, async () => {
    const result = await runSmtp(mode);
    assert.equal(result.code, 0, result.output);
    const sensitive = result.transcript.filter(({ line }) => /^(AUTH|MAIL FROM|DATA)/.test(line));
    assert.equal(sensitive.length, 3, result.output);
    assert.ok(sensitive.every(({ encrypted }) => encrypted));
  });
}

test("stripping fixture reproduces plaintext delivery under the original optional TLS policy", async () => {
  const result = await runSmtp("no-starttls", true, true);
  assert.equal(result.code, 0, result.output);
  const sensitive = result.transcript.filter(({ line }) => /^(AUTH|MAIL FROM|DATA)/.test(line));
  assert.equal(sensitive.length, 3);
  assert.ok(sensitive.every(({ encrypted }) => !encrypted));
});
