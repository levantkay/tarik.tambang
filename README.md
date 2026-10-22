# Tarik Tambang Kuis

Web-app kuis kelas dua tim dengan ilustrasi kartun, desain putih/glassy, panel operator privat, dan layar peserta yang sinkron lewat Supabase Realtime.

## Struktur folder

```text
tarik-tambang-kuis/
├── index.html          # halaman aplikasi
├── style.css           # desain responsif / glassy
├── app.js              # logika layar, operator, kuis, dan Supabase
├── config.js           # isi URL project dan public key Supabase di sini
└── supabase/
    └── schema.sql      # tabel, RLS, dan fungsi permainan
```

Tidak memakai React, npm, build step, atau server lokal. File frontend dimuat dari CDN dan dapat langsung di-deploy sebagai situs statis. Karena aplikasi menggunakan JavaScript dari CDN, koneksi internet diperlukan saat membuka situs.

## 1. Siapkan Supabase

1. Buat project di Supabase.
2. Buka **SQL Editor → New query**.
3. Salin seluruh isi `supabase/schema.sql`, lalu jalankan.
4. Pastikan eksekusi selesai tanpa error. Skrip ini membuat tabel soal, hak operator, state permainan, ronde privat, RLS, fungsi permainan, serta mendaftarkan `game_state` ke publication Realtime bila tersedia.

### Buat akun operator

1. Buka **Authentication → Users → Add user** di Supabase Dashboard.
2. Buat email dan kata sandi operator. Tidak ada tombol pendaftaran akun publik di web-app ini.
3. Salin **User UID** akun tersebut.
4. Di SQL Editor, jalankan query berikut dengan mengganti UID contoh:

```sql
insert into public.operators (user_id)
values ('91be6971-ffc6-4e02-88d4-3a595484c62d')
on conflict (user_id) do nothing;
```

Ulangi untuk setiap orang yang perlu mendapat akses operator. Akun yang hanya ada di Authentication tetapi tidak terdaftar di tabel `operators` tidak bisa mengontrol permainan.

## 2. Isi konfigurasi Supabase

Buka `config.js`, lalu ganti dua nilai placeholder:

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://PROJECT-REF.supabase.co",
  SUPABASE_KEY: "SUPABASE_ANON_ATAU_PUBLISHABLE_KEY"
};
```

Ambil nilainya dari **Project Settings → API**. Gunakan **anon/public key** atau **publishable key** untuk frontend. **Jangan pernah memasukkan `service_role` atau secret key ke `config.js`**; key tersebut memiliki hak istimewa dan tidak aman diekspos di browser. Keamanan aplikasi ini menggunakan Supabase Auth dan RLS, bukan menyembunyikan public key.

## 3. Upload ke repository dan deploy

1. Upload folder/file project ke repository GitHub, dengan `index.html`, `style.css`, `app.js`, dan `config.js` di root repository.
2. Di GitHub, buka **Settings → Pages**, pilih sumber deploy dari branch utama dan folder root (`/`). Simpan.
3. Tunggu GitHub Pages menerbitkan situs. Tidak perlu menjalankan `localhost` atau perintah build.
4. Setelah URL situs tersedia, gunakan:
   - `https://URL-SITUS/#operator` untuk komputer operator.
   - `https://URL-SITUS/#display` untuk layar proyektor.

Buka tautan layar kelas di browser/tab terpisah untuk proyektor. Gunakan tautan operator dari perangkat operator. Kedua layar membutuhkan internet dan project Supabase yang sama.

Alternatifnya, file yang sama juga dapat diunggah ke host static seperti Netlify. Pastikan semua file root ikut ter-deploy dan `config.js` tidak tertinggal.

## 4. Cara bermain

1. Operator masuk menggunakan email dan kata sandi Supabase yang sudah diberi izin.
2. Tambah minimal lima pertanyaan aktif. Setiap soal bisa berupa **pilihan ganda** (empat opsi dan kunci) atau **isian/jawaban lisan** (kunci/patokan penilaian).
3. Klik **Reset & acak 5 soal** untuk memulai ronde baru. Sistem mengambil lima pertanyaan berbeda secara acak.
4. Untuk setiap soal, operator memilih Tim Kiri atau Tim Kanan sebagai tim penjawab.
5. Setelah jawaban peserta disampaikan secara lisan, operator klik **Jawaban benar** atau **Jawaban salah**. Jika benar, tim penjawab mendapat satu tarikan dan soal selesai. Jika salah, skor dan posisi tali tidak berubah; operator dapat memilih salah satu tim agar kedua tim bisa bergantian mencoba sampai ada jawaban benar.
6. Klik **Soal berikutnya** setelah hasil ditampilkan. Sesudah soal kelima, klik tombol akhir ronde agar pemenang tampil di layar.
7. **Reset papan permainan** mengosongkan scoreboard dan pertanyaan aktif, tetapi tidak menghapus bank pertanyaan. **Reset & acak 5 soal** dapat langsung mengganti/memulai ronde berikutnya.

Hanya jawaban benar yang menghasilkan tarikan, sehingga ronde dapat berakhir seri. Penilaian jawaban tidak dilakukan otomatis oleh aplikasi; operator tetap menjadi juri untuk jawaban lisan.

## Keamanan dan catatan

- Layar peserta hanya membaca `game_state`, yang menyimpan teks/opsi pertanyaan publik. Bank soal, snapshot ronde, dan kunci jawaban hanya tersedia untuk akun operator.
- Sesudah jawaban benar, layar peserta menampilkan hasil serta kunci jawaban soal tersebut agar bisa dibahas bersama. Jika jawaban salah, kunci tidak ditampilkan supaya kedua tim bisa mencoba lagi.
- Bila layar tidak sinkron, periksa bahwa `game_state` masuk ke publication `supabase_realtime` dan bahwa Realtime tersedia/aktif di project Supabase.
- Jangan menghapus atau membuka policy RLS pada tabel `questions`, `game_rounds`, `game_round_items`, atau `operators` untuk mengatasi error akses. Pastikan akun memang ada pada tabel `operators`.
- Untuk layar proyektor, gunakan browser fullscreen (`F11`) agar tampilan lebih rapi.
