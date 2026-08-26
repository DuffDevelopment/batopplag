# BåtOpplag ⚓

Demo av en nettside der brukere kan finne vinteropplag for båten sin i sitt område.

Brukeren fyller inn:
- **Postnummer/sted** – hvor man vil ha opplag
- **Båtlengde** i fot
- **Motorplassering** – innenbords eller utenbords
- **Motortype** – 2- eller 4-takts
- **Ønsker** (valgfritt) – innendørs/utendørs, varmt/kaldt, og fuktkontroll (anbefalt for trebåt)

Siden filtrerer og sorterer opplagssteder etter nærhet, filtrerer på ønskene som er huket av,
viser et **prisestimat** per sted (basert på fot), og gir **anbefalte tjenester** ut fra motortypen.

## Kjøre lokalt

Dette er en ren statisk nettside – ingen installasjon eller byggesteg.

**Alternativ 1 – åpne direkte:**
Dobbeltklikk på `index.html`, eller åpne den i nettleseren.

**Alternativ 2 – lokal server** (anbefalt, unngår evt. nettleserbegrensninger):

```bash
python -m http.server 8000
```

Åpne deretter http://localhost:8000 i nettleseren.

## Filer

| Fil          | Ansvar                                                            |
| ------------ | ----------------------------------------------------------------- |
| `index.html` | Forsiden: skjema + resultatområde                                 |
| `styles.css` | Styling (maritimt, responsivt design)                             |
| `app.js`     | Skjemalogikk, validering, filtrering, prisestimat, tjenesteforslag |
| `data.js`    | Eksempeldata: opplagssteder rundt om i Norge                      |

## Data

Opplagsstedene i `data.js` er **ekte tilbydere**, lagt inn område for område med
kildehenvisning (`kilde`-felt) per oppføring. Kun opplysninger som faktisk er publisert
av tilbyderen legges inn – felter som ikke er oppgitt står som `null` («ikke oppgitt») og
gjettes ikke.

Dekker foreløpig **Lillesand, Grimstad, Arendal, Kristiansand og Oslo** (24 tilbydere).

Nærhet regnes grovt ut fra tallverdien i postnummeret – ikke geografisk korrekt, men gir
en konsistent sortering. Dette bør erstattes med ekte koordinater ved videre utvikling.

### Pris og veiledende maks
Priser legges kun inn når tilbyderen publiserer dem. `prisModell` skiller **`perFot`**
(kr per fot) fra **`total`** (fast totalpris per lengdekategori). Steder uten publisert
pris får en **veiledende maks­pris**, beregnet fra faktiske priser hos lignende opplag
(samme plassering/temperatur) – tydelig merket som estimat, ikke tilbyderens egen pris.

### Legge til et nytt område
Legg til nye objekter i `STORAGE_SITES` i `data.js` med `omrade` satt til området, og fyll
kun inn felter du kan verifisere. Sett resten til `null`.

## Videre utvikling

- Ekte database over opplagssteder + backend-API
- Geografisk nærhet basert på faktiske koordinater
- Innlogging for tilbydere som legger inn ledig kapasitet
- Booking/reservasjon av plass
