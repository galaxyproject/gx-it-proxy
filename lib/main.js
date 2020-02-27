#!/usr/bin/env node
/*
Inspiration taken from
	https://github.com/jupyter/multiuser-server/blob/master/multiuser/js/main.js
*/
var fs = require("fs");
var args = require("commander");

package_info = require("../package");

args
  .version(package_info)
  .option("--ip <n>", "Public-facing IP of the proxy", "localhost")
  .option("--port <n>", "Public-facing port of the proxy", parseInt)
  .option("--sessions <file>", "Routes file to monitor")
  .option("--forwardIP <n>", "Forward all requests to IP")
  .option("--forwardPort <n>", "Forward all requests to port", parseInt)
  .option(
    "--reverseProxy",
    "Cause the proxy to rewrite location blocks with its own port"
  )
  .option("--verbose");

var main = function(argv) {
  argv = argv || process.argv;
  args.parse(process.argv);

  var DynamicProxy = require("./proxy.js").DynamicProxy;
  var mapFor = require("./mapper.js").mapFor;

  var sessions = null;
  if (args.sessions) {
    sessions = mapFor(args.sessions);
  }

  var dynamic_proxy_options = {
    sessionMap: sessions,
    verbose: args.verbose,
    port: args["port"]
  };

  if (args.reverseProxy) {
    dynamic_proxy_options.reverseProxy = true;
  }

  if (args.forwardIP) {
    dynamic_proxy_options.forwardIP = args["forwardIP"];
  }

  if (args.forwardPort) {
    dynamic_proxy_options.forwardPort = args["forwardPort"];
  }

  var dynamic_proxy = new DynamicProxy(dynamic_proxy_options);

  var listen = {};
  listen.port = args.port || 8000;
  listen.ip = args.ip;
  dynamic_proxy.listen(listen);
};

if (require.main === module) {
  main();
}
