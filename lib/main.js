#!/usr/bin/env node
/*
Inspiration taken from
	https://github.com/jupyter/multiuser-server/blob/master/multiuser/js/main.js
*/
const args = require("commander");
const packageInfo = require("../package");
const { DynamicProxy } = require("./proxy");
const { mapFor } = require("./mapper");

args
  .version(packageInfo.version)
  .option("--ip <n>", "Public-facing IP of the proxy", "localhost")
  .option("--port <n>", "Public-facing port of the proxy", parseInt)
  .option("--sessions <file>", "Routes file to monitor")
  .option(
    "--pollingInterval <n>",
    "Polling interval for PostgreSQL databases (in ms, defaults to 5000, " +
    "use 0 to disable polling)",
    parseInt,
    5000
  )
  .option("--proxyPathPrefix <path>", "Path-based proxy prefix")
  .option("--forwardIP <n>", "Forward all requests to IP")
  .option("--forwardPort <n>", "Forward all requests to port", parseInt)
  .option(
    "--reverseProxy",
    "Cause the proxy to rewrite location blocks with its own port",
  )
  .option("--verbose");

const main = function (argv_) {
  const argv = argv_ || process.argv;
  args.parse(argv);

  let sessions = null;
  if (args.sessions) {
    sessions = mapFor(args.sessions, args.pollingInterval);
  }

  const dynamicProxyOptions = {
    sessionMap: sessions,
    proxyPathPrefix: args.proxyPathPrefix,
    verbose: args.verbose,
    port: args.port,
  };

  if (args.reverseProxy) {
    dynamicProxyOptions.reverseProxy = true;
  }

  if (args.forwardIP) {
    dynamicProxyOptions.forwardIP = args["forwardIP"];
  }

  if (args.forwardPort) {
    dynamicProxyOptions.forwardPort = args["forwardPort"];
  }

  const dynamicProxy = new DynamicProxy(dynamicProxyOptions);
  const listen = {
    port: args.port || 8000,
    ip: args.ip,
  };
  dynamicProxy.listen(listen);
  return dynamicProxy;
};

exports.main = main;

if (require.main === module) {
  main();
}
