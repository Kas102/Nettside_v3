// Lager en array med ukedager (brukes til å vise navn på dager i tabellen)
const ukedager = ["Søndag","Mandag","Tirsdag","Onsdag","Torsdag","Fredag","Lørdag"];

// Setter valgt uke til dagens dato 
let valgtUkeDato = new Date(); 

// Finner mandagen i samme uke som en gitt dato
function getMonday(date) {
  const d = new Date(date); // lager kopi av datoen så vi ikke endrer originalen
  const day = d.getDay();   // finner ukedag (0= søndag 1=mandag)
  
  // regner ut hvor mange dager vi må trekke fra for å komme til mandag
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  
  // setter ny dato til mandag og returnerer den
  return new Date(d.setDate(diff));
}

// Formaterer dato til YYYY-MM-DD
function formatISODate(date) {
  return date.toISOString().split("T")[0]; // tar bare dato delen uten tiddelen
}

// Henter bestillinger fra backend og markerer dem i ukeplanen
async function hentBestillinger(startDate, sluttDate) {
  try {
    // henter data fra API med start og sluttdato
    const res = await fetch(`/api/timebestillinger?start=${startDate}&end=${sluttDate}`);
    
    // konverterer respons til JSON
    const data = await res.json();

    // går gjennom alle bestillinger
    data.forEach(b => {

      // sørger for at dato er i riktig format (YYYY-MM-DD)
      const riktigDato = new Date(b.dato).toISOString().split("T")[0];

      // sørger for at tid har riktig format (HH:MM)
      const riktigTid = b.start_tid.padStart(5, "0");

      // finner riktig celle i tabellen basert på dato og tid
      const cell = document.querySelector(
        `.slot[data-date="${riktigDato}"][data-time="${riktigTid}"]`
      );

      // hvis cellen finnes og ikke er i fortiden
      if (cell && !cell.classList.contains("past")) {

        // fjerner "ledig"
        cell.classList.remove("ledig");

        // markerer som opptatt
        cell.classList.add("booked");

        // endrer tekst i cellen
        cell.innerText = "Opptatt";
      }
    });

  } catch(err) {
    // hvis noe går galt, logges feilen i console
    console.error("Feil ved henting av bookinger:", err);
  }
}

// --- Generer ukeplan ---
async function oppdaterUkeplan() {

  // finner mandagen i valgt uke
  const startMandag = getMonday(valgtUkeDato);

  // henter alle header-celler (dagene i tabellen)
  const kolonner = document.querySelectorAll(".ukeplan-table tr:first-child th");

  // lager liste over klokkeslett (09:00 til 15:00)
  const timer = [];
  for(let t=9; t<16; t++) timer.push(`${String(t).padStart(2,'0')}:00`);

  // fjerner gamle rader i ukeplanen
  document.querySelectorAll(".ukeplan-table tr.slot-row").forEach(r => r.remove());

  // oppdaterer header med riktige datoer for hver dag
  for(let i=1; i<=5; i++){
    const dato = new Date(startMandag); // kopien av mandag
    dato.setDate(startMandag.getDate() + (i-1)); // går fram dag for dag

    // setter tekst i header (f.eks. "Mandag 14-4-2026")
    kolonner[i].textContent =
      `${ukedager[dato.getDay()]} ${dato.getDate()}-${dato.getMonth()+1}-${dato.getFullYear()}`;
  }

  // lager rader for hver time
  timer.forEach(tid => {

    const tr = document.createElement("tr"); // lager ny rad
    tr.classList.add("slot-row"); // markerer som slot-rad

    // kolonne for klokkeslett
    const tdTime = document.createElement("td");
    tdTime.innerText = tid;
    tr.appendChild(tdTime);

    // lager 5 dager (mandag–fredag)
    for(let i=1;i<=5;i++){

      const dato = new Date(startMandag); // kopi av mandag
      dato.setDate(startMandag.getDate() + (i-1)); // flytter dag

      const td = document.createElement("td"); // lager celle
      td.classList.add("slot"); // markerer som tids-slot

      // lagrer metadata (dato og tid) i HTML-attributter
      td.dataset.time = tid;
      td.dataset.date = formatISODate(dato);

      // lager datetime for å sjekke om tidspunkt er i fortiden
      const now = new Date();
      const slotDateTime = new Date(`${formatISODate(dato)}T${tid}`);

      // hvis tidspunkt er passert
      if (slotDateTime < now) {
        td.classList.add("past"); // marker som utløpt
        td.innerText = "Utløpt";
      } else {
        td.classList.add("ledig"); // ellers ledig
        td.innerText = "Ledig";
      }

      tr.appendChild(td); // legger cellen i raden
    }

    // legger raden inn i tabellen
    document.querySelector(".ukeplan-table").appendChild(tr);
  });

  // finner start og sluttdato  (mandag–fredag)
  const startISO = formatISODate(startMandag);
  const sluttISO = formatISODate(
    new Date(startMandag.getTime() + 4*24*60*60*1000)
  );

  // henter bestillinger og oppdaterer ukeplanen
  await hentBestillinger(startISO, sluttISO);

  // legger til klikk-events på alle slots
  leggTilKlikkEvents();
}

