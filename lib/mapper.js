const fs = require("fs");
const sqlite3 = require("sqlite3");
const watchFile = require("node-watch");

let postgresClient;
try {
  postgresClient = require("pg-native");
} catch (err) {
  // pg-native not installed or cannot be loaded
  postgresClient = null;
}

var updateFromJson = function (path, map) {
  var content = fs.readFileSync(path, "utf8");
  var keyToSession = JSON.parse(content);
  var newSessions = {};
  for (var key in keyToSession) {
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
  for (var oldSession in map) {
    if (!(oldSession in newSessions)) {
      delete map[oldSession];
    }
  }
  for (var newSession in newSessions) {
    map[newSession] = newSessions[newSession];
  }
};
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

var updateFromSqlite = function (path, map) {
  var newSessions = {};
  var loadSessions = function () {
    db.each(
      "SELECT key, key_type, token, host, port, info FROM gxitproxy",
      function (_err, row) {
        var key = row["key"];
        var info = row["info"];
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

  var finish = function () {
    for (var oldSession in map) {
      if (!(oldSession in newSessions)) {
        delete map[oldSession];
      }
    }
    for (var newSession in newSessions) {
      map[newSession] = newSessions[newSession];
    }
    db.close();
  };

  var db = new sqlite3.Database(path, loadSessions);
};

var updateFromPostgres = function (path, map) {
  if (!postgresClient) {
    console.error("Error: pg-native is not installed. Cannot update from PostgreSQL database.");
    process.exit(1);
  }
  var db = new postgresClient();
  var loadedSessions = {};
  db.connectSync(path);

  var queryResult = db.querySync(
    "SELECT key, key_type, token, host, port, info FROM gxitproxy",
  );
  for (var row of queryResult) {
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

  for (var oldSession in map) {
    if (!(oldSession in loadedSessions)) {
      delete map[oldSession];
    }
  }
  for (var loadedSession in loadedSessions) {
    map[loadedSession] = loadedSessions[loadedSession];
  }
  // console.log("Updated map:", map)
  db.end();
};

var watchPostgres = function (path, loadMap, pollingInterval) {
  if (!postgresClient) {
    console.error("Error: pg-native is not installed. Cannot watch PostgreSQL database.");
    process.exit(1);
  }
  // poll the database every `pollingInterval` seconds
  if (pollingInterval > 0) {
    setInterval(loadMap, pollingInterval);
  }

  // watch changes using PostgresSQL asynchronous notifications
  // (https://www.postgresql.org/docs/16/libpq-notify.html)
  var db = new postgresClient();
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
};

var mapFor = function (path, pollingInterval) {
  var map = {};
  var loadMap;
  var watch;
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
};

exports.mapFor = mapFor;
