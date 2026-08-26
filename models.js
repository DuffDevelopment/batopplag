// BåtOpplag – verifisert modelldatabase (båtmodell → lengde).
//
// Lar brukeren skrive båtmodellen sin i stedet for å måle lengden selv.
// Samme datahonesty-prinsipp som resten av siden: kun modeller med
// KILDEFØRT LOA (lengde overalt) fra produsentens egne spesifikasjoner er
// lagt inn. Ingen tall er gjettet. Ukjente modeller faller tilbake på at
// brukeren oppgir lengde manuelt.
//
// Feltforklaring:
//   produsent  – merkenavn
//   modell     – modellnavn (uten merket)
//   loaMeter   – lengde overalt (LOA) i meter, ordrett fra produsentspec
//   kilde      – URL til produsentens spesifikasjonsside
//
// Fot regnes ut i app.js: fot = Math.round(loaMeter × 3.28084).
// Databasen bygges ut modell for modell, på samme måte som områdene.

const BOAT_MODELS = [
  // ============================ Nordkapp ============================
  { produsent: "Nordkapp", modell: "Enduro 605", loaMeter: 6.08,
    kilde: "https://www.nordkapp-boats.no/bater/enduro/enduro-605/" },
  { produsent: "Nordkapp", modell: "Enduro 705", loaMeter: 7.13,
    kilde: "https://www.nordkapp-boats.no/bater/enduro/enduro-705/" },
  { produsent: "Nordkapp", modell: "Enduro 805", loaMeter: 8.05,
    kilde: "https://www.nordkapp-boats.no/bater/enduro/enduro-805/" },
  { produsent: "Nordkapp", modell: "Enduro 830", loaMeter: 8.30,
    kilde: "https://www.nordkapp-boats.no/bater/enduro/enduro-830/" },
  { produsent: "Nordkapp", modell: "Noblesse 660", loaMeter: 6.47,
    kilde: "https://www.nordkapp-boats.no/bater/noblesse/noblesse-660/" },
  { produsent: "Nordkapp", modell: "Noblesse 720", loaMeter: 7.14,
    kilde: "https://www.nordkapp-boats.no/bater/noblesse/noblesse-720/" },
  { produsent: "Nordkapp", modell: "Noblesse 830", loaMeter: 8.30,
    kilde: "https://www.nordkapp-boats.no/bater/noblesse/noblesse-830/" },

  // =========================== Askeladden ===========================
  { produsent: "Askeladden", modell: "C61 Bow Rider", loaMeter: 6.10,
    kilde: "https://www.askeladden.no/en/models/askeladden-c61-bow-rider/" },
  { produsent: "Askeladden", modell: "C65 Cruiser", loaMeter: 6.45,
    kilde: "https://www.askeladden.no/modeller/askeladden-c65-cruiser/" },
  { produsent: "Askeladden", modell: "C70 Cruiser", loaMeter: 6.99,
    kilde: "https://www.askeladden.no/en/models/askeladden-c70-cruiser/" },

  // ============================= Yamarin ============================
  // Kilde: produsentens egne modellsider (yamarin.com).
  { produsent: "Yamarin", modell: "50 BR", loaMeter: 4.86,
    kilde: "https://yamarin.com/en/models/yamarin-50-br" },
  { produsent: "Yamarin", modell: "59 BR", loaMeter: 5.95,
    kilde: "https://yamarin.com/en/models/yamarin-59-br" },
  { produsent: "Yamarin", modell: "60 DC", loaMeter: 6.06,
    kilde: "https://yamarin.com/en/models/yamarin-60-dc" },
  { produsent: "Yamarin", modell: "63 DC", loaMeter: 6.35,
    kilde: "https://yamarin.com/en/models/yamarin-63-dc" },
  { produsent: "Yamarin", modell: "67 DC", loaMeter: 6.76,
    kilde: "https://yamarin.com/en/models/yamarin-67-dc" },

  // ============================ Skibsplast ==========================
  // Skibsplast er ikke lenger aktiv produsent; skibsplast.no omdirigerer til
  // forhandlerarkiv. LOA hentet fra Din-Båt AS / BestMarin Tønsberg (verifisert).
  { produsent: "Skibsplast", modell: "555 HT", loaMeter: 5.55,
    kilde: "https://www.xn--din-bt-mua.com/skibsplast-555-ht" },
  { produsent: "Skibsplast", modell: "605", loaMeter: 6.05,
    kilde: "https://www.xn--din-bt-mua.com/skibsplast-605" },
  { produsent: "Skibsplast", modell: "655", loaMeter: 6.50,
    kilde: "https://www.xn--din-bt-mua.com/skibsplast-655" },
  { produsent: "Skibsplast", modell: "660", loaMeter: 6.50,
    kilde: "https://www.xn--din-bt-mua.com/skibsplast-660" },

  // ============================== Sting =============================
  // Kilde: OceanDrive AS (oceandriveboats.no), norsk Sting-distributør.
  { produsent: "Sting", modell: "Pro 535 Open", loaMeter: 5.43,
    kilde: "https://oceandriveboats.no/bater-pa-hovedsiden/pro-535-open/" },
  { produsent: "Sting", modell: "Pro 600 HT", loaMeter: 6.11,
    kilde: "https://oceandriveboats.no/sting/pro/sting-pro-600-ht/" },
  { produsent: "Sting", modell: "Pro 600 Open", loaMeter: 6.11,
    kilde: "https://oceandriveboats.no/sting/pro/sting-pro-600-open/" },
  { produsent: "Sting", modell: "Pro 725 Open", loaMeter: 7.23,
    kilde: "https://oceandriveboats.no/bater-pa-hovedsiden/sting-pro-725-open/" },
  { produsent: "Sting", modell: "Pro 725 Cabin", loaMeter: 7.23,
    kilde: "https://oceandriveboats.no/sting/pro/sting-pro-725-cabin/" },

  // ============================== Ibiza =============================
  // Kilde: produsentens egne modellsider (ibizaboats.no).
  { produsent: "Ibiza", modell: "690 Touring", loaMeter: 6.85,
    kilde: "https://www.ibizaboats.no/en/690-touring/" },
  { produsent: "Ibiza", modell: "770 Touring", loaMeter: 7.70,
    kilde: "https://www.ibizaboats.no/en/770-touring/" },
  { produsent: "Ibiza", modell: "811 Touring", loaMeter: 8.11,
    kilde: "https://www.ibizaboats.no/en/811-touring/" },
  { produsent: "Ibiza", modell: "911 Touring", loaMeter: 9.11,
    kilde: "https://www.ibizaboats.no/en/models/911-touring/" },

  // ============================== Buster ============================
  // Kilde: produsentens egne modellsider (buster.fi).
  { produsent: "Buster", modell: "M1", loaMeter: 4.86,
    kilde: "https://www.buster.fi/en/models/buster-m1" },
  { produsent: "Buster", modell: "X", loaMeter: 5.35,
    kilde: "https://www.buster.fi/en/models/buster-x" },
  { produsent: "Buster", modell: "XL", loaMeter: 6.05,
    kilde: "https://www.buster.fi/en/models/buster-xl" },
  { produsent: "Buster", modell: "XXL", loaMeter: 6.25,
    kilde: "https://www.buster.fi/en/models/buster-xxl" },
  { produsent: "Buster", modell: "Magnum", loaMeter: 7.20,
    kilde: "https://www.buster.fi/en/models/buster-magnum-2022" },

  // ============================== Uttern ============================
  // D57: offisiell Uttern-forhandler (Borås Marin, verifisert).
  // S57/D62: Utterns egne produktdatablad (uttern.com).
  { produsent: "Uttern", modell: "D57", loaMeter: 5.73,
    kilde: "https://borasmarin.se/butik/batar/utternbatar/uttern-d57/" },
  { produsent: "Uttern", modell: "S57", loaMeter: 5.73,
    kilde: "https://www.uttern.com/media/productsheet/s57%20product%20sheet%20int-en.pdf" },
  { produsent: "Uttern", modell: "D62", loaMeter: 6.33,
    kilde: "https://www.uttern.com/media/387189/products-sheet_uttern_d62_en.pdf" },
];
