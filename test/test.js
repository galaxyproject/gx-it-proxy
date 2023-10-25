const { main } = require("../lib/main");
const { DynamicProxy } = require("../lib/proxy");
const http = require("http");
const url = require("url");
const path = require("path");
const fs = require("fs");
require("chai").should();
const axios = require("axios");
const axiosRetry = require("axios-retry");

// Needed because I can't figure out how to wait on the proxy server to get
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

    // if is a directory search for index file matching the extention
    if (fs.statSync(pathname).isDirectory()) pathname += "/index" + ext;

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
    if (server.listening == listening) {
      return;
    }
    await null; // prevents app from hanging
  }
};

const useTestServer = function () {
  before(async function () {
    testServer.listen(TEST_PORT);
    await waitForServer(testServer, true);
  });
  after(async function () {
    testServer.close();
    await waitForServer(testServer, false);
  });
};

const verifyProxyOnPort = async function (port, headers, path = "/README.md") {
  let res = await axios.get(`http://localhost:${port}${path}`, {
    headers: headers,
  });
  let { data } = res;
  data.should.include("# A dynamic configurable reverse proxy");
};

describe("test server", function () {
  useTestServer();
  it("should serve direct requests as files", async function () {
    await verifyProxyOnPort(TEST_PORT, {});
  });
});

describe("DynamicProxy", function () {
  useTestServer();
  describe("x-interactive-tool-* headers", function () {
    it("should respect host and port", async function () {
      const proxy = new DynamicProxy({ port: 5098, verbose: true });
      proxy.listen();
      // This never becomes True for the proxy server... why?
      // await waitForServer(proxy.proxy, true);
      const headers = {
        "x-interactive-tool-host": "localhost",
        "x-interactive-tool-port": TEST_PORT,
      };
      await verifyProxyOnPort(5098, headers);
      proxy.close();
    });
  });

  describe("x-interactive-tool-target headers", function () {
    it("should respect host and port in one header", async function () {
      const proxy = new DynamicProxy({ port: 5097, verbose: true });
      proxy.listen();
      const headers = {
        "x-interactive-tool-host": "localhost:" + TEST_PORT,
      };
      await verifyProxyOnPort(5097, headers);
      proxy.close();
    });
  });

  describe("map based forwarding using subdomain", function () {
    it("should respect session map", async function () {
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
        sessionMap: sessionMap,
      });
      proxy.listen();
      const headers = {
        host: "coolkey-cooltoken.usegalaxy.org",
      };
      await verifyProxyOnPort(5099, headers);
      proxy.close();
    });
  });

  describe("map based path forwarding to full path", function () {
    it("should respect session map with requires_path_in_url=true and leave path unmodified", async function () {
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
        sessionMap: sessionMap,
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

  describe("map based path forwarding to top-level path (default)", function () {
    it("should respect session map without requires_path_in_url and strip entry point path from url", async function () {
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
        sessionMap: sessionMap,
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

  describe("map based path forwarding to top-level path (requires_path_in_url=false)", function () {
    it("should respect session map with requires_path_in_url=false and strip entry point path from url", async function () {
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
        sessionMap: sessionMap,
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

  describe("map based path forwarding to top-level path with entry point path in header", function () {
    it(
      'should respect session map with requires_path_in_header_named="X-My-Header", strip entry point path from ' +
        'url and instead provide it in header "X-My-Header"',
      async function () {
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
          sessionMap: sessionMap,
          proxyPathPrefix: "/interactivetool/ep",
        });
        proxy.listen();
        const headers = {
          host: "usegalaxy.org",
        };

        proxy.proxy.on("proxyReq", function (proxyReq) {
          proxyReq
            .getHeader("X-My-Header")
            .should.equal("/interactivetool/ep/coolkey/cooltoken");
        });

        const path =
          "/interactivetool/ep/coolkey/cooltoken/test_data/extradir/README.md";
        await verifyProxyOnPort(5103, headers, path);
        proxy.close();
      },
    );
  });

  describe("double proxying", function () {
    it("should proxy across two servers", async function () {
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
        sessionMap: sessionMap,
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

describe("Main function", function () {
  useTestServer();
  it("should parse simple arguments and start proxy", async function () {
    const proxy = main(["nodejs", "coolproxy", "--port", "5300", "--verbose"]);
    const headers = {
      "x-interactive-tool-host": "localhost",
      "x-interactive-tool-port": TEST_PORT,
    };
    await verifyProxyOnPort(5300, headers);
    proxy.close();
  });
});
