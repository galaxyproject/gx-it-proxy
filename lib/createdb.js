#!/usr/bin/env node
const args = require("commander");
const packageInfo = require("../package");

// Attempt to require "pg-native" as an optional dependency.
let postgresClient;
try {
  postgresClient = require("pg-native");
} catch (err) {
  // pg-native not installed or cannot be loaded
  postgresClient = null;
}

const sqlite3 = require("sqlite3");

args
  .version(packageInfo.version)
  .option("--sessions <file>", "Routes file to monitor")
  .option("--verbose");

const createDbSqlite = function (sessions) {
  const db = new sqlite3.Database(sessions, (err) => {
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
  if (!postgresClient) {
    console.error(
      "Error: pg-native is not installed. Cannot create PostgreSQL database.",
    );
    process.exit(1);
  }
  const db = new postgresClient();
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
    );`);
};

const main = function (argv_) {
  const argv = argv_ || process.argv;
  args.parse(argv);

  // If sessions is a PostgreSQL connection string and pg-native is missing, exit.
  if (args.sessions.startsWith("postgresql://")) {
    createDbPostgres(args.sessions);
  } else {
    createDbSqlite(args.sessions);
  }
};

exports.main = main;

if (require.main === module) {
  main();
}
