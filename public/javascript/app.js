const ukedager = ["Søndag", "Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag"];

let valgtUkeDato = new Date(); 

// --- Finn mandag ---
function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

// --- Formater dato ---
function formatDate(date) {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${d}-${m}-${y}`;
}

// --- Oppdater ukeplan ---
function oppdaterUkeplan() {
  const startMandag = getMonday(valgtUkeDato);

  const kolonner = document.querySelectorAll(".ukeplan-table tr:first-child th");

  for (let i = 1; i < kolonner.length; i++) {
    const dato = new Date(startMandag);
    dato.setDate(startMandag.getDate() + (i - 1));

    const dagNavn = ukedager[dato.getDay()];
    const formatertDato = formatDate(dato);

    kolonner[i].textContent = `${dagNavn} ${formatertDato}`;

    // Oppdater slots
    document.querySelectorAll(`.ukeplan-table tr td:nth-child(${i + 1})`).forEach(cell => {
      if (cell.classList.contains("slot")) {
        cell.setAttribute("data-date", dato.toISOString().split("T")[0]);
      }
    });
  }
}

// --- Klikk på time ---
document.querySelectorAll(".slot").forEach(slot => {
  slot.addEventListener("click", function () {

    const valgtTid = this.getAttribute("data-time");
    const valgtDato = this.getAttribute("data-date");

    document.getElementById("timeInput").value = valgtTid;
    document.getElementById("dateInput").value = valgtDato;

    document.querySelectorAll(".slot").forEach(s => s.classList.remove("valgt"));
    this.classList.add("valgt");

    document.getElementById("booking").scrollIntoView({ behavior: "smooth" });
  });
});

// --- KNAPPER: neste / forrige uke ---
document.getElementById("nextWeek").addEventListener("click", () => {
  valgtUkeDato.setDate(valgtUkeDato.getDate() + 7);
  oppdaterUkeplan();
});

document.getElementById("prevWeek").addEventListener("click", () => {
  valgtUkeDato.setDate(valgtUkeDato.getDate() - 7);
  oppdaterUkeplan();
});

// --- Når dato endres manuelt ---
document.getElementById("dateInput").addEventListener("change", (e) => {
  valgtUkeDato = new Date(e.target.value);
  oppdaterUkeplan();
});

// --- Når siden lastes ---
window.addEventListener("DOMContentLoaded", () => {
  const nå = new Date();

  const dato = nå.toISOString().split("T")[0];
  const tid = `${String(nå.getHours()).padStart(2, "0")}:${String(nå.getMinutes()).padStart(2, "0")}`;

  document.getElementById("dateInput").value = dato;
  document.getElementById("timeInput").value = tid;

  valgtUkeDato = new Date(dato);

  oppdaterUkeplan();
});