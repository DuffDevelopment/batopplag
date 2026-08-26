// BåtOpplag – skjemalogikk, filtrering, prisestimat og tjenesteanbefaling.
// Krever at data.js er lastet før denne (STORAGE_SITES er global).

// Lesbare navn for tjenestenøklene brukt i data.js.
const SERVICE_LABELS = {
  konservering_motor: "Vinterkonservering av motor",
  frostsikring_kjol: "Frostsikring av kjølesystem",
  spyling: "Spyling av skrog",
  bunnstoff: "Bunnstoffbehandling",
  kranloft: "Kranløft opp/ned",
  vaskeplass: "Høytrykksvask",
  batterilading: "Batterivedlikehold/lading",
};

// Lesbare navn for plassering og temperatur.
const PLASSERING_LABELS = { innendors: "Innendørs", utendors: "Utendørs" };
const TEMPERATUR_LABELS = { varmt: "Varmt", kaldt: "Kaldt" };

const nf = new Intl.NumberFormat("nb-NO");
const mf = new Intl.NumberFormat("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---- Båtmodell → lengde ----------------------------------------------
// Krever at models.js er lastet (BOAT_MODELS er global).

const M_TIL_FOT = 3.28084;

function fotFraMeter(m) {
  return Math.round(m * M_TIL_FOT);
}

function fulltModellNavn(m) {
  return `${m.produsent} ${m.modell}`;
}

// Deler modelltekst i tokens (småbokstaver, kun bokstaver/tall).
function modellTokens(tekst) {
  return tekst
    .toLowerCase()
    .replace(/[^0-9a-zæøå]+/gi, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Finner en modell fra fritekst. Rekkefølge-uavhengig token-matching:
 *   1) Full match: alle tokens i "produsent modell" finnes i inputen
 *      (håndterer f.eks. "Nordkapp 605 Enduro" like godt som kanonisk navn).
 *   2) Fallback: alle tokens UTEN merket finnes, og gir nøyaktig ett treff
 *      (lar brukeren droppe merkenavnet, f.eks. bare "Enduro 605").
 * Returnerer modell-objektet eller null.
 */
function finnModell(tekst) {
  const input = new Set(modellTokens(tekst));
  if (!input.size) return null;

  const subset = (tokens) => tokens.length > 0 && tokens.every((t) => input.has(t));

  const fulle = BOAT_MODELS.filter((m) => subset(modellTokens(fulltModellNavn(m))));
  if (fulle.length === 1) return fulle[0];
  if (fulle.length > 1) {
    // Flere treff – velg mest spesifikke (flest tokens).
    fulle.sort(
      (a, b) => modellTokens(fulltModellNavn(b)).length - modellTokens(fulltModellNavn(a)).length
    );
    return fulle[0];
  }

  const utenMerke = BOAT_MODELS.filter((m) => subset(modellTokens(m.modell)));
  return utenMerke.length === 1 ? utenMerke[0] : null;
}

/**
 * Anbefaler tjenester ut fra motorplassering og takt.
 * Returnerer en liste av tjenestenøkler (matcher SERVICE_LABELS/data.js).
 */
function anbefalteTjenester(motorplassering, takt) {
  const anbefalt = new Set(["konservering_motor"]);

  if (motorplassering === "innenbords") {
    // Innenbords har typisk ferskvann-/kjølesystem som må frostsikres.
    anbefalt.add("frostsikring_kjol");
    anbefalt.add("batterilading");
  } else {
    // Utenbords bør spyles og vippes; ofte lettere å ta av.
    anbefalt.add("spyling");
  }

  if (takt === "2") {
    // 2-takts (ofte eldre utenbords) – ekstra fokus på konservering/spyling.
    anbefalt.add("spyling");
  }

  return [...anbefalt];
}

/**
 * Grov nærhet mellom to postnummer basert på tallverdi.
 * Ikke geografisk korrekt, men gir en konsistent sortering for demoen.
 */
function postnummerAvstand(a, b) {
  const na = parseInt(a, 10);
  const nb = parseInt(b, 10);
  // Ukjent postnummer sorteres bakerst.
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return Number.POSITIVE_INFINITY;
  return Math.abs(na - nb);
}

/**
 * Beregner prisestimat for en båtlengde.
 * Returnerer { perFot, total, eksMva } eller null hvis pris ikke er oppgitt.
 * prisBrackets (lengdebasert per-fot-pris) overstyrer flat prisPerFot.
 */
function beregnPris(site, lengde) {
  if (Array.isArray(site.prisBrackets)) {
    const b = site.prisBrackets.find((x) => lengde <= x.maks);
    if (!b) return null; // over største intervall → "pris på forespørsel"
    if (site.prisModell === "total") {
      // kr er TOTAL sesongpris for båter opp til `maks` fot.
      return { perFot: Math.round(b.kr / lengde), total: b.kr, eksMva: !!site.prisEksMva };
    }
    // Standard: kr er pris PER FOT for intervallet.
    return { perFot: b.kr, total: b.kr * lengde, eksMva: !!site.prisEksMva };
  }
  if (site.prisPerFot != null) {
    return { perFot: site.prisPerFot, total: site.prisPerFot * lengde, eksMva: !!site.prisEksMva };
  }
  return null;
}

/**
 * Samler per-fot-priser fra alle steder med KJENT pris, for en gitt lengde.
 * Brukes som markedsgrunnlag for veiledende maks­pris på steder uten pris.
 * Returnerer [{ plassering, temperatur, perFot }].
 */
function prisSamples(lengde) {
  const ut = [];
  for (const s of STORAGE_SITES) {
    const p = beregnPris(s, lengde);
    if (p) ut.push({ plassering: s.plassering, temperatur: s.temperatur, perFot: p.perFot });
  }
  return ut;
}

/**
 * Veiledende maks­pris for et sted UTEN publisert pris, basert på lignende
 * opplag med kjent pris. Prøver mest spesifikke kategori først:
 *   samme plassering + samme temperatur → samme plassering → (grovt) alle.
 * Returnerer { perFotMaks, perFotMin, totalMaks, antall, grov } eller null.
 */
function veiledendePris(site, lengde, samples) {
  if (!samples.length) return null;

  let kandidater = null;
  let grov = false;

  if (site.plassering != null) {
    const sammePlass = samples.filter((x) => x.plassering === site.plassering);
    if (sammePlass.length) {
      kandidater = sammePlass;
      if (site.temperatur != null) {
        const sammeTemp = sammePlass.filter((x) => x.temperatur === site.temperatur);
        if (sammeTemp.length) kandidater = sammeTemp;
      }
    } else {
      // Ingen prisdata for denne plasseringen ennå – vi anslår ikke på tvers.
      return null;
    }
  } else {
    // Ukjent plassering: kun et svært grovt anslag basert på alt vi har.
    kandidater = samples;
    grov = true;
  }

  const perFots = kandidater.map((x) => x.perFot);
  const perFotMaks = Math.max(...perFots);
  const perFotMin = Math.min(...perFots);
  const perFotSnitt = Math.round(perFots.reduce((a, b) => a + b, 0) / perFots.length);
  return {
    perFotSnitt,
    perFotMaks,
    perFotMin,
    totalSnitt: perFotSnitt * lengde,
    antall: kandidater.length,
    grov,
  };
}

/**
 * Filtrerer og sorterer opplagssteder for et gitt søk.
 *
 * Håndtering av `null` ("ukjent"):
 *   - maksLengde null  → tas med (kan ikke utelukkes på lengde)
 *   - plassering/temperatur: tom avhukingsliste = ingen filtrering.
 *     Er filteret aktivt, kreves en KJENT verdi som matcher – ukjent utelukkes.
 *   - fuktkontroll krevd → kun steder med bekreftet fuktkontroll (true).
 *
 * Returnerer { treff, skjultUkjent } der skjultUkjent er antall steder som
 * ellers ville passet, men ble utelukket kun fordi et aktivt kriterium er ukjent.
 */
// Grupperer områder i større regioner. Et søk viser kun tilbydere i
// regionen som ligger nærmest – slik at f.eks. et Oslo-søk aldri drar med
// Sørlandet. Ukjente områder blir sin egen region (trygt standardvalg).
const OMRADE_REGION = {
  Lillesand: "Sørlandet",
  Grimstad: "Sørlandet",
  Arendal: "Sørlandet",
  Kristiansand: "Sørlandet",
  Oslo: "Oslofjorden",
  Bergen: "Vestlandet",
};

function regionFor(omrade) {
  return OMRADE_REGION[omrade] || omrade;
}

// Postnummer-avstand som regnes som "langt unna nærmeste dekning".
const LANGT_UNNA = 1500;

function finnOpplag(sok) {
  // 1. Finn nærmeste region ut fra postnummer (uavhengig av øvrige kriterier).
  let naermest = null;
  for (const s of STORAGE_SITES) {
    const d = postnummerAvstand(s.postnummer, sok.postnummer);
    if (naermest === null || d < naermest.avstand) {
      naermest = { avstand: d, region: regionFor(s.omrade) };
    }
  }
  const region = naermest ? naermest.region : null;
  const langtUnna = naermest ? naermest.avstand > LANGT_UNNA : false;

  // 2. Bygg treff kun blant tilbydere i den nærmeste regionen.
  const passerLengde = STORAGE_SITES.filter(
    (s) => regionFor(s.omrade) === region && (s.maksLengde == null || s.maksLengde >= sok.lengde)
  );

  const treff = [];
  let skjultUkjent = 0;

  for (const s of passerLengde) {
    const plassAktiv = sok.plassering.length > 0;
    const tempAktiv = sok.temperatur.length > 0;
    const fuktAktiv = !!sok.fuktkontroll;

    const plassOk = !plassAktiv || (s.plassering != null && sok.plassering.includes(s.plassering));
    const tempOk = !tempAktiv || (s.temperatur != null && sok.temperatur.includes(s.temperatur));
    const fuktOk = !fuktAktiv || s.fuktkontroll === true;

    if (plassOk && tempOk && fuktOk) {
      treff.push({
        site: s,
        avstand: postnummerAvstand(s.postnummer, sok.postnummer),
        pris: beregnPris(s, sok.lengde),
      });
      continue;
    }

    // Hard uenighet = kjent verdi som ikke matcher (da er stedet reelt uaktuelt).
    const hardPlass = plassAktiv && s.plassering != null && !sok.plassering.includes(s.plassering);
    const hardTemp = tempAktiv && s.temperatur != null && !sok.temperatur.includes(s.temperatur);
    const hardFukt = fuktAktiv && s.fuktkontroll === false;

    // Ukjent-blokkering = aktivt kriterium der stedet mangler opplysning.
    const ukjentBlokk =
      (plassAktiv && s.plassering == null) ||
      (tempAktiv && s.temperatur == null) ||
      (fuktAktiv && s.fuktkontroll == null);

    if (ukjentBlokk && !(hardPlass || hardTemp || hardFukt)) skjultUkjent++;
  }

  treff.sort((a, b) => a.avstand - b.avstand);
  return { treff, skjultUkjent, region, langtUnna };
}

// ---- Validering -------------------------------------------------------

function visFeil(id, melding) {
  const el = document.getElementById("err-" + id);
  if (el) {
    el.textContent = melding;
    el.hidden = false;
  }
  const input = document.getElementById(id);
  if (input) input.classList.add("invalid");
}

function nullstillFeil() {
  document.querySelectorAll(".error").forEach((e) => (e.hidden = true));
  document.querySelectorAll(".invalid").forEach((e) => e.classList.remove("invalid"));
}

function lesSkjema() {
  const postnummer = document.getElementById("postnummer").value.trim();
  const lengde = document.getElementById("lengde").value.trim();
  const motorplassering = document.querySelector('input[name="motorplassering"]:checked');
  const takt = document.querySelector('input[name="takt"]:checked');
  const avhuket = (name) =>
    [...document.querySelectorAll('input[name="' + name + '"]:checked')].map((el) => el.value);

  return {
    postnummer,
    lengde,
    modell: document.getElementById("modell").value.trim(),
    motorplassering: motorplassering ? motorplassering.value : null,
    takt: takt ? takt.value : null,
    plassering: avhuket("plassering"),
    temperatur: avhuket("temperatur"),
    fuktkontroll: document.querySelector('input[name="fuktkontroll"]').checked,
  };
}

/**
 * Validerer skjemaet. `modellInfo` er en gjenkjent modell (eller null).
 * Lengde kreves kun når den ikke allerede er avledet fra en modell.
 */
function valider(data, modellInfo) {
  let ok = true;

  if (!/^\d{4}$/.test(data.postnummer)) {
    visFeil("postnummer", "Skriv inn et gyldig 4-sifret postnummer.");
    ok = false;
  }

  const lengdeTall = Number(data.lengde);
  const gyldigLengde = data.lengde && Number.isFinite(lengdeTall) && lengdeTall > 0;

  if (modellInfo) {
    // Lengde kommer fra modellen – ingen krav til lengdefeltet.
  } else if (data.modell) {
    // Modell skrevet, men ikke gjenkjent. Godta hvis lengde er oppgitt manuelt.
    if (!gyldigLengde) {
      visFeil(
        "modell",
        "Fant ikke modellen. Velg fra listen, sjekk stavemåte, eller oppgi lengde i fot."
      );
      ok = false;
    } else if (lengdeTall > 120) {
      visFeil("lengde", "Lengden virker urimelig stor. Sjekk verdien.");
      ok = false;
    }
  } else {
    // Ingen modell – lengde er påkrevd.
    if (!gyldigLengde) {
      visFeil("lengde", "Skriv inn en gyldig båtlengde i fot, eller velg en modell.");
      ok = false;
    } else if (lengdeTall > 120) {
      visFeil("lengde", "Lengden virker urimelig stor. Sjekk verdien.");
      ok = false;
    }
  }

  if (!data.motorplassering) {
    visFeil("motorplassering", "Velg innenbords eller utenbords.");
    ok = false;
  }

  if (!data.takt) {
    visFeil("takt", "Velg 2- eller 4-takts motor.");
    ok = false;
  }

  return ok;
}

// ---- Rendering --------------------------------------------------------

function tjenesteChips(site, anbefalt) {
  const anbefaltSet = new Set(anbefalt);
  return site.tjenester
    .map((key) => {
      const label = SERVICE_LABELS[key] || key;
      const match = anbefaltSet.has(key) ? " match" : "";
      return `<span class="chip${match}">${label}</span>`;
    })
    .join("");
}

// Verdi eller «ikke oppgitt»-markør for ukjente felter.
const UKJENT = `<span class="ukjent">ikke oppgitt</span>`;

function badges(site) {
  const b = [];
  if (site.plassering) {
    b.push(`<span class="badge ${site.plassering}">${PLASSERING_LABELS[site.plassering]}</span>`);
  }
  if (site.temperatur) {
    b.push(`<span class="badge temp-${site.temperatur}">${TEMPERATUR_LABELS[site.temperatur]}</span>`);
  }
  if (site.fuktkontroll === true) b.push(`<span class="badge fukt">Fuktkontroll</span>`);
  return b.join("");
}

function prisBlokk(pris, lengde, veiledende) {
  // Tilbyderens egen, publiserte pris.
  if (pris) {
    const mva = pris.eksMva ? " eks. mva" : "";
    return `
      <div class="price">
        <span class="amount">${nf.format(pris.total)} kr${mva ? "*" : ""}</span>
        <span class="per">est. for sesongen (${nf.format(pris.perFot)} kr/fot × ${lengde} fot${mva})</span>
      </div>`;
  }

  // Ingen publisert pris – vis veiledende snitt basert på lignende opplag.
  if (veiledende) {
    const range =
      veiledende.perFotMin !== veiledende.perFotMaks
        ? ` (${nf.format(veiledende.perFotMin)}–${nf.format(veiledende.perFotMaks)} kr/fot i lignende opplag)`
        : "";
    const grovTekst = veiledende.grov ? " Svært grovt anslag (ukjent innendørs/utendørs)." : "";
    return `
      <div class="price veiledende">
        <span class="label">Veiledende snitt</span>
        <span class="amount">~${nf.format(veiledende.totalSnitt)} kr</span>
        <span class="per">~${nf.format(veiledende.perFotSnitt)} kr/fot × ${lengde} fot${range}</span>
        <span class="disclaimer">Snitt av ${veiledende.antall} opplag med kjent pris – ikke tilbyderens egen pris.${grovTekst}</span>
      </div>`;
  }

  return `<div class="price"><span class="kontakt">Pris ikke oppgitt – kontakt tilbyder</span></div>`;
}

function kontaktBlokk(site) {
  const deler = [];
  if (site.adresse) deler.push(site.adresse);
  if (site.telefon) deler.push(`Tlf: ${site.telefon}`);
  const linjer = [];
  if (deler.length) linjer.push(`<span>${deler.join(" · ")}</span>`);
  const lenker = [];
  if (site.nettside) {
    lenker.push(`<a href="${site.nettside}" target="_blank" rel="noopener">Nettside ↗</a>`);
  }
  if (site.kilde) {
    lenker.push(`<a href="${site.kilde}" target="_blank" rel="noopener" class="kilde">Kilde ↗</a>`);
  }
  if (lenker.length) linjer.push(`<span class="lenker">${lenker.join("")}</span>`);
  return linjer.length ? `<div class="kontakt-rad">${linjer.join("")}</div>` : "";
}

function renderResultat(sok) {
  const results = document.getElementById("results");
  const anbefalt = anbefalteTjenester(sok.motorplassering, sok.takt);
  const { treff, skjultUkjent, region, langtUnna } = finnOpplag(sok);

  const langtUnnaNote = langtUnna
    ? `<p class="note-ukjent">Vi har foreløpig ingen opplag i ditt nærområde. `
      + `Nærmeste region vi dekker er <strong>${region}</strong> – vist under.</p>`
    : "";

  const anbefaltHtml = `
    <div class="reco">
      <h3>Anbefalte tjenester for din motor</h3>
      <p>Basert på ${sok.motorplassering} ${sok.takt}-takts motor:</p>
      <ul>
        ${anbefalt.map((k) => `<li>${SERVICE_LABELS[k]}</li>`).join("")}
      </ul>
    </div>`;

  const modellNote = sok.modellInfo
    ? `<p class="modell-funn">Lengde beregnet fra <strong>${fulltModellNavn(sok.modellInfo)}</strong>: `
      + `${sok.lengde} fot (${mf.format(sok.modellInfo.loaMeter)} m LOA · `
      + `<a href="${sok.modellInfo.kilde}" target="_blank" rel="noopener">kilde ↗</a>).</p>`
    : "";

  const ukjentNote = skjultUkjent
    ? `<p class="note-ukjent">${skjultUkjent} tilbyder${skjultUkjent === 1 ? "" : "e"} i området er skjult fordi de ikke oppgir ett eller flere av kriteriene du huket av.</p>`
    : "";

  if (treff.length === 0) {
    results.innerHTML =
      modellNote +
      langtUnnaNote +
      anbefaltHtml +
      `<div class="empty">
        <strong>Ingen opplagssteder passer akkurat nå</strong>
        Vi fant ingen plasser i ${region || "ditt område"} for en båt på ${sok.lengde} fot med ønskene dine.
        Prøv gjerne en mindre lengde, færre avhukinger eller et annet område.
      </div>` +
      ukjentNote;
    results.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const samples = prisSamples(sok.lengde);

  const kort = treff
    .map(({ site, pris }) => {
      const veiledende = pris ? null : veiledendePris(site, sok.lengde, samples);
      return `
      <article class="site">
        <div class="site-top">
          <div>
            <h3>${site.navn}</h3>
            <p class="place">${site.sted}${site.postnummer ? " · " + site.postnummer : ""}</p>
          </div>
          <div class="badges">${badges(site)}</div>
        </div>

        ${prisBlokk(pris, sok.lengde, veiledende)}

        <div class="meta">
          <span>Maks lengde: <strong>${site.maksLengde != null ? site.maksLengde + " fot" : UKJENT}</strong></span>
          <span>Ledige plasser: <strong>${site.ledigePlasser != null ? site.ledigePlasser : UKJENT}</strong></span>
        </div>

        ${site.merknad ? `<p class="merknad">ℹ️ ${site.merknad}</p>` : ""}
        ${site.tjenester.length ? `<div class="chips">${tjenesteChips(site, anbefalt)}</div>` : ""}
        ${kontaktBlokk(site)}
      </article>`;
    })
    .join("");

  const eksMvaNote = treff.some(({ pris }) => pris && pris.eksMva)
    ? `<p class="note-mva">* Prisen er oppgitt eks. mva hos tilbyderen.</p>`
    : "";

  results.innerHTML =
    `<div class="results-head">
       <h2>${treff.length} opplagsplass${treff.length === 1 ? "" : "er"} i ${region}</h2>
       <p>Sortert etter nærhet til postnummer ${sok.postnummer}. Anbefalte tjenester er uthevet med ✓.</p>
     </div>` +
    modellNote +
    langtUnnaNote +
    ukjentNote +
    anbefaltHtml +
    kort +
    eksMvaNote;

  results.querySelector(".results-head").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---- Oppstart ---------------------------------------------------------

// Live-tilbakemelding under feltet når en modell er gjenkjent.
function oppdaterModellFunn() {
  const felt = document.getElementById("modell");
  const boks = document.getElementById("modell-funn");
  const lengdeInput = document.getElementById("lengde");
  const tekst = felt.value.trim();

  if (!tekst) {
    boks.hidden = true;
    return;
  }

  const funn = finnModell(tekst);
  if (funn) {
    const fot = fotFraMeter(funn.loaMeter);
    boks.innerHTML =
      `<strong>${fulltModellNavn(funn)}</strong> ≈ ${fot} fot ` +
      `(${mf.format(funn.loaMeter)} m LOA · <a href="${funn.kilde}" target="_blank" rel="noopener">kilde ↗</a>)`;
    boks.hidden = false;
    lengdeInput.value = fot; // vis avledet lengde
    document.getElementById("err-modell").hidden = true;
    felt.classList.remove("invalid");
  } else {
    boks.hidden = true;
  }
}

/**
 * Forslag til nedtrekkslisten. Mer lempelig enn finnModell: hvert skrevne
 * token må være en forstavelse i modellnavnet (gir god inkrementell filtrering).
 * Tom tekst → hele listen (vises ved fokus).
 */
function modellForslag(tekst, maks = 8) {
  const q = modellTokens(tekst);
  let treff;
  if (!q.length) {
    treff = BOAT_MODELS.slice();
  } else {
    treff = BOAT_MODELS.filter((m) => {
      const navnTok = modellTokens(fulltModellNavn(m));
      return q.every((qt) => navnTok.some((nt) => nt.startsWith(qt)));
    });
  }
  const lav = tekst.toLowerCase().trim();
  treff.sort((a, b) => {
    const as = fulltModellNavn(a).toLowerCase().startsWith(lav) ? 0 : 1;
    const bs = fulltModellNavn(b).toLowerCase().startsWith(lav) ? 0 : 1;
    if (as !== bs) return as - bs;
    return fulltModellNavn(a).localeCompare(fulltModellNavn(b), "nb");
  });
  return treff.slice(0, maks);
}

// Styrt autocomplete-combobox for båtmodell.
(function initModellCombo() {
  const felt = document.getElementById("modell");
  const liste = document.getElementById("modell-dropdown");
  if (!felt || !liste) return;

  let forslag = [];
  let aktiv = -1;

  function lukk() {
    liste.hidden = true;
    liste.innerHTML = "";
    aktiv = -1;
    felt.setAttribute("aria-expanded", "false");
  }

  function velg(m) {
    felt.value = fulltModellNavn(m);
    lukk();
    oppdaterModellFunn();
  }

  function tegn() {
    if (!forslag.length) {
      liste.innerHTML = `<li class="tom">Ingen kjente modeller – oppgi lengde i fot i stedet.</li>`;
      liste.hidden = false;
      felt.setAttribute("aria-expanded", "true");
      return;
    }
    liste.innerHTML = forslag
      .map((m, i) => {
        const fot = fotFraMeter(m.loaMeter);
        return (
          `<li role="option" data-i="${i}" class="${i === aktiv ? "active" : ""}">` +
          `<span class="navn">${fulltModellNavn(m)}</span>` +
          `<span class="fot">≈ ${fot} fot</span></li>`
        );
      })
      .join("");
    liste.hidden = false;
    felt.setAttribute("aria-expanded", "true");
  }

  function oppdater() {
    forslag = modellForslag(felt.value);
    aktiv = -1;
    tegn();
  }

  felt.addEventListener("input", () => {
    oppdater();
    oppdaterModellFunn();
  });
  felt.addEventListener("focus", oppdater);
  felt.addEventListener("keydown", (e) => {
    if (liste.hidden && e.key === "ArrowDown") {
      oppdater();
      return;
    }
    if (liste.hidden) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      aktiv = Math.min(aktiv + 1, forslag.length - 1);
      tegn();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      aktiv = Math.max(aktiv - 1, 0);
      tegn();
    } else if (e.key === "Enter") {
      if (aktiv >= 0 && aktiv < forslag.length) {
        e.preventDefault();
        velg(forslag[aktiv]);
      }
    } else if (e.key === "Escape") {
      lukk();
    }
  });
  // mousedown (ikke click) slik at valget skjer før blur lukker listen.
  liste.addEventListener("mousedown", (e) => {
    const li = e.target.closest("li[data-i]");
    if (!li) return;
    e.preventDefault();
    velg(forslag[Number(li.dataset.i)]);
  });
  felt.addEventListener("blur", () => setTimeout(lukk, 120));
})();

document.getElementById("searchForm").addEventListener("submit", (e) => {
  e.preventDefault();
  nullstillFeil();

  const data = lesSkjema();

  // Løs opp lengde: en gjenkjent modell vinner, ellers det manuelle feltet.
  const modellInfo = data.modell ? finnModell(data.modell) : null;
  if (!valider(data, modellInfo)) return;

  const lengde = modellInfo ? fotFraMeter(modellInfo.loaMeter) : Number(data.lengde);

  renderResultat({
    postnummer: data.postnummer,
    lengde,
    modellInfo,
    motorplassering: data.motorplassering,
    takt: data.takt,
    plassering: data.plassering,
    temperatur: data.temperatur,
    fuktkontroll: data.fuktkontroll,
  });
});
