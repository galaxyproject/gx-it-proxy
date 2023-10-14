#!/usr/bin/env node
const args = require("commander");
const packageInfo = require("../package");
var sqlite3 = require("sqlite3");

args
  .version(packageInfo.version)
  .option("--sessions <file>", "Routes file to monitor")
  .option("--verbose");

const main = function (argv_) {
  const argv = argv_ || process.argv;
  args.parse(argv);
  let db = new sqlite3.Database(args.sessions, (err) => {
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

exports.main = main;

if (require.main === module) {
  main();
}
