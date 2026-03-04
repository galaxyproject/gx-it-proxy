import { describe, it, beforeAll, afterAll, afterEach, expect } from "vitest";
import http from "http";
import url from "url";
import path from "path";
import fs from "fs";
import os from "os";
import axios from "axios";
import axiosRetry from "axios-retry";
import sqlite3 from "sqlite3";

import { main } from "../lib/main.js";
import { DynamicProxy } from "../lib/proxy.js";
import { mapFor } from "../lib/mapper.js";

// Needed because we can’t figure out how to wait on the proxy server to get
// setup (server.listening stays false forever). This greatly reduces transient
// connection refused errors as a result.
axiosRetry(axios, { retries: 3 });

const TEST_PORT = 9000;

// Loosely based on https://stackoverflow.com/questions/16333790/node-js-quick-file-server-static-files-over-http
const testServer = http.createServer(function (req, res) {
  console.log(`${req.method} ${req.url}`);

  // parse URL
  const parsedUrl = url.parse(req.url);
  // extract URL path
  let pathname = `.${parsedUrl.pathname}`;
  // based on the URL path, extract the file extension. e.g. .js, .doc, ...
  const ext = path.parse(pathname).ext;
  // maps file extension to MIME type
  const map = {
    ".ico": "image/x-icon",
    ".html": "text/html",
    ".js": "text/javascript",
    ".json": "application/json",
    ".css": "text/css",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".svg": "image/svg+xml",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
  };

  fs.exists(pathname, function (exist) {
    if (!exist) {
      // if the file is not found, return 404
      res.statusCode = 404;
      res.end(`File ${pathname} not found!`);
      return;
    }

    // if is a directory, search for index file matching the extension
    if (fs.statSync(pathname).isDirectory()) {
      pathname += "/index" + ext;
    }

    // read file from file system
    fs.readFile(pathname, function (err, data) {
      if (err) {
        res.statusCode = 500;
        res.end(`Error getting the file: ${err}.`);
      } else {
        // if the file is found, set Content-type and send data
        res.setHeader("Content-type", map[ext] || "text/plain");
        res.end(data);
      }
    });
  });
});

const waitForServer = async function (server, listening) {
  for (;;) {
    if (server.listening === listening) {
      return;
    }
    // prevents app from hanging
    await null;
  }
};

const useTestServer = function () {
  beforeAll(async () => {
    testServer.listen(TEST_PORT);
    await waitForServer(testServer, true);
  });

  afterAll(async () => {
    testServer.close();
    await waitForServer(testServer, false);
  });
};

const verifyProxyOnPort = async function (port, headers, path = "/README.md") {
  const res = await axios.get(`http://localhost:${port}${path}`, { headers });
  const { data } = res;
  expect(data).toContain("# A dynamic configurable reverse proxy");
};

// --------------------------------------------------------------
// TESTS
// --------------------------------------------------------------

describe("test server", () => {
  useTestServer();

  it("should serve direct requests as files", async () => {
    await verifyProxyOnPort(TEST_PORT, {});
  });
});

