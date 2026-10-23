import type { Lang } from './i18n';

interface Example { name: Record<Lang, string>; code: Record<Lang, string> }

/** Build bilingual code: `«en|id»` markers pick the text for each language. */
const bi = (src: string): Record<Lang, string> => ({
  en: src.replace(/«([^|»]*)\|([^»]*)»/g, '$1'),
  id: src.replace(/«([^|»]*)\|([^»]*)»/g, '$2'),
});

export const EXAMPLES: Example[] = [
  {
    name: { en: 'Start here', id: 'Mulai di sini' },
    code: bi(`// «Welcome to jejak.js!|Selamat datang di jejak.js!»
// «Code runs as you type. Values appear at the end of each line.|Kode jalan otomatis saat kamu mengetik. Nilai muncul di ujung baris.»

const «name|nama» = 'Awal'
«name|nama»                      // «an identifier on its own line shows its value|identifier sendirian → nilainya tampil»

const «nums|angka» = [3, 1, 4, 1, 5, 9, 2, 6]
const «even|genap» = «nums|angka».filter(n => n % 2 === 0) //?
const total = «nums|angka».reduce((a, b) => a + b, 0) /*?*/

console.log('«Hello|Halo»,', «name|nama», '— total:', total)

// «Live comment with an expression: $ = the value left of the comment|Live comment dengan ekspresi: $ = nilai di kiri komentar»
«nums|angka».map(n => n * 10) //? $.length

// «Measure execution time with|Ukur waktu eksekusi dengan» /*?.*/
const «words|kata» = 'jejak '.repeat(20000).trim().split(' ') /*?.*/
«words|kata».length

function «greet|sapa»(«who|siapa») {
  if («who|siapa») {
    return '«Hi|Hai» ' + «who|siapa»
  } else {
    return '«Hi, stranger|Hai, orang asing»'   // «grey: this line never ran|abu-abu: tidak pernah dijalankan»
  }
}

«greet|sapa»('Budi') //?
const user = { «name|nama», «age|umur»: 21, skills: ['js', 'react'], «address|alamat»: { «city|kota»: 'Makassar' } }
user

// «Select any expression (e.g. nums.length * 2 below) to evaluate it.|Blok ekspresi apa saja (mis. angka.length * 2 di bawah) untuk menghitungnya.»
const «half|separuh» = «nums|angka».length * 2 / 4
`),
  },
  {
    name: { en: 'Arrays: map / filter / reduce', id: 'Array: map / filter / reduce' },
    code: bi(`const «products|produk» = [
  { «name|nama»: 'Keyboard', «price|harga»: 450000, «stock|stok»: 3 },
  { «name|nama»: 'Mouse', «price|harga»: 150000, «stock|stok»: 0 },
  { «name|nama»: 'Monitor', «price|harga»: 2100000, «stock|stok»: 5 },
  { «name|nama»: 'Keycaps', «price|harga»: 300000, «stock|stok»: 12 },
]

const «inStock|tersedia» = «products|produk».filter(p => p.«stock|stok» > 0) //?
const «names|namaSaja» = «inStock|tersedia».map(p => p.«name|nama») //?
const «stockValue|nilaiGudang» = «products|produk».reduce((sum, p) => sum + p.«price|harga» * p.«stock|stok», 0) //?

const «priciest|termahal» = [...«products|produk»].sort((a, b) => b.«price|harga» - a.«price|harga»)[0] //? $.«name|nama»

const rupiah = n => 'Rp' + n.toLocaleString('id-ID')
rupiah(«stockValue|nilaiGudang») //?

// «Inline breakpoint: select .filter(...) below and press Shift+F9 to pin it|Inline breakpoint: blok .filter(...) di bawah lalu tekan Shift+F9 untuk menyematkannya»
const «cheapNames|namaMurah» = «products|produk».filter(p => p.«price|harga» < 500000).map(p => p.«name|nama»)
«cheapNames|namaMurah»
`),
  },
  {
    name: { en: 'Closures & scope', id: 'Closure & scope' },
    code: bi(`function «makeCounter|buatCounter»(«start|awal» = 0) {
  let count = «start|awal»
  return {
    inc() { count++; return count },
    dec() { count--; return count },
    value: () => count,
  }
}

const c = «makeCounter|buatCounter»(10)
c.inc() //?
c.inc() //?
c.dec() //?
c.value() //?

const c2 = «makeCounter|buatCounter»()
c2.inc() //?   ← «c2 has its own closure|closure c2 terpisah dari c»

// «Classic trap: var vs let inside a loop|Jebakan klasik: var vs let di dalam loop»
var fnsVar = []
for (var i = 0; i < 3; i++) fnsVar.push(() => i)
fnsVar.map(f => f()) //?

const fnsLet = []
for (let j = 0; j < 3; j++) fnsLet.push(() => j)
fnsLet.map(f => f()) //?
`),
  },
  {
    name: { en: 'Recursion (try the Time Machine)', id: 'Rekursi (coba Time Machine)' },
    code: bi(`// «Open the Time Machine under the editor and press Step into|Buka Time Machine di bawah editor lalu tekan Step into»
// «to follow every function call in order.|untuk melihat urutan pemanggilan fungsi satu per satu.»

function «factorial|faktorial»(n) {
  if (n <= 1) return 1
  const «rest|sisa» = «factorial|faktorial»(n - 1)
  return n * «rest|sisa»
}

«factorial|faktorial»(5) //?

function fib(n) {
  if (n < 2) return n
  return fib(n - 1) + fib(n - 2)
}

const «series|deret» = [0, 1, 2, 3, 4, 5, 6].map(fib) //?
`),
  },
  {
    name: { en: 'Event loop: execution order', id: 'Event loop: urutan eksekusi' },
    code: bi(`// «Guess the order first, then check the Console / Order tabs.|Tebak urutannya dulu, lalu lihat tab Console / Urutan.»
console.log('1. «sync: start|sinkron: mulai»')

setTimeout(() => {
  console.log('5. macrotask: setTimeout 0')
}, 0)

Promise.resolve().then(() => {
  console.log('3. microtask: promise.then')
})

queueMicrotask(() => console.log('4. microtask: queueMicrotask'))

console.log('2. «sync: end|sinkron: selesai»')

setTimeout(() => console.log('6. setTimeout 50ms'), 50)
`),
  },
  {
    name: { en: 'Async / await', id: 'Async / await' },
    code: bi(`const «wait|tunggu» = (ms, «value|nilai») =>
  new Promise(resolve => setTimeout(() => resolve(«value|nilai»), ms))

async function «fetchUser|ambilUser»(id) {
  await «wait|tunggu»(100)
  if (id < 0) throw new Error('«Invalid ID|ID tidak valid»: ' + id)
  return { id, «name|nama»: 'User ' + id }
}

const u = await «fetchUser|ambilUser»(7) //?

const «all|semua» = await Promise.all([1, 2, 3].map(«fetchUser|ambilUser»)) //?

try {
  await «fetchUser|ambilUser»(-1)
} catch (e) {
  console.log('«Caught|Tertangkap»:', e.message)
}

const «fastest|tercepat» = await Promise.race([«wait|tunggu»(200, '«slow|lambat»'), «wait|tunggu»(50, '«fast|cepat»')]) //?
`),
  },
  {
    name: { en: 'Classes & this', id: 'Class & this' },
    code: bi(`class «Animal|Hewan» {
  constructor(«name|nama») {
    this.«name|nama» = «name|nama»
  }
  «sound|suara»() {
    return '...'
  }
  «intro|kenalan»() {
    return \`\${this.«name|nama»} «says|bilang» \${this.«sound|suara»()}\`
  }
}

class «Cat|Kucing» extends «Animal|Hewan» {
  «sound|suara»() { return '«meow|meong»' }
}

class «Dog|Anjing» extends «Animal|Hewan» {
  «sound|suara»() { return '«woof|guk»' }
}

const «pets|hewan» = [new «Cat|Kucing»('Oyen'), new «Dog|Anjing»('Bruno'), new «Animal|Hewan»('«Fish|Ikan»')]
«pets|hewan».map(h => h.«intro|kenalan»()) //?

const oyen = «pets|hewan»[0]
oyen
oyen instanceof «Animal|Hewan» //?

const «detached|lepas» = oyen.«intro|kenalan»
// «detached|lepas»()   ← «uncomment: 'this' is lost and the error shows inline|hapus komentar: 'this' hilang, error muncul inline»
`),
  },
  {
    name: { en: 'Errors & coverage', id: 'Error & coverage' },
    code: bi(`function «divide|bagi»(a, b) {
  if (b === 0) {
    throw new Error('«Cannot divide by zero|Tidak bisa dibagi nol»')
  }
  return a / b
}

function «average|hitungRata»(«scores|nilai») {
  const total = «scores|nilai».reduce((x, y) => x + y, 0)
  return «divide|bagi»(total, «scores|nilai».length)
}

«average|hitungRata»([80, 90, 75]) //?

const data = { «scores|skor»: [] }
«average|hitungRata»(data.«scores|skor»)   // «error — red line & pink error path|error — lihat baris merah & jejak pink (jalur error)»

console.log('«this line never runs|baris ini tidak pernah jalan»')
`),
  },
  {
    name: { en: 'Value Explorer & Graph', id: 'Value Explorer & Graph' },
    code: bi(`const «shop|toko» = {
  «name|nama»: '«Awal Store|Toko Awal»',
  «opened|dibuka»: new Date('2024-01-15'),
  «categories|kategori»: new Set(['«electronics|elektronik»', '«accessories|aksesoris»']),
  «stock|stok»: new Map([['keyboard', 3], ['mouse', 0]]),
  «owner|pemilik»: { «name|nama»: 'Awal', «contact|kontak»: { «city|kota»: 'Makassar', «phone|hp»: null } },
  «products|produk»: [
    { id: 1, «name|nama»: 'AWAL75', tags: ['wireless', '75%'] },
    { id: 2, «name|nama»: 'Keycaps PBT', tags: ['cherry'] },
  ],
  «active|aktif»: true,
  rating: 4.8,
}

«shop|toko» /*?+*/
// «Open the Value Explorer tab → click "Graph" for a diagram.|Buka tab Value Explorer → klik "Graph" untuk tampilan diagram.»
`),
  },
];
