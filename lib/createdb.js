#!/usr/bin/env node
const args = require("commander");
const packageInfo = require("../package");
const { startsWith } = require("./mapper");
var postgresClient = require("pg-native");
var sqlite3 = require("sqlite3");

args
  .version(packageInfo.version)
  .option("--sessions <file>", "Routes file to monitor")
  .option("--verbose");

const createDbSqlite = function (sessions) {
  let db = new sqlite3.Database(sessions, (err) => {
    if (err) {
      return console.error(err.message);
    }
  });
  db.run(
    `
CREATE TABLE gxitproxy
    (key text,
     key_type text,
     token text,
     host text,
     port integer,
     info text,
     PRIMARY KEY (key, key_type)
);`,
    (err) => {
      if (err) {
        return console.log(err.message);
      }
    },
  );
  db.close();
};

const createDbPostgres = function (sessions) {
  const db = postgresClient();
  db.connectSync(sessions);
  db.querySync(`
    CREATE TABLE IF NOT EXISTS gxitproxy (
      key text,
      key_type text,
      token text,
      host text,
      port integer,
      info text,
      PRIMARY KEY (key, key_type)
    );`
  )
};

const main = function (argv_) {
  const argv = argv_ || process.argv;
  args.parse(argv);
  if (startsWith(args.sessions, "postgresql://")) {
    createDbPostgres(args.sessions);
  } else {
    createDbSqlite(args.sessions);
  }
}

exports.main = main;

if (require.main === module) {
  main();
}