describe("DynamicProxy", () => {
  useTestServer();

  describe("x-interactive-tool-* headers", () => {
    it("should respect host and port", async () => {
      const proxy = new DynamicProxy({ port: 5098, verbose: true });
      proxy.listen();

      const headers = {
        "x-interactive-tool-host": "localhost",
        "x-interactive-tool-port": TEST_PORT,
      };
      await verifyProxyOnPort(5098, headers);

      proxy.close();
    });
  });

  describe("x-interactive-tool-target headers", () => {
    it("should respect host and port in one header", async () => {
      const proxy = new DynamicProxy({ port: 5097, verbose: true });
      proxy.listen();

      const headers = {
        "x-interactive-tool-host": "localhost:" + TEST_PORT,
      };
      await verifyProxyOnPort(5097, headers);

      proxy.close();
    });
  });

  describe("map based forwarding using subdomain", () => {
    it("should respect session map", async () => {
      const sessionMap = {
        coolkey: {
          token: "cooltoken",
          target: {
            host: "localhost",
            port: TEST_PORT,
          },
        },
      };
      const proxy = new DynamicProxy({
        port: 5099,
        verbose: true,
        sessionMap,
      });
      proxy.listen();

      const headers = {
        host: "coolkey-cooltoken.usegalaxy.org",
      };
      await verifyProxyOnPort(5099, headers);

      proxy.close();
    });
  });

  describe("map based path forwarding to full path", () => {
    it("should respect session map with requires_path_in_url=true and leave path unmodified", async () => {
      const sessionMap = {
        coolkey: {
          token: "cooltoken",
          target: {
            host: "localhost",
            port: TEST_PORT,
          },
          requires_path_in_url: true,
        },
      };
      const proxy = new DynamicProxy({
        port: 5100,
        verbose: true,
        sessionMap,
        proxyPathPrefix: "/test_data/interactivetool/ep",
      });
      proxy.listen();

      const headers = {
        host: "usegalaxy.org",
      };
      const path =
        "/test_data/interactivetool/ep/coolkey/cooltoken/extradir/README.md";
      await verifyProxyOnPort(5100, headers, path);

      proxy.close();
    });
  });

  describe("map based path forwarding to top-level path (default)", () => {
    it("should respect session map without requires_path_in_url and strip entry point path from url", async () => {
      const sessionMap = {
        coolkey: {
          token: "cooltoken",
          target: {
            host: "localhost",
            port: TEST_PORT,
          },
        },
      };
      const proxy = new DynamicProxy({
        port: 5101,
        verbose: true,
        sessionMap,
        proxyPathPrefix: "/interactivetool/ep",
      });
      proxy.listen();

      const headers = {
        host: "usegalaxy.org",
      };
      // "/interactivetool/ep/coolkey/cooltoken" will be stripped from the path and
      // "/test_data/extradir/README.md" will be read and validated
      const path =
        "/interactivetool/ep/coolkey/cooltoken/test_data/extradir/README.md";
      await verifyProxyOnPort(5101, headers, path);

      proxy.close();
    });
  });

  describe("map based path forwarding to top-level path (requires_path_in_url=false)", () => {
    it("should respect session map with requires_path_in_url=false and strip entry point path from url", async () => {
      const sessionMap = {
        coolkey: {
          token: "cooltoken",
          target: {
            host: "localhost",
            port: TEST_PORT,
          },
          requires_path_in_url: false,
        },
      };
      const proxy = new DynamicProxy({
        port: 5102,
        verbose: true,
        sessionMap,
        proxyPathPrefix: "/interactivetool/ep",
      });
      proxy.listen();

      const headers = {
        host: "usegalaxy.org",
      };
      // "/interactivetool/ep/coolkey/cooltoken" will be stripped from the path and
      // "/test_data/extradir/README.md" will be read and validated
      const path =
        "/interactivetool/ep/coolkey/cooltoken/test_data/extradir/README.md";
      await verifyProxyOnPort(5102, headers, path);

      proxy.close();
    });
  });

  describe("map based path forwarding to top-level path with entry point path in header", () => {
    it(
      'should respect session map with requires_path_in_header_named="X-My-Header", strip entry point path from ' +
        'url and instead provide it in header "X-My-Header"',
      async () => {
        const sessionMap = {
          coolkey: {
            token: "cooltoken",
            target: {
              host: "localhost",
              port: TEST_PORT,
            },
            requires_path_in_header_named: "X-My-Header",
          },
        };
        const proxy = new DynamicProxy({
          port: 5103,
          verbose: true,
          sessionMap,
          proxyPathPrefix: "/interactivetool/ep",
        });
        proxy.listen();

        const headers = { host: "usegalaxy.org" };

        proxy.proxy.on("proxyReq", (proxyReq) => {
          expect(proxyReq.getHeader("X-My-Header")).toBe(
            "/interactivetool/ep/coolkey/cooltoken",
          );
        });

        const path =
          "/interactivetool/ep/coolkey/cooltoken/test_data/extradir/README.md";
        await verifyProxyOnPort(5103, headers, path);

        proxy.close();
      },
    );
  });

  describe("double proxying", () => {
    it("should proxy across two servers", async () => {
      const sessionMap = {
        coolkey: {
          token: "cooltoken",
          target: {
            host: "localhost",
            port: TEST_PORT,
          },
        },
      };
      const outerProxy = new DynamicProxy({
        port: 5200,
        verbose: true,
        sessionMap,
        forwardIP: "localhost",
        forwardPort: 5201,
      });
      const innerProxy = new DynamicProxy({ port: 5201, verbose: true });
      outerProxy.listen();
      innerProxy.listen();

      const headers = {
        host: "coolkey-cooltoken.usegalaxy.org",
      };
      await verifyProxyOnPort(5200, headers);

      innerProxy.close();
      outerProxy.close();
    });
  });
});

