# A dynamic configurable reverse proxy for use within Galaxy

To double-proxy (e.g. from Galaxy to a remote proxy that proxies to the application):

```console
host1$ ./lib/main.js --sessions test.sqlite --forwardIP host2 --forwardPort 8001
host2$ ./lib/main.js --port 8001
```
