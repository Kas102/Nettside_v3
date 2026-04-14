const path = require('path'); //Henter path-modulen som brukes for å håndtere filstier
const express = require('express'); //Henter express-modulen som brukes for å lage en webserver
const sqlite3 = require('sqlite3').verbose(); //Henter sqlite modulen som skal brukes til sql databasen 
const session = require('express-session'); //Henter express session modulen 
const bcrypt = require('bcrypt'); //Henter bcrypt modulen som brukes for å hashe passord

const app = express();  // Lager en express app
const PORT = 3000;  //setter porten som serveren skal kjøre på til 3000

app.use(express.urlencoded({ extended: true }));  

//Session slik at du kan logge inn og holde deg innlogget imens du er på nettsiden
app.use(session({ 
  secret: 'superhemmelig123',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false,
    maxAge: 1000 * 60 * 60 * 24
  }
}));

//Gjør session tilgjengelig i alle ejs-filer
app.use((req, res, next) => {
  res.locals.user = req.session;
  next();
});

// Database sqlite
const db = new sqlite3.Database(path.join(__dirname, 'naprapat.db'));

// Lager tabeller hvis de ikke finnes, og en helper for å kjøre db.run som promise
db.serialize(() => {
//Lager tabbellen bruker hvis den ikke allerder finnes
  db.run(` 
    CREATE TABLE IF NOT EXISTS Bruker (  
      bruker_id INTEGER PRIMARY KEY AUTOINCREMENT,
      navn TEXT NOT NULL,
      passord_hash TEXT NOT NULL,
      laget_dato TEXT NOT NULL,
      rolle TEXT NOT NULL,
      telefonnummer TEXT NOT NULL,
      email TEXT NOT NULL
    )
  `);
  //Lager tabellen time hvis den ikke allerede finnes
  db.run(`
    CREATE TABLE IF NOT EXISTS Time (
      time_id INTEGER PRIMARY KEY AUTOINCREMENT,
      start_tid TEXT NOT NULL,
      slutt_tid TEXT NOT NULL,
      dato TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ledig',
      bruker_id INTEGER,
      kommentar TEXT,
      FOREIGN KEY (bruker_id) REFERENCES Bruker(bruker_id),
      UNIQUE(dato, start_tid)
    )
  `);

});

// Wrapper-funksjon for databasekall som gjør db.run om til en Promise,
// slik at vi kan bruke async/await i stedet for callbacks
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

// Middleware som sjekker om brukeren er logget inn ved å se etter userId i session.
// Hvis brukeren er logget inn så går vi videre til neste funksjon,hvis den ikke er det sendes brukeren til login-siden.
function isLoggedIn(req, res, next) {
  if (req.session.userId) return next();
  res.redirect('/login');
}

// Middleware som sjekker om den innloggede brukeren har admin-rolle.
// Hvis den har det får brukeren tilgang videre, hvis den ikke har det får den feilmelding /ingen tilgang.
function isAdmin(req, res, next) {
  if (req.session.rolle === 'admin') {
    return next();
  }
  res.send("Ingen tilgang");
}

// Registrering av nye brukere
app.post('/register', async (req, res) => { // Tar imot en POST-forespørsel til /register
  const { navn, password, telefonnummer, email } = req.body;  // Henter ut navn, password, telefonnummer og email fra forespørselen

  const hash = await bcrypt.hash(password, 10); //Hasher passordet med bcrypt, og salt på 10 runder
  //Setter inn informasjonen i databasen og dersom en feil oppstår sender den en feilmeldig.
  db.run(` 
    INSERT INTO Bruker (navn, passord_hash, laget_dato, rolle, telefonnummer, email) 
    VALUES (?, ?, datetime('now'), 'user', ?, ?)
  `, [navn, hash, telefonnummer, email], (err) => {
    if (err) return res.send("Feil ved registrering");
    res.redirect('/login');
  });
});


