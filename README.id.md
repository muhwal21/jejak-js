<div align="center">

# jejak.js

**Lihat apa yang dikerjakan kode JavaScript-mu selagi kamu mengetik.**

Nilai inline, live comments, code coverage, Value Explorer, dan debugger Time Machine. Semuanya jalan di browser: tanpa install, tanpa server.

[![CI](https://github.com/muhwal21/jejak-js/actions/workflows/ci.yml/badge.svg)](https://github.com/muhwal21/jejak-js/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-5a46d6.svg)](LICENSE)

[**Demo langsung**](https://muhwal21.github.io/jejak-js/) · [English](README.md) · [Laporkan bug](https://github.com/muhwal21/jejak-js/issues/new?template=bug_report.md) · [Usulkan fitur](https://github.com/muhwal21/jejak-js/issues/new?template=feature_request.md)

![screenshot jejak.js](docs/screenshot.png)

</div>

## Kenapa

Waktu belajar JavaScript (atau men-debug fungsi yang rumit), kita sering menambah `console.log`, menjalankan ulang, lalu menggulir output. jejak.js menampilkan hasil setiap baris langsung di samping kode, setiap kali kamu mengetik. Eksekusinya juga bisa diputar ulang langkah demi langkah.

## Fitur

### Melihat nilai

- **Nilai inline**: output `console.log`, identifier yang sendirian di satu baris, dan error tampil di ujung baris.
- **Loop**: setiap eksekusi baris ditampilkan berurutan (`0 1 3 6 10`). Arahkan kursor ke nilainya untuk melihat tiap putaran.
- **Live comments**:

  | Komentar | Menampilkan |
  |---|---|
  | `expr //?` atau `expr /*?*/` | nilainya |
  | `expr /*?.*/` | nilai + waktu eksekusi |
  | `expr /*?+*/` | objek lengkap, sampai 8 level |
  | `expr //? $.length` | nilai yang diolah dulu (`$` = hasil ekspresi) |

- **Value Peek**: blok ekspresi apa saja untuk menghitungnya di konteks aslinya, atau arahkan kursor ke variabel.
- **Logpoint**: klik gutter (atau tekan F9) untuk menampilkan nilai satu baris. Blok ekspresi lalu tekan Shift+F9 untuk menyematkannya.

### Memahami alur

- **Gutter coverage**: hijau = jalan, kuning = sebagian jalan (bagian yang tidak jalan diarsir), abu-abu = tidak pernah jalan.
- **Error**: digaris bawahi tepat di kolomnya; jalur pemanggilan yang menuju ke sana ditandai pink.
- **Time Machine**: step into / over / out, mundur, putar otomatis, lompat ke baris kursor, plus timeline berwarna per fungsi. Call stack tetap benar melewati `await`.
- **Urutan eksekusi**: setiap baris yang dieksekusi secara berurutan, lengkap dengan siapa memanggil siapa.
- **Value Explorer**: tree dari semua nilai. Bisa disalin sebagai JSON atau dilihat sebagai graph.

### Editor yang nyaman

- Autocomplete. Setelah titik, method diambil dari tipe nilai aslinya saat kode jalan.
- Snippet dengan isian yang bisa dilompati pakai Tab: `for`, `forof`, `if`, `try`, `arrow`, `class`, `map`, `reduce`, dan lainnya.
- Rapikan kode dengan Prettier, plus rapikan otomatis yang cuma membetulkan spasi. Tidak pernah memindah baris dan tidak jalan setelah kamu menghapus.
- Tutup kurung otomatis, komentar, multi-kursor, pencarian, dan lipat kode.
- Tema terang, gelap, sepia, laut, dan kontras tinggi. UI dalam English dan Bahasa Indonesia.
- Link share: kode dikompres ke dalam URL, tanpa backend.

## Mulai

```bash
git clone https://github.com/muhwal21/jejak-js.git
cd jejak-js
npm install
npm run dev        # buka http://localhost:5173
```

Butuh Node.js 18 atau lebih baru.

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Server pengembangan |
| `npm test` | Menjalankan tes (Vitest) |
| `npm run check` | Cek TypeScript + tes (jalankan sebelum pull request) |
| `npm run build` | Website statis di `dist/` |
| `npm run build:single` | Satu file HTML mandiri di `dist-single/jejak.html` |

## Cara kerjanya

Kode di-parse dengan [acorn](https://github.com/acornjs/acorn), lalu disisipi pemanggilan pelacak kecil di sekitar statement, fungsi, dan ekspresi tanpa mengubah perilaku program. Setelah itu kode dijalankan di Web Worker, jadi infinite loop tidak membekukan halaman. Detailnya ada di [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Deploy versi sendiri

Workflow `.github/workflows/pages.yml` otomatis menerbitkan setiap push ke `main` ke GitHub Pages. Aktifkan di **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Batasan & roadmap

Kode jalan di Web Worker, jadi untuk saat ini belum ada `document`, import paket npm, dan input TypeScript. Daftar ide ada di [README.md](README.md#limitations--roadmap), dan bantuan sangat diterima.

## Kontribusi

Kontribusi sekecil apa pun diterima: laporan bug, contoh kode, terjemahan, fitur. Baca [CONTRIBUTING.md](CONTRIBUTING.md) untuk mulai. Proyek ini mengikuti [Code of Conduct](CODE_OF_CONDUCT.md).

## Terima kasih

Terinspirasi dari [Quokka.js](https://quokkajs.com/). jejak.js adalah proyek independen. Tidak berafiliasi dengan Quokka atau Wallaby.js dan tidak memakai kode mereka.

## Lisensi

[MIT](LICENSE) © Awal ([@muhwal21](https://github.com/muhwal21))
