var fs = require("fs");
var sqlite3 = require("sqlite3");
var watch = require("node-watch");

var endsWith = function(subjectString, searchString) {
  var position = subjectString.length;
  position -= searchString.length;
  var lastIndex = subjectString.indexOf(searchString, position);
  return lastIndex !== -1 && lastIndex === position;
};

var updateFromJson = function(path, map) {
  var content = fs.readFileSync(path, "utf8");
  var keyToSession = JSON.parse(content);
  var newSessions = {};
  for (var key in keyToSession) {
    newSessions[key] = {
      target: {
        host: keyToSession[key]["host"],
        port: parseInt(keyToSession[key]["port"])
      }
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

var updateFromSqlite = function(path, map) {
  var newSessions = {};
  var loadSessions = function() {
    db.each(
      "SELECT key, key_type, token, host, port FROM gxitproxy",
      function(err, row) {
        var key = row["key"];
        newSessions[key] = {
          target: { host: row["host"], port: parseInt(row["port"]) },
          key_type: row["key_type"],
          token: row["token"]
        };
      },
      finish
    );
  };

  var finish = function() {
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

var mapFor = function(path) {
  var map = {};
  var loadMap;
  if (endsWith(path, ".sqlite")) {
    loadMap = function() {
      updateFromSqlite(path, map);
    };
  } else {
    loadMap = function() {
      updateFromJson(path, map);
    };
  }
  console.log("Watching path " + path);
  loadMap();
  watch(path, loadMap);
  return map;
};

exports.mapFor = mapFor;
