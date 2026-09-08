const initSqlJs = require('sql.js');
const fs = require('fs');

async function updateDb() {
  const SQL = await initSqlJs();
  const buffer = fs.readFileSync('database.sqlite');
  const db = new SQL.Database(buffer);

  db.run("UPDATE products SET image_url = '/images/applemusic.svg' WHERE name LIKE '%Apple Music%'");
  db.run("UPDATE products SET image_url = '/images/ytmusic.svg' WHERE name LIKE '%YouTube Music%'");
  db.run("UPDATE products SET image_url = '/images/tidal.svg' WHERE name LIKE '%TIDAL%'");

  const data = db.export();
  fs.writeFileSync('database.sqlite', Buffer.from(data));

  const res = db.exec("SELECT id, name, image_url FROM products");
  console.log(JSON.stringify(res[0].values, null, 2));
}

updateDb().catch(console.error);
