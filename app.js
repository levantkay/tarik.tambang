/* Tarik Tambang Kuis — static frontend, Supabase Auth + Postgres + Realtime */
(() => {
  'use strict';

  const root = document.getElementById('app-root');
  const config = window.APP_CONFIG || {};
  const isConfigured = Boolean(
    window.supabase &&
    typeof config.SUPABASE_URL === 'string' &&
    /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.SUPABASE_URL) &&
    typeof config.SUPABASE_KEY === 'string' &&
    config.SUPABASE_KEY.length > 20 &&
    !config.SUPABASE_KEY.includes('YOUR_SUPABASE')
  );
  const db = isConfigured
    ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      })
    : null;

  let liveChannel = null;
  let liveState = null;
  let bankQuestions = [];
  let editingQuestionId = null;
  let currentUser = null;
  let operatorReady = false;
  let operatorStateChannelName = null;
  let toastCounter = 0;

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function showToast(message, type = 'normal') {
    const region = $('#toast-region');
    if (!region) return;
    const node = document.createElement('div');
    node.className = `toast${type === 'error' ? ' error' : type === 'success' ? ' success' : ''}`;
    node.textContent = message;
    node.dataset.toast = String(++toastCounter);
    region.appendChild(node);
    window.setTimeout(() => node.remove(), 3900);
  }

  function errorMessage(error) {
    const message = error && error.message ? error.message : String(error || 'Terjadi kesalahan.');
    if (/invalid login credentials/i.test(message)) return 'Email atau kata sandi belum tepat.';
    if (/failed to fetch|networkerror|fetch failed/i.test(message)) return 'Koneksi gagal. Periksa URL, key, dan koneksi internet.';
    if (/row-level security|permission denied|42501/i.test(message)) return 'Akses ditolak. Pastikan akun sudah terdaftar sebagai operator dan SQL RLS sudah dijalankan.';
    return message;
  }

  function appShell(active, content) {
    return `
      <div class="app-shell">
        <header class="topbar">
          <a class="brand" href="#home" aria-label="Beranda Tarik Tambang Kuis">
            <div class="brand-mark">↔</div>
            <div><p class="brand-title">Tarik Tambang</p><p class="brand-subtitle">Kuis kelas, adu kompak</p></div>
          </a>
          <nav class="top-nav" aria-label="Navigasi utama">
            <a class="nav-link ${active === 'home' ? 'active' : ''}" href="#home">Beranda</a>
            <a class="nav-link ${active === 'display' ? 'active' : ''}" href="#display">Layar kelas</a>
            <a class="nav-link ${active === 'operator' ? 'active' : ''}" href="#operator">Operator</a>
          </nav>
        </header>
        ${content}
        <footer class="footer-note">Dibuat untuk permainan kelas · Dikendalikan penuh oleh operator</footer>
      </div>`;
  }

  function configWarning() {
    return `
      <div class="config-warning">
        <h2>Supabase belum dikonfigurasi</h2>
        <p>Edit file <code>config.js</code> di root project, lalu isi URL project dan anon/publishable key dari Supabase Dashboard.</p>
        <ol>
          <li>Buka <strong>Project Settings → API</strong> di Supabase.</li>
          <li>Salin Project URL ke <code>SUPABASE_URL</code>.</li>
          <li>Salin anon/publishable key ke <code>SUPABASE_KEY</code>.</li>
        </ol>
        <p><strong>Jangan pernah menaruh service_role key di frontend.</strong> Setelah itu jalankan <code>supabase/schema.sql</code> di SQL Editor.</p>
      </div>`;
  }

  function homeTemplate() {
    const warning = isConfigured ? '' : configWarning();
    return appShell('home', `
      ${warning}
      <section class="hero glass">
        <div class="hero-copy">
          <p class="eyebrow">Classroom game mode</p>
          <h1>Tarik jawaban.<br><span>Menangkan ronde.</span></h1>
          <p class="hero-lead">Kuis interaktif dua tim dengan konsep tarik tambang. Operator yang memilih tim penjawab, menilai jawaban, dan mengatur alur ronde. Peserta tinggal fokus menjawab dari tempat masing-masing.</p>
          <div class="hero-actions">
            <a class="btn btn-primary" href="#display">▣ Buka layar kelas <span aria-hidden="true">↗</span></a>
            <a class="btn btn-secondary" href="#operator">⚙ Masuk operator</a>
          </div>
        </div>
        <div class="hero-art" aria-label="Ilustrasi kartun dua tim bermain tarik tambang">
          <div class="art-orbit"></div>
          <div class="art-card">
            <div class="art-badges"><span class="pill"><span class="pill-dot"></span> ARENA KUIS</span><span class="art-score">5 SOAL / RONDE</span></div>
            <div class="mini-arena">
              <div class="mini-person left"><div class="mini-head"></div><div class="mini-body"></div><div class="mini-arm"></div><div class="mini-leg"></div><div class="mini-leg two"></div></div>
              <div class="mini-person right"><div class="mini-head"></div><div class="mini-body"></div><div class="mini-arm"></div><div class="mini-leg"></div><div class="mini-leg two"></div></div>
              <div class="mini-rope"></div>
            </div>
            <div class="art-note"><span><strong>Tim Kiri</strong> · Merah</span><span><strong>Tim Kanan</strong> · Biru</span></div>
          </div>
        </div>
      </section>
      <section class="home-stats" aria-label="Cara bermain">
        <article class="stat-card"><div class="stat-icon">❶</div><div><strong>5 pertanyaan acak</strong><span>Satu ronde selalu memakai lima soal unik.</span></div></article>
        <article class="stat-card"><div class="stat-icon">↔</div><div><strong>Tarik tali langsung</strong><span>Skor dan posisi tali sinkron ke layar kelas.</span></div></article>
        <article class="stat-card"><div class="stat-icon">✦</div><div><strong>Dua mode pertanyaan</strong><span>Pilihan ganda atau isian dengan kunci jawaban privat.</span></div></article>
      </section>
    `);
  }

  function svgArena() {
    return `
      <svg class="arena-svg" viewBox="0 0 1000 250" role="img" aria-label="Ilustrasi kartun dua tim menarik tali">
        <rect class="arena-bg" x="0" y="0" width="1000" height="250" rx="22"></rect>
        <path class="arena-floor" d="M0 193 Q150 178 280 192 T540 190 T790 189 T1000 192 L1000 250 L0 250Z"></path>
        <path class="arena-ground" d="M40 205 Q500 190 960 205" fill="none"></path>
        <g id="left-mascot" transform="translate(0 0)">
          <path class="mascot-outline mascot-skin" d="M179 116 Q211 106 249 132" fill="none" stroke-width="20"></path>
          <path class="mascot-outline mascot-skin" d="M123 121 Q104 143 115 159" fill="none" stroke-width="17"></path>
          <path class="mascot-outline mascot-skin" d="M143 165 L134 199 Q132 205 119 205 L107 205" fill="none" stroke-width="17"></path>
          <path class="mascot-outline mascot-skin" d="M171 166 L183 196 Q186 202 199 203 L211 203" fill="none" stroke-width="17"></path>
          <path class="mascot-outline mascot-shirt-left" d="M122 101 Q151 85 182 102 L194 155 L176 167 L128 167 L111 151Z"></path>
          <circle class="mascot-outline mascot-skin" cx="151" cy="64" r="34"></circle>
          <path class="mascot-outline mascot-hair" d="M118 62 Q112 24 147 25 Q179 19 187 49 L180 57 L170 45 L153 48 L139 41 L124 56Z"></path>
          <circle cx="143" cy="66" r="3.5" fill="#283958"></circle><circle cx="163" cy="66" r="3.5" fill="#283958"></circle>
          <path d="M146 79 Q153 85 161 78" fill="none" stroke="#b66e58" stroke-width="3.5" stroke-linecap="round"></path>
          <path class="mascot-outline mascot-shoe" d="M106 202 Q119 196 132 203 L134 211 L104 211Z"></path>
          <path class="mascot-outline mascot-shoe" d="M185 200 Q198 195 210 202 L215 210 L185 210Z"></path>
        </g>
        <g id="rope-system" class="rope-system">
          <path class="rope-stroke" d="M245 132 C335 127 400 138 500 132 S666 129 755 132"></path>
          <path class="rope-highlight" d="M245 132 C335 127 400 138 500 132 S666 129 755 132"></path>
          <g class="rope-knot" transform="translate(500 132)">
            <circle class="rope-marker" r="20"></circle>
            <path d="M-11 -12 Q0 0 -10 12 M-2 -17 Q8 -2 -2 17 M7 -14 Q-1 1 10 13" fill="none" stroke="#996b34" stroke-width="4" stroke-linecap="round"></path>
            <circle class="rope-center-pin" r="5"></circle>
          </g>
          <path d="M500 102 L500 76" stroke="#a8b2c6" stroke-width="2" stroke-dasharray="4 5"></path>
          <path d="M500 76 L525 83 L500 90Z" fill="#ffd26d" stroke="#c28b35" stroke-width="2" stroke-linejoin="round"></path>
        </g>
        <g id="right-mascot" transform="translate(1000 0) scale(-1 1)">
          <path class="mascot-outline mascot-skin" d="M179 116 Q211 106 249 132" fill="none" stroke-width="20"></path>
          <path class="mascot-outline mascot-skin" d="M123 121 Q104 143 115 159" fill="none" stroke-width="17"></path>
          <path class="mascot-outline mascot-skin" d="M143 165 L134 199 Q132 205 119 205 L107 205" fill="none" stroke-width="17"></path>
          <path class="mascot-outline mascot-skin" d="M171 166 L183 196 Q186 202 199 203 L211 203" fill="none" stroke-width="17"></path>
          <path class="mascot-outline mascot-shirt-right" d="M122 101 Q151 85 182 102 L194 155 L176 167 L128 167 L111 151Z"></path>
          <circle class="mascot-outline mascot-skin" cx="151" cy="64" r="34"></circle>
          <path class="mascot-outline mascot-hair" d="M118 62 Q112 24 147 25 Q179 19 187 49 L180 57 L170 45 L153 48 L139 41 L124 56Z"></path>
          <circle cx="143" cy="66" r="3.5" fill="#283958"></circle><circle cx="163" cy="66" r="3.5" fill="#283958"></circle>
          <path d="M146 79 Q153 85 161 78" fill="none" stroke="#b66e58" stroke-width="3.5" stroke-linecap="round"></path>
          <path class="mascot-outline mascot-shoe" d="M106 202 Q119 196 132 203 L134 211 L104 211Z"></path>
          <path class="mascot-outline mascot-shoe" d="M185 200 Q198 195 210 202 L215 210 L185 210Z"></path>
        </g>
      </svg>`;
  }

  function displayTemplate() {
    return `
      <main class="screen-page">
        <header class="screen-header">
          <a class="brand" href="#home" aria-label="Beranda">
            <div class="brand-mark">↔</div>
            <div><p class="brand-title">Tarik Tambang</p><p class="brand-subtitle">Kuis kelas · Layar peserta</p></div>
          </a>
          <div class="screen-live"><span class="live-dot"></span><span id="connection-label">MENYAMBUNG</span></div>
        </header>
        ${!isConfigured ? configWarning() : ''}
        <section id="screen-idle" class="panel screen-empty" ${isConfigured ? '' : 'hidden'}>
          <div>
            <div class="empty-icon">↔</div>
            <h2>Siap tarik tambang?</h2>
            <p>Operator akan memulai ronde baru. Lima pertanyaan acak akan muncul di layar ini setelah permainan dimulai.</p>
          </div>
        </section>
        <section id="screen-active-game" class="screen-main" hidden>
          <div class="scoreboard">
            <article class="team-score left">
              <div class="team-avatar">🦊</div>
              <div><p class="team-title">Sisi kiri · Merah</p><h2 class="team-name">Tim Kiri</h2><div class="team-points"><strong id="left-score">0</strong><span>TARIKAN</span></div></div>
            </article>
            <div class="vs-mark">VS</div>
            <article class="team-score right">
              <div class="team-avatar">🐻</div>
              <div><p class="team-title">Sisi kanan · Biru</p><h2 class="team-name">Tim Kanan</h2><div class="team-points"><strong id="right-score">0</strong><span>TARIKAN</span></div></div>
            </article>
          </div>
          <div class="panel arena-panel">
            <div class="arena-topline"><span>ARENA TARIK TAMBANG</span><span class="midline" id="arena-round-label">RONDE 1</span><span id="arena-question-label">SOAL 1 / 5</span></div>
            ${svgArena()}
          </div>
          <div id="winner-banner" class="winner-banner" hidden></div>
          <section id="question-panel" class="question-panel">
            <div>
              <div class="question-label"><span id="question-number" class="question-number">SOAL 1 DARI 5</span><span id="question-mode" class="question-mode">PILIHAN GANDA</span></div>
              <h1 id="question-text" class="question-text">Menunggu soal…</h1>
              <div id="options-grid" class="options-grid"></div>
              <div id="short-answer-note" class="helper-text" hidden>Jawab secara lisan kepada operator.</div>
              <div id="result-ribbon" class="result-ribbon" hidden></div>
            </div>
            <aside id="answer-side" class="answer-side waiting">
              <div class="answer-side-inner">
                <div class="answer-side-icon">🎤</div>
                <div><div class="answer-side-label" id="answer-side-label">TIM PENJAWAB</div><div class="answer-side-name" id="answer-side-name">Menunggu pilihan operator</div></div>
              </div>
            </aside>
          </section>
        </section>
        <footer class="screen-footer"><span><strong>5 SOAL • 1 TARIKAN SETIAP SOAL</strong></span><span>Ikuti arahan operator · Jawab langsung secara lisan</span></footer>
      </main>`;
  }

  function setText(selector, value, scope = document) {
    const node = $(selector, scope);
    if (node) node.textContent = value == null ? '' : String(value);
  }

  function setHidden(selector, hidden, scope = document) {
    const node = $(selector, scope);
    if (node) node.hidden = Boolean(hidden);
  }

  function renderDisplayState(state) {
    liveState = state;
    const idle = $('#screen-idle');
    const active = $('#screen-active-game');
    if (!idle || !active) return;
    setText('#connection-label', 'LANGSUNG');
    if (!state || state.status === 'idle') {
      idle.hidden = false;
      active.hidden = true;
      return;
    }
    idle.hidden = true;
    active.hidden = false;
    setText('#left-score', state.left_score ?? 0);
    setText('#right-score', state.right_score ?? 0);
    setText('#arena-round-label', `RONDE ${state.round_no || 1}`);
    setText('#arena-question-label', state.status === 'finished' ? 'RONDE SELESAI' : `SOAL ${state.question_no} / 5`);
    const rope = $('#rope-system');
    if (rope) rope.setAttribute('transform', `translate(${Number(state.rope_position || 0) * 13} 0)`);

    const winnerBanner = $('#winner-banner');
    const questionPanel = $('#question-panel');
    if (state.status === 'finished') {
      if (winnerBanner) {
        winnerBanner.hidden = false;
        winnerBanner.textContent = state.winner_side === 'left'
          ? '🏆 TIM KIRI MENANG! SELAMAT!'
          : state.winner_side === 'right'
            ? '🏆 TIM KANAN MENANG! SELAMAT!'
            : '🤝 RONDE BERAKHIR SERI!';
      }
      if (questionPanel) questionPanel.hidden = true;
      return;
    }
    if (winnerBanner) winnerBanner.hidden = true;
    if (questionPanel) questionPanel.hidden = false;

    const question = state.current_question || {};
    setText('#question-number', `SOAL ${state.question_no || 1} DARI 5`);
    setText('#question-mode', question.mode === 'short_answer' ? 'ISIAN / JAWAB LISAN' : 'PILIHAN GANDA');
    setText('#question-text', question.prompt || 'Menunggu soal…');
    const isMC = question.mode === 'multiple_choice';
    setHidden('#short-answer-note', isMC);
    const optionsGrid = $('#options-grid');
    if (optionsGrid) {
      optionsGrid.innerHTML = isMC && Array.isArray(question.options)
        ? question.options.map((option, index) => `<div class="option-chip"><span class="option-letter">${String.fromCharCode(65 + index)}</span><span>${escapeHtml(option)}</span></div>`).join('')
        : '';
      optionsGrid.hidden = !isMC;
    }

    const side = $('#answer-side');
    if (side) side.classList.toggle('waiting', !state.answering_side);
    setText('#answer-side-label', state.phase === 'result' ? 'TIM YANG MENJAWAB' : 'TIM PENJAWAB');
    setText('#answer-side-name', state.answering_side === 'left' ? 'Tim Kiri' : state.answering_side === 'right' ? 'Tim Kanan' : 'Menunggu pilihan operator');
    const result = state.last_result;
    const ribbon = $('#result-ribbon');
    if (ribbon) {
      ribbon.hidden = !(result && (state.phase === 'result' || !result.is_correct));
      ribbon.classList.toggle('wrong', Boolean(result && !result.is_correct));
      if (result) {
        const correctness = result.is_correct ? 'Jawaban BENAR.' : 'Jawaban belum tepat.';
        const outcome = result.is_correct
          ? `<strong>${result.winner_side === 'left' ? 'Tim Kiri' : 'Tim Kanan'}</strong> mendapat satu tarikan.`
          : 'Skor tidak berubah. Kedua tim boleh mencoba lagi.';
        const answerKey = result.is_correct
          ? ` <span style="font-weight:600">Kunci: ${escapeHtml(result.correct_answer || '—')}</span>`
          : '';
        ribbon.innerHTML = `<span class="result-icon">${result.is_correct ? '✨' : '💡'}</span><span>${correctness} ${outcome}${answerKey}</span>`;
      }
    }
  }

  async function fetchGameState() {
    if (!db) return null;
    const { data, error } = await db.from('game_state').select('*').eq('id', 1).maybeSingle();
    if (error) throw error;
    return data;
  }

  function clearLiveChannel() {
    if (db && liveChannel) {
      db.removeChannel(liveChannel);
      liveChannel = null;
    }
    operatorStateChannelName = null;
  }

  async function renderDisplayPage() {
    root.innerHTML = displayTemplate();
    if (!isConfigured) return;
    try {
      const state = await fetchGameState();
      renderDisplayState(state);
      liveChannel = db.channel('tug-game-state-display')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'game_state', filter: 'id=eq.1' }, payload => {
          renderDisplayState(payload.new || null);
        })
        .subscribe(status => {
          setText('#connection-label', status === 'SUBSCRIBED' ? 'LANGSUNG' : status === 'CHANNEL_ERROR' ? 'KONEKSI TERGANGGU' : 'MENYAMBUNG');
        });
    } catch (error) {
      showToast(errorMessage(error), 'error');
      const idle = $('#screen-idle');
      if (idle) {
        idle.hidden = false;
        idle.innerHTML = `<div><div class="empty-icon">!</div><h2>Belum terhubung</h2><p>${escapeHtml(errorMessage(error))}</p></div>`;
      }
    }
  }

  function loginTemplate(message = '') {
    return appShell('operator', `
      <section class="auth-wrap">
        <div class="auth-card panel">
          <p class="eyebrow">Operator access</p>
          <h1>Masuk ke kontrol permainan</h1>
          <p>Area ini khusus operator yang sudah dibuatkan akun di Supabase. Peserta tidak memerlukan akun karena layar kelas hanya menampilkan permainan.</p>
          <form id="login-form">
            <div class="form-field"><label for="login-email">Email operator</label><input id="login-email" name="email" type="email" autocomplete="username" placeholder="operator@email.com" required></div>
            <div class="form-field"><label for="login-password">Kata sandi</label><input id="login-password" name="password" type="password" autocomplete="current-password" placeholder="Masukkan kata sandi" required></div>
            <button class="btn btn-primary btn-wide" type="submit">Masuk operator →</button>
          </form>
          ${message ? `<div class="error-box">${escapeHtml(message)}</div>` : ''}
          <div class="info-box">Akun dibuat lewat Supabase Dashboard; pendaftaran publik tidak tersedia di aplikasi ini.</div>
        </div>
      </section>`);
  }

  function unauthorizedTemplate(email = '') {
    return appShell('operator', `
      <section class="auth-wrap"><div class="auth-card panel">
        <p class="eyebrow">Operator access</p><h1>Akun belum diizinkan</h1>
        <p>${escapeHtml(email || 'Akun ini')} berhasil masuk ke Supabase, tetapi belum terdaftar sebagai operator untuk permainan ini.</p>
        <div class="info-box">Tambahkan User UID akun ini ke tabel <code>public.operators</code> lewat SQL Editor Supabase, lalu masuk kembali.</div>
        <div class="form-actions" style="margin-top:18px"><button id="signout-unauthorized" class="btn btn-secondary" type="button">Keluar</button><a class="btn btn-quiet" href="#home">Kembali</a></div>
      </div></section>`);
  }

  function operatorTemplate(email) {
    return appShell('operator', `
      <section class="page-heading">
        <div><p class="eyebrow">Control room</p><h1>Panel operator</h1><p>Kelola bank soal dan kendalikan alur permainan di layar kelas.</p></div>
        <div class="hero-actions"><a class="btn btn-secondary" href="#display" target="_blank" rel="noopener">▣ Buka layar kelas ↗</a><button id="signout-btn" class="btn btn-quiet" type="button">Keluar</button></div>
      </section>
      <div class="operator-layout">
        <section class="operator-panel panel">
          <div class="panel-heading"><div><h2>Bank pertanyaan</h2><p>Tambahkan soal pilihan ganda atau isian, beserta kunci jawabannya.</p></div><span id="question-count" class="count-pill">0 soal aktif</span></div>
          <form id="question-form">
            <div class="form-field"><label for="q-prompt">Pertanyaan</label><textarea id="q-prompt" name="prompt" maxlength="1400" placeholder="Tulis pertanyaan di sini…" required></textarea></div>
            <div class="form-grid">
              <div class="form-field"><label for="q-mode">Mode pertanyaan</label><select id="q-mode" name="mode"><option value="multiple_choice">Pilihan ganda</option><option value="short_answer">Isian / jawaban lisan</option></select></div>
              <div class="form-field" id="correct-choice-field"><label for="q-correct-option">Kunci jawaban</label><select id="q-correct-option" name="correct_option"><option value="0">A</option><option value="1">B</option><option value="2">C</option><option value="3">D</option></select></div>
            </div>
            <div id="multiple-choice-fields" class="option-fields">
              <div class="form-grid">
                <div class="form-field"><label for="q-option-a">Opsi A</label><input id="q-option-a" name="option-a" maxlength="350" placeholder="Jawaban A"></div>
                <div class="form-field"><label for="q-option-b">Opsi B</label><input id="q-option-b" name="option-b" maxlength="350" placeholder="Jawaban B"></div>
                <div class="form-field"><label for="q-option-c">Opsi C</label><input id="q-option-c" name="option-c" maxlength="350" placeholder="Jawaban C"></div>
                <div class="form-field"><label for="q-option-d">Opsi D</label><input id="q-option-d" name="option-d" maxlength="350" placeholder="Jawaban D"></div>
              </div>
            </div>
            <div id="short-answer-fields" hidden>
              <div class="form-field" style="margin-top:12px"><label for="q-answer-text">Kunci jawaban / patokan penilaian</label><textarea id="q-answer-text" name="answer_text" maxlength="800" placeholder="Masukkan jawaban yang diharapkan…"></textarea><span class="helper-text">Penilaian tetap dilakukan operator secara manual; aplikasi tidak mencocokkan ucapan peserta otomatis.</span></div>
            </div>
            <div class="form-actions"><button id="save-question-btn" class="btn btn-primary" type="submit">＋ Simpan pertanyaan</button><button id="cancel-edit-btn" class="btn btn-quiet" type="button" hidden>Batal edit</button></div>
          </form>
          <div class="control-block"><h3>Pertanyaan tersimpan</h3><p class="control-copy">Soal nonaktif tidak ikut terpilih saat ronde baru diacak. Hapus soal lama hanya bila memang diperlukan.</p><div id="question-list" class="question-list"><div class="empty-bank">Memuat bank pertanyaan…</div></div></div>
        </section>

        <section class="operator-panel panel">
          <div class="panel-heading"><div><h2>Kontrol ronde</h2><p>Status permainan akan tersinkron otomatis ke layar kelas.</p></div><span id="round-status-pill" class="count-pill">Siap</span></div>
          <div class="operator-game-summary">
            <div class="op-score left"><span>Tim Kiri · Merah</span><strong id="op-left-score">0</strong></div>
            <div class="op-score right"><span>Tim Kanan · Biru</span><strong id="op-right-score">0</strong></div>
          </div>
          <div id="operator-status" class="operator-status"><strong>Belum ada ronde berjalan</strong><p>Tambahkan minimal lima soal aktif, lalu mulai ronde baru.</p></div>
          <div class="control-block">
            <h3>1. Tentukan tim penjawab</h3><p class="control-copy">Pilih tim yang sedang diberi kesempatan menjawab oleh operator.</p>
            <div class="side-choice">
              <button id="choose-left-btn" class="side-btn" type="button"><span class="side-emoji">🦊</span><span>Tim Kiri menjawab</span></button>
              <button id="choose-right-btn" class="side-btn" type="button"><span class="side-emoji">🐻</span><span>Tim Kanan menjawab</span></button>
            </div>
          </div>
          <div class="control-block">
            <h3>2. Nilai jawaban</h3><p class="control-copy">Tombol benar memberi tarikan kepada tim penjawab. Tombol salah memberi tarikan kepada tim lawan.</p>
            <div class="judge-actions"><button id="mark-correct-btn" class="btn btn-success" type="button">✓ Jawaban benar</button><button id="mark-wrong-btn" class="btn btn-warning" type="button">✕ Jawaban salah</button></div>
          </div>
          <div class="control-block">
            <h3>Kunci jawaban (khusus operator)</h3><div id="operator-answer-key" class="operator-status"><strong>Kunci belum tersedia</strong><p>Kunci jawaban hanya tampil di panel operator, tidak di layar peserta sebelum penilaian.</p></div>
          </div>
          <div class="control-bottom"><button id="advance-btn" class="btn btn-primary btn-wide" type="button" disabled>Soal berikutnya →</button><button id="start-round-btn" class="btn btn-secondary btn-wide" type="button">↻ Reset & acak 5 soal</button><button id="reset-game-btn" class="btn btn-quiet btn-wide" type="button">Reset papan permainan</button></div>
          <div class="operator-footer"><span class="helper-text">Login: ${escapeHtml(email)}</span><span id="operator-sync-label" class="helper-text">Menghubungkan…</span></div>
        </section>
      </div>`);
  }

  async function renderOperatorPage() {
    if (!isConfigured) {
      root.innerHTML = appShell('operator', configWarning());
      return;
    }
    root.innerHTML = appShell('operator', '<div class="auth-wrap"><div class="spinner"></div></div>');
    try {
      const { data, error } = await db.auth.getSession();
      if (error) throw error;
      if (!data.session) {
        root.innerHTML = loginTemplate();
        bindLoginForm();
        return;
      }
      await showOperatorConsole(data.session.user);
    } catch (error) {
      root.innerHTML = loginTemplate(errorMessage(error));
      bindLoginForm();
    }
  }

  function bindLoginForm() {
    const form = $('#login-form');
    if (!form) return;
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const button = $('button[type="submit"]', form);
      button.disabled = true;
      button.textContent = 'Memeriksa akun…';
      const email = $('#login-email').value.trim();
      const password = $('#login-password').value;
      try {
        const { data, error } = await db.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await showOperatorConsole(data.user);
      } catch (error) {
        root.innerHTML = loginTemplate(errorMessage(error));
        bindLoginForm();
      }
    });
  }

  async function showOperatorConsole(user) {
    const { data: record, error } = await db.from('operators').select('user_id').eq('user_id', user.id).maybeSingle();
    if (error) {
      root.innerHTML = loginTemplate(errorMessage(error));
      bindLoginForm();
      return;
    }
    if (!record) {
      root.innerHTML = unauthorizedTemplate(user.email || 'Akun ini');
      const signout = $('#signout-unauthorized');
      if (signout) signout.addEventListener('click', async () => { await db.auth.signOut(); root.innerHTML = loginTemplate(); bindLoginForm(); });
      return;
    }
    currentUser = user;
    operatorReady = true;
    root.innerHTML = operatorTemplate(user.email || 'Operator');
    bindOperatorForm();
    await Promise.all([loadQuestionBank(), refreshOperatorState()]);
    attachOperatorRealtime();
  }

  function bindOperatorForm() {
    const form = $('#question-form');
    if (!form) return;
    $('#q-mode').addEventListener('change', toggleQuestionModeFields);
    form.addEventListener('submit', saveQuestion);
    $('#cancel-edit-btn').addEventListener('click', resetQuestionForm);
    $('#question-list').addEventListener('click', handleQuestionListClick);
    $('#signout-btn').addEventListener('click', async () => {
      clearLiveChannel();
      operatorReady = false;
      await db.auth.signOut();
      root.innerHTML = loginTemplate();
      bindLoginForm();
    });
    $('#choose-left-btn').addEventListener('click', () => callOperatorRpc('set_answering_side', { p_side: 'left' }, 'Tim Kiri dipilih sebagai penjawab.'));
    $('#choose-right-btn').addEventListener('click', () => callOperatorRpc('set_answering_side', { p_side: 'right' }, 'Tim Kanan dipilih sebagai penjawab.'));
    $('#mark-correct-btn').addEventListener('click', () => callOperatorRpc('resolve_current_question', { p_is_correct: true }, 'Jawaban ditandai benar.'));
    $('#mark-wrong-btn').addEventListener('click', () => callOperatorRpc('resolve_current_question', { p_is_correct: false }, 'Jawaban ditandai salah.'));
    $('#advance-btn').addEventListener('click', advanceQuestion);
    $('#start-round-btn').addEventListener('click', startNewRound);
    $('#reset-game-btn').addEventListener('click', resetGame);
    toggleQuestionModeFields();
  }

  function toggleQuestionModeFields() {
    const modeNode = $('#q-mode');
    if (!modeNode) return;
    const mc = modeNode.value === 'multiple_choice';
    setHidden('#multiple-choice-fields', !mc);
    setHidden('#correct-choice-field', !mc);
    setHidden('#short-answer-fields', mc);
    ['#q-option-a', '#q-option-b', '#q-option-c', '#q-option-d'].forEach(selector => {
      const node = $(selector);
      if (node) node.required = mc;
    });
    const answer = $('#q-answer-text');
    if (answer) answer.required = !mc;
  }

  async function loadQuestionBank() {
    if (!operatorReady) return;
    const { data, error } = await db.from('questions')
      .select('id,prompt,mode,options,correct_option,answer_text,is_active,created_at')
      .order('created_at', { ascending: false });
    if (error) {
      showToast(errorMessage(error), 'error');
      return;
    }
    bankQuestions = data || [];
    renderQuestionBank();
    const startBtn = $('#start-round-btn');
    if (startBtn) startBtn.disabled = bankQuestions.filter(q => q.is_active).length < 5;
  }

  function renderQuestionBank() {
    const list = $('#question-list');
    const count = $('#question-count');
    if (!list) return;
    const activeCount = bankQuestions.filter(q => q.is_active).length;
    if (count) count.textContent = `${activeCount} soal aktif`;
    if (!bankQuestions.length) {
      list.innerHTML = '<div class="empty-bank">Belum ada pertanyaan. Tambahkan soal di form atas.<br>Ronde baru memerlukan minimal lima soal aktif.</div>';
      return;
    }
    list.innerHTML = bankQuestions.map(q => `
      <article class="bank-item ${q.is_active ? '' : 'inactive'}">
        <div class="bank-item-copy"><p class="bank-item-title">${escapeHtml(q.prompt)}</p><div class="bank-item-meta"><span class="mini-tag">${q.mode === 'multiple_choice' ? 'Pilihan ganda' : 'Isian'}</span><span class="mini-tag ${q.is_active ? '' : 'gray'}">${q.is_active ? 'Aktif' : 'Nonaktif'}</span></div></div>
        <div class="bank-actions"><button type="button" class="icon-btn" title="Edit soal" aria-label="Edit soal" data-action="edit" data-id="${q.id}">✎</button><button type="button" class="icon-btn" title="${q.is_active ? 'Nonaktifkan soal' : 'Aktifkan soal'}" aria-label="${q.is_active ? 'Nonaktifkan' : 'Aktifkan'} soal" data-action="toggle" data-id="${q.id}">${q.is_active ? '◉' : '○'}</button><button type="button" class="icon-btn" title="Hapus soal" aria-label="Hapus soal" data-action="delete" data-id="${q.id}">⌫</button></div>
      </article>`).join('');
  }

  async function saveQuestion(event) {
    event.preventDefault();
    const prompt = $('#q-prompt').value.trim();
    const mode = $('#q-mode').value;
    if (!prompt) return showToast('Pertanyaan tidak boleh kosong.', 'error');
    const payload = {
      prompt,
      mode,
      options: null,
      correct_option: null,
      answer_text: null,
      updated_at: new Date().toISOString()
    };
    if (mode === 'multiple_choice') {
      const options = ['a', 'b', 'c', 'd'].map(letter => $(`#q-option-${letter}`).value.trim());
      if (options.some(option => !option)) return showToast('Isi seluruh opsi A, B, C, dan D.', 'error');
      payload.options = options;
      payload.correct_option = Number($('#q-correct-option').value);
    } else {
      payload.answer_text = $('#q-answer-text').value.trim();
      if (!payload.answer_text) return showToast('Isi kunci jawaban atau patokan penilaian.', 'error');
    }

    const button = $('#save-question-btn');
    button.disabled = true;
    try {
      let result;
      if (editingQuestionId) {
        result = await db.from('questions').update(payload).eq('id', editingQuestionId);
      } else {
        result = await db.from('questions').insert(payload);
      }
      if (result.error) throw result.error;
      showToast(editingQuestionId ? 'Pertanyaan berhasil diperbarui.' : 'Pertanyaan berhasil ditambahkan.', 'success');
      resetQuestionForm();
      await loadQuestionBank();
    } catch (error) {
      showToast(errorMessage(error), 'error');
    } finally {
      if ($('#save-question-btn')) $('#save-question-btn').disabled = false;
    }
  }

  function resetQuestionForm() {
    const form = $('#question-form');
    if (!form) return;
    form.reset();
    editingQuestionId = null;
    setText('#save-question-btn', '＋ Simpan pertanyaan');
    setHidden('#cancel-edit-btn', true);
    toggleQuestionModeFields();
  }

  function loadQuestionIntoForm(question) {
    editingQuestionId = question.id;
    $('#q-prompt').value = question.prompt;
    $('#q-mode').value = question.mode;
    if (question.mode === 'multiple_choice') {
      const options = Array.isArray(question.options) ? question.options : [];
      ['a', 'b', 'c', 'd'].forEach((letter, index) => { $(`#q-option-${letter}`).value = options[index] || ''; });
      $('#q-correct-option').value = String(question.correct_option ?? 0);
      $('#q-answer-text').value = '';
    } else {
      $('#q-answer-text').value = question.answer_text || '';
      ['a', 'b', 'c', 'd'].forEach(letter => { $(`#q-option-${letter}`).value = ''; });
    }
    toggleQuestionModeFields();
    setText('#save-question-btn', 'Simpan perubahan');
    setHidden('#cancel-edit-btn', false);
    $('#q-prompt').focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleQuestionListClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const question = bankQuestions.find(item => item.id === button.dataset.id);
    if (!question) return;
    const action = button.dataset.action;
    if (action === 'edit') return loadQuestionIntoForm(question);
    if (action === 'toggle') {
      try {
        const { error } = await db.from('questions').update({ is_active: !question.is_active, updated_at: new Date().toISOString() }).eq('id', question.id);
        if (error) throw error;
        showToast(question.is_active ? 'Pertanyaan dinonaktifkan.' : 'Pertanyaan diaktifkan.', 'success');
        await loadQuestionBank();
      } catch (error) { showToast(errorMessage(error), 'error'); }
      return;
    }
    if (action === 'delete') {
      if (!window.confirm('Hapus pertanyaan ini dari bank? Snapshot soal pada ronde yang sudah selesai tetap disimpan.')) return;
      try {
        const { error } = await db.from('questions').delete().eq('id', question.id);
        if (error) throw error;
        if (editingQuestionId === question.id) resetQuestionForm();
        showToast('Pertanyaan dihapus.', 'success');
        await loadQuestionBank();
      } catch (error) { showToast(errorMessage(error), 'error'); }
    }
  }

  async function refreshOperatorState() {
    if (!operatorReady) return;
    try {
      const state = await fetchGameState();
      liveState = state;
      paintOperatorState(state);
      await loadPrivateAnswer(state);
    } catch (error) {
      showToast(errorMessage(error), 'error');
      setText('#operator-sync-label', 'Sinkronisasi gagal');
    }
  }

  function answerFromSnapshot(snapshot) {
    if (!snapshot) return '';
    if (snapshot.mode === 'multiple_choice') {
      const index = Number(snapshot.correct_option);
      const option = Array.isArray(snapshot.options) ? snapshot.options[index] : '';
      return `${String.fromCharCode(65 + index)}. ${option || ''}`.trim();
    }
    return snapshot.answer_text || '';
  }

  async function loadPrivateAnswer(state) {
    const target = $('#operator-answer-key');
    if (!target) return;
    if (!state || !state.active_round_id || !state.question_no || state.status === 'idle' || state.status === 'finished') {
      target.innerHTML = '<strong>Kunci belum tersedia</strong><p>Kunci jawaban hanya tampil di panel operator.</p>';
      return;
    }
    const { data, error } = await db.from('game_round_items').select('snapshot,resolved')
      .eq('round_id', state.active_round_id).eq('position_no', state.question_no).maybeSingle();
    if (error) {
      target.innerHTML = `<strong>Kunci tidak dapat dimuat</strong><p>${escapeHtml(errorMessage(error))}</p>`;
      return;
    }
    if (!data) return;
    const answer = answerFromSnapshot(data.snapshot);
    target.innerHTML = `<strong>${data.resolved ? 'Soal telah dinilai' : 'Kunci jawaban'}</strong><p class="answer-key">${escapeHtml(answer)}</p><p>${data.resolved ? 'Kunci sudah boleh dibahas dengan peserta.' : 'Jangan tampilkan panel ini di layar proyektor.'}</p>`;
  }

  function paintOperatorState(state) {
    if (!state) return;
    setText('#op-left-score', state.left_score ?? 0);
    setText('#op-right-score', state.right_score ?? 0);
    setText('#operator-sync-label', 'Tersinkron');
    const statusPill = $('#round-status-pill');
    if (statusPill) statusPill.textContent = state.status === 'playing' ? `Ronde ${state.round_no}` : state.status === 'finished' ? 'Selesai' : 'Siap';
    const status = $('#operator-status');
    if (status) {
      if (state.status === 'idle') {
        status.innerHTML = '<strong>Belum ada ronde berjalan</strong><p>Tambahkan minimal lima soal aktif, lalu mulai ronde baru.</p>';
      } else if (state.status === 'finished') {
        const winner = state.winner_side === 'left'
          ? `🏆 Tim Kiri memenangkan ronde ${state.round_no}!`
          : state.winner_side === 'right'
            ? `🏆 Tim Kanan memenangkan ronde ${state.round_no}!`
            : `🤝 Ronde ${state.round_no} berakhir seri.`;
        status.innerHTML = `<strong>${winner}</strong><p>Skor akhir: Tim Kiri ${state.left_score} — ${state.right_score} Tim Kanan. Mulai ronde baru untuk bermain lagi.</p>`;
      } else if (state.phase === 'result') {
        const result = state.last_result || {};
        const outcome = result.is_correct
          ? `Satu tarikan untuk <strong>${result.winner_side === 'left' ? 'Tim Kiri' : 'Tim Kanan'}</strong>.`
          : 'Skor tidak berubah. Kedua tim boleh mencoba lagi.';
        status.innerHTML = `<strong>Hasil soal ${state.question_no} / 5</strong><p>${result.is_correct ? 'Jawaban benar' : 'Jawaban belum tepat'} · ${outcome} ${state.question_no === 5 ? 'Selesaikan ronde untuk melihat pemenang.' : 'Lanjutkan ke soal berikutnya bila siap.'}</p>`;
      } else if (state.last_result && !state.last_result.is_correct) {
        const side = state.answering_side === 'left' ? 'Tim Kiri' : state.answering_side === 'right' ? 'Tim Kanan' : null;
        status.innerHTML = `<strong>Jawaban belum tepat · Soal ${state.question_no} / 5</strong><p>Skor tidak berubah. Kedua tim boleh mencoba lagi.${side ? ` Tim penjawab: <strong>${side}</strong>. Dengarkan jawaban lalu nilai kembali.` : ' Pilih Tim Kiri atau Tim Kanan untuk percobaan berikutnya.'}</p>`;
      } else {
        const side = state.answering_side === 'left' ? 'Tim Kiri' : state.answering_side === 'right' ? 'Tim Kanan' : 'belum dipilih';
        status.innerHTML = `<strong>Ronde ${state.round_no} · Soal ${state.question_no} / 5</strong><p>Tim penjawab: <strong>${side}</strong>. ${state.answering_side ? 'Dengarkan jawaban lalu nilai dengan tombol benar/salah.' : 'Pilih tim yang akan menjawab.'}</p>`;
      }
    }

    const isQuestion = state.status === 'playing' && state.phase === 'question';
    const isResult = state.status === 'playing' && state.phase === 'result';
    const left = $('#choose-left-btn');
    const right = $('#choose-right-btn');
    if (left) {
      left.disabled = !isQuestion;
      left.classList.toggle('selected-left', state.answering_side === 'left');
    }
    if (right) {
      right.disabled = !isQuestion;
      right.classList.toggle('selected-right', state.answering_side === 'right');
    }
    const correct = $('#mark-correct-btn');
    const wrong = $('#mark-wrong-btn');
    if (correct) correct.disabled = !isQuestion || !state.answering_side;
    if (wrong) wrong.disabled = !isQuestion || !state.answering_side;
    const advance = $('#advance-btn');
    if (advance) {
      advance.disabled = !isResult;
      advance.textContent = state.question_no === 5 && isResult ? '🏆 Akhiri ronde & tampilkan pemenang' : 'Soal berikutnya →';
    }
    const start = $('#start-round-btn');
    if (start) start.disabled = bankQuestions.filter(q => q.is_active).length < 5;
  }

  function attachOperatorRealtime() {
    if (!operatorReady || !db) return;
    if (operatorStateChannelName) return;
    operatorStateChannelName = `operator-game-state-${currentUser?.id || 'operator'}`;
    liveChannel = db.channel(operatorStateChannelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_state', filter: 'id=eq.1' }, async payload => {
        liveState = payload.new || null;
        paintOperatorState(liveState);
        await loadPrivateAnswer(liveState);
      })
      .subscribe(status => setText('#operator-sync-label', status === 'SUBSCRIBED' ? 'Tersinkron' : status === 'CHANNEL_ERROR' ? 'Koneksi terganggu' : 'Menghubungkan…'));
  }

  async function callOperatorRpc(name, args, successMessage) {
    try {
      const { error } = await db.rpc(name, args);
      if (error) throw error;
      if (successMessage) showToast(successMessage, 'success');
      await refreshOperatorState();
    } catch (error) {
      showToast(errorMessage(error), 'error');
    }
  }

  function shuffled(items) {
    const array = [...items];
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  async function startNewRound() {
    const activeQuestions = bankQuestions.filter(q => q.is_active);
    if (activeQuestions.length < 5) {
      showToast(`Perlu minimal 5 soal aktif. Saat ini ada ${activeQuestions.length}.`, 'error');
      return;
    }
    if (liveState?.status === 'playing' && !window.confirm('Ronde yang sedang berjalan akan dibatalkan dan diganti dengan 5 soal acak baru. Lanjutkan?')) return;
    const button = $('#start-round-btn');
    button.disabled = true;
    button.textContent = 'Mengacak soal…';
    try {
      const selected = shuffled(activeQuestions).slice(0, 5).map(q => q.id);
      const { error } = await db.rpc('start_new_round', { p_question_ids: selected });
      if (error) throw error;
      showToast('Ronde baru dimulai dengan 5 soal acak.', 'success');
      await refreshOperatorState();
    } catch (error) {
      showToast(errorMessage(error), 'error');
    } finally {
      if ($('#start-round-btn')) {
        $('#start-round-btn').textContent = '↻ Reset & acak 5 soal';
        $('#start-round-btn').disabled = bankQuestions.filter(q => q.is_active).length < 5;
      }
    }
  }

  async function advanceQuestion() {
    if (!liveState || liveState.phase !== 'result') return;
    const isFinal = liveState.question_no === 5;
    if (isFinal && !window.confirm('Selesaikan ronde dan tampilkan tim pemenang di layar kelas?')) return;
    await callOperatorRpc('advance_question', {}, isFinal ? 'Ronde selesai.' : 'Soal berikutnya ditampilkan.');
  }

  async function resetGame() {
    if (!window.confirm('Reset papan permainan? Skor dan soal yang sedang tampil akan dikosongkan. Bank pertanyaan tidak dihapus.')) return;
    await callOperatorRpc('reset_game', {}, 'Papan permainan direset.');
  }

  async function renderRoute() {
    clearLiveChannel();
    liveState = null;
    operatorReady = false;
    const route = (location.hash || '#home').replace(/^#\/?/, '').split('?')[0];
    if (route === 'display') return renderDisplayPage();
    if (route === 'operator') return renderOperatorPage();
    root.innerHTML = homeTemplate();
  }

  window.addEventListener('hashchange', renderRoute);
  renderRoute();
})();