// --- Klikk på ledig time ---
function leggTilKlikkEvents() {

  // går gjennom alle slots
  document.querySelectorAll(".slot").forEach(slot => {

    // legger til klikk-event på hver celle
    slot.addEventListener("click", function() {

      // hvis allerede booket eller i fortiden ikke klikkbar
      if(
        this.classList.contains("booked") ||
        this.classList.contains("past")
      ) return;

      // fyller inputfelt med valgt tid
      document.getElementById("timeInput").value = this.dataset.time;
      document.getElementById("dateInput").value = this.dataset.date;

      // fjerner tidligere valgt celle
      document.querySelectorAll(".slot").forEach(s =>
        s.classList.remove("valgt")
      );

      // markerer denne som valgt
      this.classList.add("valgt");

      // scroller ned til booking-form slik at du kan se hvilken du valgde
      document.getElementById("booking")
        .scrollIntoView({behavior:"smooth"});
    });
  });
}

// --- Navigasjon mellom uker (neste uke) ---
document.getElementById("nextWeek").addEventListener("click", ()=>{
  valgtUkeDato.setDate(valgtUkeDato.getDate() + 7); // går +7 dager
  oppdaterUkeplan(); // oppdaterer visning
});

// --- Navigasjon mellom uker (forrige uke) ---
document.getElementById("prevWeek").addEventListener("click", ()=>{
  valgtUkeDato.setDate(valgtUkeDato.getDate() - 7); // går -7 dager
  oppdaterUkeplan(); // oppdaterer visning
});

// --- Hvis bruker endrer dato manuelt ---
document.getElementById("dateInput").addEventListener("change", e=>{
  valgtUkeDato = new Date(e.target.value); // setter ny valgt uke
  oppdaterUkeplan(); // oppdater ukeplan
});

// --- Når siden lastes ---
window.addEventListener("DOMContentLoaded", ()=>{
  oppdaterUkeplan(); // bygger ukeplan første gang
});

// knapp for å vise/skjule ukeplan
const toggleBtn = document.getElementById("toggleUkeplan");
const ukeplan = document.getElementById("ukeplan");

// klikker på vis/skjul knapp
toggleBtn.addEventListener("click", () => {

  // hvis skjult → vis
  if (ukeplan.style.display === "none" || ukeplan.style.display === "") {
    ukeplan.style.display = "block";
    toggleBtn.textContent = "Skjul ukeplan";

  // hvis synlig → skjul
  } else {
    ukeplan.style.display = "none";
    toggleBtn.textContent = "Vis ukeplan";
  }
});