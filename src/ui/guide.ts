import { getLang } from '../i18n';
import { REPO_URL } from '../config';

const dot = (v: string, extra = '') => `<span class="dot" style="background:var(${v});${extra}"></span>`;

export function guideHtml() {
  const id = getLang() === 'id';
  const L = (en: string, idn: string) => (id ? idn : en);
  return `<p>${L('jejak.js runs your JavaScript in a Web Worker every time you type and shows the results right next to the code.', 'jejak.js menjalankan kode JavaScript-mu di Web Worker setiap kali kamu mengetik, lalu menampilkan hasilnya langsung di sebelah kode.')}</p>
<h3>Live comments</h3>
<table>
<tr><td>name</td><td>${L('An identifier or property alone on a line shows its value.', 'Identifier atau properti sendirian di satu baris → nilainya tampil.')}</td></tr>
<tr><td>expr //?</td><td>${L('Show the value of the expression left of the comment.', 'Tampilkan nilai ekspresi di kiri komentar.')}</td></tr>
<tr><td>expr /*?*/</td><td>${L('Same, usable mid-line', 'Sama, bisa di tengah baris')}: <code>f(a /*?*/, b)</code>.</td></tr>
<tr><td>expr /*?.*/ · //?.</td><td>${L('Value + execution time (tracker overhead excluded).', 'Nilai + waktu eksekusi (overhead pelacak tidak dihitung).')}</td></tr>
<tr><td>expr /*?+*/</td><td>${L('Record the object fully (8 levels deep).', 'Rekam objek sampai kedalaman penuh (8 level).')}</td></tr>
<tr><td>expr //? $.length</td><td>${L('Transform the shown value', 'Ubah tampilan nilai')}: <code>$</code> = ${L('the result', 'hasil ekspresi')}.</td></tr>
</table>
<h3>${L('Without changing code', 'Tanpa mengubah kode')}</h3>
<table>
<tr><td>${L('select', 'blok')}</td><td>${L('Select any expression to evaluate it in its real context (Value Peek).', 'Blok ekspresi apa saja untuk menghitungnya di konteks aslinya (Value Peek).')}</td></tr>
<tr><td>Shift+F9</td><td>${L('Pin the selected expression: an inline breakpoint that logs it every run.', 'Sematkan ekspresi yang diblok: inline breakpoint yang menampilkan nilainya setiap run.')}</td></tr>
<tr><td>F9 · ${L('gutter', 'gutter')}</td><td>${L('Logpoint: show the values of the whole line.', 'Logpoint: tampilkan nilai seluruh baris.')}</td></tr>
</table>
<h3>${L('Coverage gutter', 'Gutter coverage')}</h3>
<table>
<tr><td>${dot('--cov-ok')}${L('green', 'hijau')}</td><td>${L('Line ran.', 'Baris tereksekusi penuh.')}</td></tr>
<tr><td>${dot('--cov-part')}${L('yellow', 'kuning')}</td><td>${L('Partially ran — the part that did not run is shaded.', 'Sebagian tereksekusi — bagian yang tidak jalan diarsir.')}</td></tr>
<tr><td>${dot('--cov-none')}${L('grey', 'abu-abu')}</td><td>${L('Never ran.', 'Tidak tereksekusi sama sekali.')}</td></tr>
<tr><td>${dot('--cov-err', 'border-radius:50%')}${L('red', 'merah')}</td><td>${L('Error source (exact column underlined).', 'Sumber error (kolom tepatnya digaris bawahi).')}</td></tr>
<tr><td>${dot('--cov-path')}pink</td><td>${L('Call path that led to the error.', 'Jalur pemanggilan yang menuju error.')}</td></tr>
</table>
<h3>Time Machine</h3>
<p>${L('Click <b>Start</b> under the editor. Each step highlights the line about to run and shows variables at that moment. The timeline is colored per function; dots are console.log, red marks errors, small ticks are other executions of the same line. The <b>Order</b> tab lists the whole execution flow. Stacks stay correct across <code>await</code>.', 'Klik <b>Mulai</b> di bawah editor. Setiap langkah menyorot baris yang akan dijalankan dan menampilkan variabel saat itu. Timeline berwarna per fungsi; titik = console.log, merah = error, garis kecil = eksekusi lain dari baris yang sama. Tab <b>Urutan</b> menampilkan seluruh alur eksekusi. Call stack tetap benar melewati <code>await</code>.')}</p>
<h3>${L('Shortcuts', 'Pintasan')}</h3>
<table>
<tr><td><kbd>Ctrl/⌘ Enter</kbd></td><td>${L('Run', 'Jalankan')}</td></tr>
<tr><td><kbd>Ctrl/⌘ S</kbd></td><td>${L('Run (On save mode)', 'Jalankan (mode Saat simpan)')}</td></tr>
<tr><td><kbd>F9</kbd> · <kbd>Shift F9</kbd></td><td>${L('Toggle logpoint · pin selection', 'Logpoint · sematkan seleksi')}</td></tr>
<tr><td><kbd>Alt →</kbd> <kbd>Alt ←</kbd></td><td>Step into / ${L('back', 'mundur')}</td></tr>
<tr><td><kbd>Alt ↓</kbd> <kbd>Alt ↑</kbd></td><td>Step over / step out</td></tr>
<tr><td><kbd>Alt J</kbd></td><td>${L('Jump to the next execution of the cursor line', 'Lompat ke eksekusi berikutnya di baris kursor')}</td></tr>
</table>
<h3>${L('Limits', 'Batasan')}</h3>
<p>${L('Code runs in a browser Web Worker: no <code>document</code>, npm imports or file system. Top-level <code>await</code> works. The Time Machine records up to 5000 steps; variables are recorded 2 levels deep.', 'Kode jalan di Web Worker browser: tidak ada <code>document</code>, import paket npm, atau file sistem. Top-level <code>await</code> didukung. Time Machine merekam maksimal 5000 langkah; variabel direkam sampai 2 level.')}</p>
<p>${L('Open source (MIT).', 'Open source (MIT).')} <a href="${REPO_URL}" target="_blank" rel="noopener">${REPO_URL.replace('https://', '')}</a></p>`;
}