//Lar brukerne logge inn på brukeren sin.
app.post('/login', (req, res) => { // Tar imot en POST-forespørsel til /login
  const { navn, password } = req.body; // Henter ut navn og password fra forespørselen
//Skjekker om databasen har en bruker mde det navnet, ellers kommer det en feilmelding.
  db.get(`SELECT * FROM Bruker WHERE navn = ?`, [navn], async (err, user) => { 
    if (!user) return res.send("Bruker finnes ikke");
    // Sammenligner passordet som brukeren skrev inn med passord-hashen i databasen ved hjelp av bcrypt.
    const match = await bcrypt.compare(password, user.passord_hash);
    //Hvis passordet matcher med det i databasen lagres informasjonen i sessionen, og brukeren sendes til index-siden. 
    if (match) {
      req.session.userId = user.bruker_id; //Lagrer bruker_id i sessionen for å holde styr på hvem som er logget inn
      req.session.navn = user.navn; //Lagrer navn i sessionen
      req.session.telefonnummer = user.telefonnummer; //Lagrer telefonnummer i sessionen 
      req.session.email = user.email; //Lagrer email i sessionen
      req.session.rolle = user.rolle; //Lagrer rolle i sessionen 
      req.session.save(() => res.redirect('/')); //Lagrer sessionen og sender brukeren til index-siden
    } else {
      res.send("Feil passord"); //Hvis passordet ikke matcher kommer det en feilmelding
    }
  });
});

//Tar imo en POST forespørsel til /admin avlys og skjekker om brukeren er logget inn og har admin rolle
app.post('/admin-avlys', isLoggedIn, isAdmin, (req, res) => {
  const { time_id } = req.body; //Henter ut time_id fra forespørselen, som er ID-en til timen som skal avlyses
 //opptatere timen i databasen hvor time_id matcher forespørselen.
  db.run(`
    UPDATE Time
    SET status = 'ledig',
        bruker_id = NULL,
        kommentar = NULL
    WHERE time_id = ?
  `, [time_id], function(err) {
    //Hvis det oppstår en feil ved avlysning kommer det en feilmelding.
    if (err) {
      return res.send("Feil ved avlysning");
    }
    //Hvis avlysningen er vellykket, sendes admin tilbake til admin-timer siden.
    res.redirect('/admin-timer');
  });
});

// Lar brukeren logge ut ved å ødelegge sessionen og sende dem tilbake til forsiden.
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

//Lar brukern slette sine egen brukerkonto
app.post('/slett-bruker', isLoggedIn, async (req, res) => {
  const bruker_id = req.session.userId; //Henter ut bruker_id fra sessionen for å vite hvilken bruker som skal slettes

  try { //Sjekker om brukeren har noen timer
    const timer = await new Promise((resolve, reject) => { // Henter alle timer som tilhører den innloggede brukeren
      db.all(
        `SELECT * FROM Time WHERE bruker_id = ?`,
        [bruker_id],
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows);
        }
      );
    });

    // Hvis brukeren har noen timer får den ikke lov til å slette kontoen sin
    if (timer.length > 0) {
      return res.send("Du kan ikke slette brukeren din før alle timer er avlyst");
    }

    //sletter brukeren fra databasen
    await dbRun(`DELETE FROM Bruker WHERE bruker_id = ?`, [bruker_id]);

    // ødelegger sessionen og sender brukeren tilbake til forsiden
    req.session.destroy(() => {
      res.redirect('/');
    });
    //Hvis det oppstår en feil ved sletting av brukeren kommer det en feilmelding.
  } catch (err) {
    console.error(err);
    res.send("Feil ved sletting av bruker");
  }
});

//Henter bookinger fra backend for en gitt dato-range, og oppdaterer kalenderen i frontend basert på det.
app.get('/', (req, res) => { // Tar imot en GET-forespørsel til roten av nettstedet
  const sql = `
  SELECT time_id, start_tid, slutt_tid, dato
  FROM Time
  ORDER BY dato, start_tid
`;

  db.all(sql, [], (err, rows) => { 
    if (err) { 
      console.error("Feil i / ruten:", err);
      return res.status(500).send("Serverfeil: Se terminalen for detaljer");
    }

    res.render('index', {
      timer: rows,
      message: null
    });
  });
});

