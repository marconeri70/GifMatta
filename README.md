# GifFacile

Webapp/PWA per creare GIF divertenti da più foto o da un breve video.

## Funzioni

- selezione di più foto con riordino e rimozione;
- conversione di un video fino a 6 secondi;
- testo superiore e inferiore in stile meme;
- emoji, formati diversi, risoluzione e adattamento;
- effetto boomerang;
- download e condivisione della GIF;
- cronologia locale delle ultime GIF;
- installazione come PWA.

## Pubblicazione

Caricare tutti i file mantenendo le cartelle. È adatta a GitHub Pages, Cloudflare Pages e qualsiasi hosting statico.

La prima creazione richiede una connessione per caricare la libreria `gifenc` da UNPKG. Dopo il primo utilizzo il service worker prova a conservarla nella cache del browser.

## Avvio locale

Per provare l'app da computer, aprire la cartella con un piccolo server HTTP, ad esempio:

```bash
python -m http.server 8000
```

Poi aprire `http://localhost:8000`.
