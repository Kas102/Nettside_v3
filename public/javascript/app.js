//Lager en array med ukedager og en variabel for valgt uke dato
const ukedager = ["Søndag","Mandag","Tirsdag","Onsdag","Torsdag","Fredag","Lørdag"];
let valgtUkeDato = new Date();

// Finner mandagen i uken uansett hvilken dato
function getMonday(date) {
  const d = new Date(date); 
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

//Formaterer dato til YYYY-MM-DD
function formatISODate(date) {
  return date.toISOString().split("T")[0];
}

// Henter bestillinger fra backend og markerer de som booket i ukeplanen
async function hentBestillinger(startDate, sluttDate) {
  try {
    const res = await fetch(`/api/timebestillinger?start=${startDate}&end=${sluttDate}`);
    const data = await res.json();

    data.forEach(b => {
      //  Sørger for riktig format
      const riktigDato = new Date(b.dato).toISOString().split("T")[0];
      const riktigTid = b.start_tid.padStart(5, "0");

      const cell = document.querySelector(
        `.slot[data-date="${riktigDato}"][data-time="${riktigTid}"]`
      );

      if (cell && !cell.classList.contains("past")) {
      cell.classList.remove("ledig");
      cell.classList.add("booked");
      cell.innerText = "Opptatt";
    }
    });
  } catch(err) {
    console.error("Feil ved henting av bookinger:", err);
  }
}

// --- Generer slots i ukeplan ---
async function oppdaterUkeplan() {
  const startMandag = getMonday(valgtUkeDato);
  const kolonner = document.querySelectorAll(".ukeplan-table tr:first-child th");

  const timer = [];
  for(let t=9; t<16; t++) timer.push(`${String(t).padStart(2,'0')}:00`);

  // Fjern gamle rader
  document.querySelectorAll(".ukeplan-table tr.slot-row").forEach(r => r.remove());

  // Oppdater header
  for(let i=1; i<=5; i++){
    const dato = new Date(startMandag);
    dato.setDate(startMandag.getDate() + (i-1));
    kolonner[i].textContent = `${ukedager[dato.getDay()]} ${dato.getDate()}-${dato.getMonth()+1}-${dato.getFullYear()}`;
  }

  // Lag rader
  timer.forEach(tid => {
    const tr = document.createElement("tr");
    tr.classList.add("slot-row");

    const tdTime = document.createElement("td");
    tdTime.innerText = tid;
    tr.appendChild(tdTime);

    for(let i=1;i<=5;i++){
      const dato = new Date(startMandag);
      dato.setDate(startMandag.getDate() + (i-1));

      const td = document.createElement("td");
      td.classList.add("slot");
      td.dataset.time = tid;
      td.dataset.date = formatISODate(dato);

      
      const now = new Date();
      const slotDateTime = new Date(`${formatISODate(dato)}T${tid}`);

      if (slotDateTime < now) {
        td.classList.add("past");
        td.innerText = "Utgått";
      } else {
        td.classList.add("ledig");
        td.innerText = "Ledig";
      }

      tr.appendChild(td);
    }

    document.querySelector(".ukeplan-table").appendChild(tr);
  });

  // Hent bookinger
  const startISO = formatISODate(startMandag);
  const sluttISO = formatISODate(new Date(startMandag.getTime() + 4*24*60*60*1000));
  await hentBestillinger(startISO, sluttISO);

  leggTilKlikkEvents();
}

// --- Klikk på time ---
function leggTilKlikkEvents() {
  document.querySelectorAll(".slot").forEach(slot => {
    slot.addEventListener("click", function() {

      if(
        this.classList.contains("booked") ||
        this.classList.contains("past")
      ) return;

      document.getElementById("timeInput").value = this.dataset.time;
      document.getElementById("dateInput").value = this.dataset.date;

      document.querySelectorAll(".slot").forEach(s=>s.classList.remove("valgt"));
      this.classList.add("valgt");

      document.getElementById("booking").scrollIntoView({behavior:"smooth"});
    });
  });
}

// --- Ukenavigasjon ---
document.getElementById("nextWeek").addEventListener("click", ()=>{
  valgtUkeDato.setDate(valgtUkeDato.getDate() + 7);
  oppdaterUkeplan();
});

document.getElementById("prevWeek").addEventListener("click", ()=>{
  valgtUkeDato.setDate(valgtUkeDato.getDate() - 7);
  oppdaterUkeplan();
});

// --- Når dato endres manuelt ---
document.getElementById("dateInput").addEventListener("change", e=>{
  valgtUkeDato = new Date(e.target.value);
  oppdaterUkeplan();
});

// --- Init ---
window.addEventListener("DOMContentLoaded", ()=>{
  oppdaterUkeplan();
});

const toggleBtn = document.getElementById("toggleUkeplan");
const ukeplan = document.getElementById("ukeplan");

toggleBtn.addEventListener("click", () => {
  if (ukeplan.style.display === "none" || ukeplan.style.display === "") {
    ukeplan.style.display = "block";
    toggleBtn.textContent = "Skjul ukeplan";
  } else {
    ukeplan.style.display = "none";
    toggleBtn.textContent = "Vis ukeplan";
  }
});