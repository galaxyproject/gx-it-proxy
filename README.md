# A dynamic configurable reverse proxy for use within Galaxy

## Invoking

This project can be invoked from ``lib/main.js`` script in the source or
installed and invoked through its [published package](https://www.npmjs.com/package/gx-it-proxy) via npm or npx.

```console
$ npx gx-it-proxy --version
$ npx gx-it-proxy --sessions test.sqlite --port 8001  # use SQLite
$ npx gx-it-proxy --sessions test.json --port 8001    # use a JSON file
$ npx gx-it-proxy --sessions postgresql:///galaxy?host=/var/run/postgresql --port 8001  # use PostgreSQL
```

## Double Proxy

To double-proxy (e.g. from Galaxy to a remote proxy that proxies to the application):

```console
host1$ ./lib/main.js --sessions test.sqlite --forwardIP host2 --forwardPort 8001
host2$ ./lib/main.js --port 8001
```

## Sessions

The proxy loads sessions from the file or database passed with the `--sessions`
option. SQLite and JSON files are watched and reloaded on every change.
PostgreSQL databases are polled every five seconds by default. The polling
interval can be configured via the `--pollingInterval` option (in ms).

Faster updates for PostgreSQL databases are possible via
[PostgreSQL asynchronous notifications](https://www.postgresql.org/docs/16/libpq-notify.html).
To enable them, create a PostgreSQL trigger that sends a
NOTIFY message to the channel `gxitproxy` every time the table `gxitproxy`
changes. 

```SQL
CREATE OR REPLACE FUNCTION notify_gxitproxy()
RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('gxitproxy', 'Table "gxitproxy" changed');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER gxitproxy_notify
AFTER INSERT OR UPDATE OR DELETE ON gxitproxy
FOR EACH ROW EXECUTE FUNCTION notify_gxitproxy();
```

Although it is possible to disable polling using `--pollingInterval 0`, it is
strongly discouraged, as the delivery of asynchronous notifications is not
guaranteed.
