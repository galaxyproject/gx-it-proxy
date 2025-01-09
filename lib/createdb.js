#!/usr/bin/env node
import { Command } from "commander";
import packageInfo from "../package.json";
import postgresClient from "pg-native";
import sqlite3 from "sqlite3";

function createDbSqlite(sessions) {
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
}

function createDbPostgres(sessions) {
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
    );`);
}

export function main(argv_) {
  const argv = argv_ || process.argv;
  const args = new Command();

  args
    .version(packageInfo.version)
    .option("--sessions <file>", "Routes file to monitor")
    .option("--verbose");

  args.parse(argv);
  if (args.sessions.startsWith("postgresql://")) {
    createDbPostgres(args.sessions);
  } else {
    createDbSqlite(args.sessions);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
