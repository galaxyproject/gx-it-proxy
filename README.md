# A dynamic configurable reverse proxy for use within Galaxy

## Invoking

This project can be invoked from ``lib/main.js`` script in the source or
installed and invoked through its [published package](https://www.npmjs.com/package/gx-it-proxy) via npm or npx.

```console
$ npx gx-it-proxy --version
$ npx gx-it-proxy --sessions test.sqlite --port 8001
```

## Double Proxy

To double-proxy (e.g. from Galaxy to a remote proxy that proxies to the application):

```console
host1$ ./lib/main.js --sessions test.sqlite --forwardIP host2 --forwardPort 8001
host2$ ./lib/main.js --port 8001
```