describe("Main function", () => {
  useTestServer();

  it("should parse simple arguments and start proxy", async () => {
    const proxy = main(["nodejs", "coolproxy", "--port", "5300", "--verbose"]);

    const headers = {
      "x-interactive-tool-host": "localhost",
      "x-interactive-tool-port": TEST_PORT,
    };
    await verifyProxyOnPort(5300, headers);

    proxy.close();
  });
});

describe("Mapper", () => {
  const dbPath = path.join(os.tmpdir(), `gxitproxy-test-${process.pid}.sqlite`);

  const createDb = () => {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath, (err) => {
        if (err) return reject(err);
        db.run(
          `CREATE TABLE IF NOT EXISTS gxitproxy
           (key text, key_type text, token text, host text, port integer, info text,
            PRIMARY KEY (key, key_type))`,
          (err) => {
            if (err) return reject(err);
            db.close((err) => {
              if (err) return reject(err);
              resolve();
            });
          },
        );
      });
    });
  };

  const insertRow = (key, host, port) => {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath, (err) => {
        if (err) return reject(err);
        db.run(
          "INSERT INTO gxitproxy (key, key_type, token, host, port) VALUES (?, ?, ?, ?, ?)",
          [key, "interactivetoolentrypoint", "tok123", host, port],
          (err) => {
            if (err) return reject(err);
            db.close((err) => {
              if (err) return reject(err);
              resolve();
            });
          },
        );
      });
    });
  };

  const deleteRow = (key) => {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath, (err) => {
        if (err) return reject(err);
        db.run(
          "DELETE FROM gxitproxy WHERE key = ?",
          [key],
          (err) => {
            if (err) return reject(err);
            db.close((err) => {
              if (err) return reject(err);
              resolve();
            });
          },
        );
      });
    });
  };

  const pollUntil = (predicate, timeoutMs) => {
    const interval = 500;
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        if (predicate()) return resolve();
        if (Date.now() - start > timeoutMs) return reject(new Error("pollUntil timed out"));
        setTimeout(check, interval);
      };
      check();
    });
  };

  afterEach(() => {
    try { fs.unlinkSync(dbPath); } catch (e) { /* ignore */ }
    try { fs.unlinkSync(dbPath + "-wal"); } catch (e) { /* ignore */ }
    try { fs.unlinkSync(dbPath + "-shm"); } catch (e) { /* ignore */ }
    try { fs.unlinkSync(dbPath + "-journal"); } catch (e) { /* ignore */ }
  });

  it("should detect inserted rows in a sqlite file", { timeout: 15000 }, async () => {
    await createDb();
    const map = mapFor(dbPath);
    expect(Object.keys(map).length).toBe(0);

    await insertRow("testkey1", "127.0.0.1", 8080);
    await pollUntil(() => "testkey1" in map, 10000);
    expect(map["testkey1"].target.host).toBe("127.0.0.1");
    expect(map["testkey1"].target.port).toBe(8080);

    map._stop();
  });

  it("should detect deleted rows in a sqlite file", { timeout: 15000 }, async () => {
    await createDb();
    await insertRow("testkey2", "127.0.0.1", 9090);
    const map = mapFor(dbPath);

    await pollUntil(() => "testkey2" in map, 10000);
    expect(map["testkey2"].target.port).toBe(9090);

    await deleteRow("testkey2");
    await pollUntil(() => !("testkey2" in map), 10000);

    map._stop();
  });
});
