const path = require('path'); // Legger til path-modulen for å håndtere filstier
const express = require('express'); // Legger til Express for å lage webserveren
const sqlite3 = require('sqlite3').verbose(); // Legger til sqlite3 for å håndtere SQLite-databasen

const app = express();  // Oppretter en Express-applikasjon
const PORT = 3000;  //Setter porten til 3000

// Koble til SQLite database
const db = new sqlite3.Database(path.join(__dirname, 'naprapat.db'));

// Opprett tabeller hvis de ikke finnes
db.serialize(() => {
  db.run(`                                               
    CREATE TABLE IF NOT EXISTS pasienter (              --Lager et table med navn pasient 
      pasient_id INTEGER PRIMARY KEY AUTOINCREMENT,     --Lager en pasient_id atributt
      navn TEXT NOT NULL,                               --Lager en navn atributt
      telefonnummer TEXT NOT NULL,                      --Lager en telefonnummer atributt 
      email TEXT NOT NULL                               --Lager en email atributt
    ) 
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS behandling (             --Lager et table med navn behandling            
      behandling_id INTEGER PRIMARY KEY AUTOINCREMENT,  --Lager en behandling_id atributt
      behandlingtype TEXT,                              --Lager en behandlingtype atributt
      varighet TEXT,                                    --Lager en varighet atributt
      pris TEXT                                         --Lager en pris atributt
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS timebestillinger (
      bestilling_id INTEGER PRIMARY KEY AUTOINCREMENT,
      pasient_id INTEGER,
      behandling_id INTEGER,
      bestillingsdato TEXT,
      bestillingstid TEXT UNIQUE,
      kommentar TEXT,
      FOREIGN KEY (pasient_id) REFERENCES pasienter(pasient_id),
      FOREIGN KEY (behandling_id) REFERENCES behandling(behandling_id)
    )
  `);
});

// Sett opp EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Statisk mappe for CSS/JS/bilder
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

// Promise-hjelpefunksjoner
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}
//Henter alle timebestillinger  
app.get("/api/timebestillinger", (req, res) => {
  db.all("SELECT * FROM timebestillinger", [], (err, rows) => {
    if (err) {
      return res.status(500).json(err);
    }
    res.json(rows);
  });
});

// GET / - vis skjema
app.get('/', (req, res) => {
  res.render('index', {
    title: "Naprapatklinikk",
    message: null
  });
});

app.get('/login', (req, res) => {
  res.render('login'); // login.ejs i views-mappen
});

app.get('/register', (req, res) => {
  res.render('register'); // register.ejs i views-mappen
});

// POST /bestill-time - lagre bestilling
app.post('/bestill-time', async (req, res) => {
  try {
    const { navn, telefonnummer, email, bestillingsdato, bestillingstid, behandling_id, kommentar } = req.body;

    // Lag pasient
    const pasient = await dbRun(
      `INSERT INTO pasienter (navn, telefonnummer, email) VALUES (?, ?, ?)`,
      [navn, telefonnummer, email]
    );

    const pasient_id = pasient.lastID;

    // Lag timebestilling
    await dbRun(
      `INSERT INTO timebestillinger (pasient_id, behandling_id, bestillingsdato, bestillingstid, kommentar)
       VALUES (?, ?, ?, ?, ?)`,
      [pasient_id, behandling_id, bestillingsdato, bestillingstid, kommentar]
    );

    res.render('index', {
      title: "Naprapatklinikk",
      message: "Timen din er bestilt!"
    });
  } catch (err) {
    console.error(err);
    res.render('index', {
      title: "Naprapatklinikk",
      message: "Noe gikk galt."
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server kjører på http://localhost:${PORT}`);
});