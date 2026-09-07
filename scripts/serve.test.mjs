import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStaticServer } from "./serve.mjs";

test("serves built assets only, with safe methods and path boundaries", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "github-view-server-"));
  const root = join(temporary, "dist");
  await mkdir(root);
  await writeFile(join(root, "index.html"), "<h1>GitHub View</h1>");
  await writeFile(join(temporary, "secret.txt"), "private");
  await symlink(join(temporary, "secret.txt"), join(root, "escape.txt"));
  const server = createStaticServer(root);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(url);
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-type"), /text\/html/);
    assert.equal(await page.text(), "<h1>GitHub View</h1>");
    assert.equal((await fetch(`${url}/escape.txt`)).status, 403);
    assert.equal((await fetch(`${url}/%2e%2e%2fsecret.txt`)).status, 403);
    assert.equal((await fetch(`${url}/missing`)).status, 404);
    assert.equal((await fetch(`${url}/%ZZ`)).status, 400);
    assert.equal((await fetch(url, { method: "POST" })).status, 405);
    const head = await fetch(url, { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(temporary, { recursive: true, force: true });
  }
});