//Henter alle ledige timer for å vise dem i admin-panel
app.get('/admin-timer', isLoggedIn, isAdmin, (req, res) => {
  //
  const sql = `
    SELECT Time.*, Bruker.navn
    FROM Time
    LEFT JOIN Bruker ON Time.bruker_id = Bruker.bruker_id
    WHERE status = 'booket'
    ORDER BY dato, start_tid
  `;
  
  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error(err);
      return res.send("Feil ved henting av timer");
    }

    res.render('admin-timer', {
      timer: rows
    });
  });

});

//Får en POST forespørsel til /timer og henter ut timer for den innloggede brukeren
app.get('/timer', isLoggedIn, (req, res) => {
  const bruker_id = req.session.userId; //Henter ut bruker_id fra sessionen for å vite hvilken brukers timer som skal hentes
 //Henter alle timer som tilhører den innloggede brukeren, og sender dem til timer.ejs for visning
  const sql = `
  SELECT time_id, dato, start_tid, slutt_tid, status, kommentar
  FROM Time
  WHERE bruker_id = ?
  ORDER BY dato, start_tid
`;
  //Hvis det oppstår en feil kommer det feilmelding
  db.all(sql, [bruker_id], (err, rows) => {
    if (err) {
      console.error(err);
      return res.send("Feil ved henting av timer");
    }

    res.render('timer', {
      timer: rows
    });
  });
});
//Får en POST request fra frontend
app.post('/bestill-time', isLoggedIn, async (req, res) => {
  try {
    const { bestillingsdato, bestillingstid, kommentar } = req.body;
    const bruker_id = req.session.userId; //henter ut bruker_id fra sessionen

    //ombookning
    if (req.session.ombook_time_id) {
      const gammelTimeId = req.session.ombook_time_id;

      // frigjør gammel time
      await dbRun(`
        UPDATE Time
        SET status = 'ledig',
            bruker_id = NULL,
            kommentar = NULL
        WHERE time_id = ?
      `, [gammelTimeId]);

      req.session.ombook_time_id = null;
    }

    //Finn en ny ledig time
    const time = await new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM Time WHERE dato = ? AND start_tid = ? AND status = 'ledig'`,
        [bestillingsdato, bestillingstid],
        (err, row) => {
          if (err) return reject(err);
          resolve(row);
        }
      );
    });
    // Hvis det ikke finnes en ledig time på det tidspunktet kommer det en feilmelding
    if (!time) {
      return res.send("Timen er ikke ledig");
    }

    // Oppdaterer timen i databasen til å være booket, og knytter den til den innloggede brukeren
    await dbRun(`
      UPDATE Time
      SET status = 'booket',
          bruker_id = ?,
          kommentar = ?
      WHERE time_id = ?
    `, [bruker_id, kommentar, time.time_id]);
    
    res.redirect('/timer'); // Sender brukeren til /timer for å se sine timer
  // Hvis det oppstår en feil ved bestilling kommer det en feilmelding
  } catch (err) {
    console.log(err);
    res.send("Feil ved bestilling");
  }
});
//lager en funksjon som formaterer en dato til formatet YYYY-MM-DD, som er det formatet vi bruker i databasen
function formatDato(dato) {
  const year = dato.getFullYear(); // Henter ut året fra datoen
  const month = String(dato.getMonth() + 1).padStart(2, '0'); // Henter ut måneden fra datoen
  const day = String(dato.getDate()).padStart(2, '0'); // Henter ut dagen fra datoen
  return `${year}-${month}-${day}`; // Returnerer datoen i formatet YYYY-MM-DD
}

// Lager timer for en dag
function lagTimerForDag(dato, start, slutt, intervallMinutter) { 
  let current = new Date(`${dato}T${start}`); // Oppretter en ny dato for starttid
  let end = new Date(`${dato}T${slutt}`); // Oppretter en ny dato for sluttid
 
  while (current < end) { 
    let neste = new Date(current.getTime() + intervallMinutter * 60000); 

    const startTid = current.toTimeString().slice(0, 5);
    const sluttTid = neste.toTimeString().slice(0, 5);

    db.run(`
      INSERT OR IGNORE INTO Time (start_tid, slutt_tid, dato)
      VALUES (?, ?, ?)
    `, [startTid, sluttTid, dato]);

    current = neste;
  }
}

// Lager timer én måned frem fra i dag
function lagTimerEnMaanedFrem() {
  let idag = new Date();
  let sluttDato = new Date();
  sluttDato.setMonth(sluttDato.getMonth() + 1);

  let current = new Date(idag);

  while (current < sluttDato) {
    let dag = current.getDay();

    // Hopper over helg hvor 0 = søndag, 6 = lørdag)
    if (dag !== 0 && dag !== 6) {
      let datoStr = formatDato(current);

      // 09:00 til 16:00 som er arbeidstimene til naprapaten
      lagTimerForDag(datoStr, '09:00', '16:00', 60);
    }

    current.setDate(current.getDate() + 1);
  }
}
 //Får en POST request /avlystime
app.post('/avlys-time', isLoggedIn, (req, res) => {
  const { dato, tid } = req.body;
 //kjører en sql opptatering på databasen
  db.run(`
    UPDATE Time
    SET status = 'ledig',
        bruker_id = NULL,
        kommentar = NULL
    WHERE dato = ? AND start_tid = ?
  `, [dato, tid], (err) => {
    //Hvis det oppstår en feil ved avlysning kommer det en feilmelding.
    if (err) return res.send("Feil ved avlysning");
    res.redirect('/timer'); //Sender brukeren til /timer for å se sine timer etter avlysning
  });
});

// ejs
app.set('view engine', 'ejs'); // Setter view engine til ejs, som gjør at vi kan bruke ejs-filer for å lage HTML-sider
app.set('views', path.join(__dirname, 'views')); // Setter mappen for ejs-filer til "views" mappen i prosjektet
app.get('/api/timebestillinger', (req, res) => {  // Får en GET-forespørsel til /api/timebestillinger
  const { start, end } = req.query;
  //lager en sql spørring 
  const sql = `
    SELECT dato, start_tid 
    FROM Time
    WHERE dato BETWEEN ? AND ?
    AND status = 'booket'
  `;
 // kjører sql spørringen på databasen, og sender resultatet som json til frontend
  db.all(sql, [start, end], (err, rows) => {
    if (err) { // Hvis det oppstår en feil ved henting av timebestillinger kommer det en feilmelding.
      console.error("DB feil:", err);
      return res.status(500).json({ error: "Databasefeil" });
    }

    res.json(rows); // sender json til frontend
  });
});
app.post('/ombook-time', isLoggedIn, (req, res) => {
  const { time_id } = req.body;

  // lagrer hvilken time som skal ombookes
  req.session.ombook_time_id = time_id;

  // sender bruker til bestillingsside
  res.redirect('/bestilling');
});

// statisk
app.use(express.static(path.join(__dirname, 'public')));

// SIDER
app.get('/login', (req, res) => res.render('login')); //Henter en http GET forespørsel til /login og sender brukeren til login.ejs
app.get('/register', (req, res) => res.render('register')); //Henter en http GET forespørsel til /register og sender brukeren til register.ejs
app.get('/index', (req, res) => res.render('index'));   //Henter en http GET forespørsel til /index og sender brukeren til index.ejs
app.get('/bestilling', (req, res) => {  //Henter en http GET forespørsel til /bestilling og sender brukeren til bestilling.ejs
  res.render('bestilling', {  // sender med en variabel som sier om dette er en ombooking eller vanlig bestilling
    ombook: req.session.ombook_time_id || null});});  // Hvis det finnes en ombook_time_id i sessionen, send den med som "ombook", ellers send null 

//kjører funksjonen som lager timer for en måned frem i tid når serveren starter
lagTimerEnMaanedFrem();


// START
app.listen(PORT, () => { 
  console.log(`Server kjører på http://localhost:${PORT}`); //console log som sier at serveren kjører, og på hvilken adresse
});
