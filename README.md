# MicCheck

Arhivă personală de povești înregistrate, pentru iPhone (PWA din Safari).

- Importă înregistrările de apeluri făcute cu aplicația Telefon (iOS 18.1+).
- Sau înregistrează direct din aplicație, față în față.
- Titlu, povestitor, dată, note, căutare, viteză de redare.
- Totul rămâne pe telefon (IndexedDB). Nimic nu se trimite pe internet.

## Cum adaugi un apel

1. În timpul apelului, apasă butonul de înregistrare din aplicația Telefon.
2. După apel, înregistrarea e în **Notițe → Înregistrări apeluri**.
3. Partajează → **Salvează în Fișiere**.
4. În MicCheck: **＋ Importă**.

## Instalare pe iPhone

Deschide adresa de pe Vercel în Safari → butonul Partajează → **Adaugă pe ecranul principal**.

## Publicare pe Vercel

Site static, fără build. Pe [vercel.com/new](https://vercel.com/new) importă repo-ul `miccheck`, lasă
Framework Preset pe **Other** și apasă **Deploy**.

## Local

```bash
npx serve .
```
