# jejak.js

**Playground JavaScript open source yang memperlihatkan apa yang dikerjakan kodemu selagi kamu mengetik.**
Nilai inline, live comments, code coverage, Value Explorer, dan debugger Time Machine — semuanya jalan di browser, tanpa install, tanpa server.

🇬🇧 [Read in English](README.md)

![screenshot jejak.js](docs/screenshot.png)

## Fitur

| | |
|---|---|
| **Eksekusi langsung** | Jalan setiap kali mengetik (atau saat simpan / manual). |
| **Nilai inline** | Output `console.log`, identifier yang sendirian di satu baris, dan error tampil di ujung baris. |
| **Live comments** | `//?` `/*?*/` nilai · `/*?.*/` nilai + waktu · `/*?+*/` kedalaman penuh · `//? $.length` olah nilainya. |
| **Value Peek** | Blok ekspresi *apa saja* untuk menghitungnya di konteks aslinya. Arahkan kursor ke variabel untuk melihat nilainya. |
| **Logpoint & inline breakpoint** | Klik gutter (F9) untuk menampilkan nilai satu baris; blok ekspresi lalu tekan Shift+F9 untuk menyematkannya. |
| **Coverage** | Gutter menandai baris yang jalan / sebagian / tidak jalan; bagian kode yang tidak jalan diarsir. |
| **Error** | Digaris bawahi tepat di kolomnya, jalur pemanggilannya ikut ditandai. |
| **Value Explorer** | Tree semua nilai, bisa disalin sebagai JSON atau dilihat sebagai graph. |
| **Time Machine** | Step into / over / out, mundur, putar otomatis, lompat ke baris kursor, timeline interaktif berwarna per fungsi. Call stack tetap benar melewati `await`. |
| **Urutan eksekusi** | Daftar setiap baris yang dieksekusi secara berurutan, lengkap dengan siapa memanggil siapa. |
| **Link share** | Kode dikompres ke dalam URL — tanpa backend. |
| **English / Bahasa Indonesia** | UI dan contoh dalam dua bahasa. |

## Mulai

```bash
git clone https://github.com/your-username/jejak-js.git
cd jejak-js
npm install
npm run dev      # http://localhost:5173
```

`npm test` menjalankan tes, `npm run build` membuat versi statis di `dist/`.

### Deploy ke GitHub Pages

Workflow `.github/workflows/pages.yml` otomatis deploy setiap push ke `main`.
Di repo GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**. Lalu ganti `REPO_URL` di `src/config.ts`.

## Cara kerjanya

1. **`src/core/instrument.ts`** mem-parse kode dengan acorn lalu menyisipkan pemanggilan pelacak kecil (`__s` sebelum statement, `__e/__x` di fungsi, `__v` di ekspresi, `__log` menggantikan `console.*`, `__as/__ar` di sekitar `await`) plus source map untuk menerjemahkan stack trace.
2. **`src/core/runtime.js`** adalah pelacak yang jalan di Web Worker; nilai diserialisasi jadi tree JSON kecil dan dikirim balik bertahap.
3. **`src/core/session.ts`** mengubah kiriman itu jadi model run (langkah, nilai, log, error). Tidak ada kode DOM, jadi dites di Node.
4. **`src/ui/*`** menggambar editor (CodeMirror 5), panel, dan Time Machine.

## Batasan & roadmap

Lihat daftar di [README.md](README.md#limitations--roadmap) — kontribusi sangat diterima.

## Kontribusi

Lihat [CONTRIBUTING.md](CONTRIBUTING.md).

## Terima kasih

Terinspirasi dari [Quokka.js](https://quokkajs.com/) buatan Wallaby.js. jejak.js adalah proyek independen, tidak berafiliasi, dan tidak memakai kode Quokka.

## Lisensi

[MIT](LICENSE)
