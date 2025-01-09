import fs from "fs";
import sqlite3 from "sqlite3";
import postgresClient from "pg-native";
import watchFile from "node-watch";

function updateFromJson(path, map) {
  const content = fs.readFileSync(path, "utf8");
  const keyToSession = JSON.parse(content);
  const newSessions = {};
  for (const key in keyToSession) {
    let info = keyToSession[key]?.info;
    if (info) {
      info = JSON.parse(info);
    }
    newSessions[key] = {
      target: {
        host: keyToSession[key]["host"],
        port: parseInt(keyToSession[key]["port"]),
        requires_path_in_url: info?.requires_path_in_url,
        requires_path_in_header_named: info?.requires_path_in_header_named,
      },
    };
  }
  for (const oldSession in map) {
    if (!(oldSession in newSessions)) {
      delete map[oldSession];
    }
  }
  for (const newSession in newSessions) {
    map[newSession] = newSessions[newSession];
  }
}
/*
CREATE TABLE gxitproxy
                                 (key text,
                                  key_type text,
                                  token text,
                                  host text,
                                  port integer,
                                  info text,
                                  PRIMARY KEY (key, key_type)
                                  );
INSERT INTO "gxitproxy" VALUES('e3c1915314cbd610','interactivetoolentrypoint','d76ec842e77049059753b0d40992d15f','132.230.68.22',1033,NULL);
INSERT INTO "gxitproxy" VALUES('d24902ddec2e97f1','interactivetoolentrypoint','bea3a5bb3d4b4c6c8bcb7579e023bf66','132.230.68.22',1035,NULL);

*/

function updateFromSqlite(path, map) {
  const newSessions = {};
  const loadSessions = () => {
    db.each(
      "SELECT key, key_type, token, host, port, info FROM gxitproxy",
      function (_err, row) {
        const key = row["key"];
        let info = row["info"];
        if (info) {
          info = JSON.parse(info);
        }
        newSessions[key] = {
          target: { host: row["host"], port: parseInt(row["port"]) },
          key_type: row["key_type"],
          token: row["token"],
          requires_path_in_url: info?.requires_path_in_url,
          requires_path_in_header_named: info?.requires_path_in_header_named,
        };
      },
      finish,
    );
  };

  const finish = () => {
    for (const oldSession in map) {
      if (!(oldSession in newSessions)) {
        delete map[oldSession];
      }
    }
    for (const newSession in newSessions) {
      map[newSession] = newSessions[newSession];
    }
    db.close();
  };

  const db = new sqlite3.Database(path, loadSessions);
}

function updateFromPostgres(path, map) {
  const db = postgresClient();
  const loadedSessions = {};
  db.connectSync(path);

  const queryResult = db.querySync(
    "SELECT key, key_type, token, host, port, info FROM gxitproxy",
  );
  for (const row of queryResult) {
    let info = row.info;
    if (info) {
      info = JSON.parse(info);
    }
    loadedSessions[row.key] = {
      target: { host: row.host, port: parseInt(row.port) },
      key_type: row.key_type,
      token: row.token,
      requires_path_in_url: info?.requires_path_in_url,
      requires_path_in_header_named: info?.requires_path_in_header_named,
    };
  }

  for (const oldSession in map) {
    if (!(oldSession in loadedSessions)) {
      delete map[oldSession];
    }
  }
  for (const loadedSession in loadedSessions) {
    map[loadedSession] = loadedSessions[loadedSession];
  }
  // console.log("Updated map:", map)
  db.end();
}

function watchPostgres(path, loadMap, pollingInterval) {
  // poll the database every `pollingInterval` seconds
  if (pollingInterval > 0) {
    setInterval(loadMap, pollingInterval);
  }

  // watch changes using PostgresSQL asynchronous notifications
  // (https://www.postgresql.org/docs/16/libpq-notify.html)
  const db = postgresClient();
  db.connect(path, function (err) {
    if (err) {
      throw err;
    }

    db.on("notification", function (_msg) {
      loadMap(path, loadMap);
    });
    db.query("LISTEN gxitproxy", function (err, _res) {
      if (err) {
        throw err;
      }
    });
  });
  // requires creating a notification function and a trigger for the gxitproxy
  // table on the database (see README.md for more details)
  // delivery of notifications is not guaranteed, therefore, combining polling
  // with asynchronous notifications is strongly recommended
}

export function mapFor(path, pollingInterval) {
  const map = {};
  let loadMap;
  let watch;
  if (path.endsWith(".sqlite")) {
    loadMap = function () {
      updateFromSqlite(path, map);
    };
    watch = watchFile;
  } else if (path.startsWith("postgresql://")) {
    loadMap = function () {
      updateFromPostgres(path, map);
    };
    watch = function (path, loadMap) {
      return watchPostgres(path, loadMap, pollingInterval);
    };
  } else {
    loadMap = function () {
      updateFromJson(path, map);
    };
    watch = watchFile;
  }
  console.log("Watching path " + path);
  loadMap();
  watch(path, loadMap);
  return map;
}
