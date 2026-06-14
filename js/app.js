    const firebaseConfig = {
        apiKey: "AIzaSyD1xADf6KbttaSRl3bYuKEMUrQ4SJmTtH4",
        authDomain: "jamu-herbal-alami.firebaseapp.com",
        databaseURL: "https://jamu-herbal-alami-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "jamu-herbal-alami",
        storageBucket: "jamu-herbal-alami.firebasestorage.app",
        messagingSenderId: "770031966685",
        appId: "1:770031966685:web:dc20683776e310c0b0fe34"
    };

    try {
        firebase.initializeApp(firebaseConfig);
    } catch(e) { console.error('Firebase init error:', e); }

    const db = firebase.database();
    const auth = firebase.auth();
    const storage = firebase.storage();

    // GLOBALS
    let OWNER_WA = "6285187980564";
    let EXPIRY_TIME = 10 * 60 * 1000;
    let currentUser = null;
    let currentOrderListener = null;
    let allOrders = [];

    // ================= UTILITY =================
    function showToast(msg, type = 'success', icon = '') {
        const t = document.getElementById('toast');
        if(!t) return;
        const icons = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle' };
        t.className = `toast ${type}`;
        t.innerHTML = `<i class="fas ${icon || icons[type]}"></i> ${msg}`;
        t.style.display = 'flex';
        clearTimeout(t._timer);
        t._timer = setTimeout(() => { t.style.display = 'none'; }, 3500);
    }

    function formatRp(n) {
        return 'Rp ' + Number(n).toLocaleString('id-ID');
    }

    function formatWA(n) {
        if(!n) return '';
        let c = n.replace(/\D/g, '');
        if(c.startsWith('0')) c = '62' + c.substring(1);
        return c;
    }

    async function generateKode() {
        const now = new Date();
        const dd = String(now.getDate()).padStart(2, '0');
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const yy = String(now.getFullYear()).slice(-2);
        const prefix = `HBJ-${dd}${mm}${yy}`;

        // Cari nomor urut yang belum dipakai
        const snap = await db.ref('pesanan')
            .orderByChild('kode')
            .startAt(prefix)
            .endAt(prefix + '\uf8ff')
            .once('value');

        const existing = snap.val() ? Object.values(snap.val()).map(o => o.kode) : [];
        let counter = 1;
        let kode;
        do {
            kode = `${prefix}-${String(counter).padStart(3, '0')}`;
            counter++;
        } while (existing.includes(kode));
        return kode;
    }

    // ================= AUTH SYSTEM =================
    // ================= AUTH SYSTEM =================
    auth.onAuthStateChanged(async user => {
        currentUser = user;
        updateNavForUser(user);

        if (user) {
            // Check role from Firebase DB
            try {
                const snap = await db.ref('users/' + user.uid + '/role').once('value');
                const role = snap.val();
                const adminLink = document.getElementById('adminMenuLink');
                if (adminLink) {
                    adminLink.style.display = (role === 'admin') ? 'flex' : 'none';
                }
                const footerAdmin = document.getElementById('footerAdminLink');
                if (footerAdmin) {
                    footerAdmin.style.display = (role === 'admin') ? 'inline' : 'none';
                }
            } catch(e) {}
        } else {
            const footerAdmin = document.getElementById('footerAdminLink');
            if (footerAdmin) footerAdmin.style.display = 'none';
        }
    });

    function updateNavForUser(user) {
        const navGuest = document.getElementById('navGuest');
        const navUser = document.getElementById('navUser');
        const navUserName = document.getElementById('navUserName');
        const navAvatar = document.getElementById('navAvatar');

        if(user) {
            if(navGuest) navGuest.style.display = 'none';
            if(navUser) navUser.style.display = 'flex';
            const name = user.displayName || user.email.split('@')[0];
            if(navUserName) navUserName.textContent = name;
            if(navAvatar) navAvatar.textContent = name.charAt(0).toUpperCase();
        } else {
            if(navGuest) navGuest.style.display = 'flex';
            if(navUser) navUser.style.display = 'none';
        }
    }

    // ================= AUTH MODALS =================
    function bukaAuthModal(tab = 'login') {
        document.getElementById('authModal').classList.add('show');
        switchAuthTab(tab);
    }

    function tutupAuthModal() {
        document.getElementById('authModal').classList.remove('show');
        document.getElementById('authLoginForm').reset();
        document.getElementById('authRegisterForm').reset();
        document.getElementById('authForgotForm').reset();
        const notice = document.getElementById('loginNotice');
        if(notice) notice.style.display = 'none';
        // Kalau tutup modal tanpa login, buang pending order
        pendingOrder = null;
        hideAllAuthPanels();
        showPanel('panelLogin');
        hideErrors();
    }

    function switchAuthTab(tab) {
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');
        hideAllAuthPanels();
        if(tab === 'login') showPanel('panelLogin');
        else if(tab === 'daftar') showPanel('panelDaftar');
        // Sembunyikan notice kalau pindah tab
        if(tab !== 'login') {
            const notice = document.getElementById('loginNotice');
            if(notice) notice.style.display = 'none';
        }
        hideErrors();
    }

    function showPanel(id) {
        document.getElementById(id).style.display = 'block';
    }

    function hideAllAuthPanels() {
        ['panelLogin','panelDaftar','panelForgot'].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.style.display = 'none';
        });
    }

    function showForgot() {
        hideAllAuthPanels();
        showPanel('panelForgot');
    }

    function backToLogin() {
        hideAllAuthPanels();
        showPanel('panelLogin');
    }

    function hideErrors() {
        document.querySelectorAll('.error-text').forEach(e => e.classList.remove('show'));
    }

    function showError(id, msg) {
        const el = document.getElementById(id);
        if(el) { el.textContent = msg; el.classList.add('show'); }
    }

    // LOGIN
    async function doLogin(e) {
        e.preventDefault();
        hideErrors();
        const email = document.getElementById('loginEmail').value.trim();
        const pass = document.getElementById('loginPass').value;
        const btn = document.getElementById('btnLogin');

        if(!email || !pass) { showError('loginError', 'Email dan password wajib diisi!'); return; }

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Masuk...';

        try {
            await auth.signInWithEmailAndPassword(email, pass);
            showToast('✅ Selamat datang kembali!', 'success');
            tutupAuthModal();
            resumePendingOrder();
        } catch(err) {
            const msgs = {
                'auth/user-not-found': 'Email tidak terdaftar',
                'auth/wrong-password': 'Password salah',
                'auth/invalid-email': 'Format email tidak valid',
                'auth/too-many-requests': 'Terlalu banyak percobaan. Coba lagi nanti.',
                'auth/invalid-credential': 'Email atau password salah'
            };
            showError('loginError', msgs[err.code] || err.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Masuk';
        }
    }

    // REGISTER
    async function doRegister(e) {
        e.preventDefault();
        hideErrors();
        const nama = document.getElementById('regNama').value.trim();
        const email = document.getElementById('regEmail').value.trim();
        const pass = document.getElementById('regPass').value;
        const passConfirm = document.getElementById('regPassConfirm').value;
        const btn = document.getElementById('btnRegister');

        if(!nama) { showError('regError', 'Nama lengkap wajib diisi!'); return; }
        if(!email) { showError('regError', 'Email wajib diisi!'); return; }
        if(pass.length < 6) { showError('regError', 'Password minimal 6 karakter!'); return; }
        if(pass !== passConfirm) { showError('regError', 'Konfirmasi password tidak cocok!'); return; }

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mendaftar...';

        try {
            const cred = await auth.createUserWithEmailAndPassword(email, pass);
            await cred.user.updateProfile({ displayName: nama });
            await db.ref('users/' + cred.user.uid).set({
                nama, email,
                createdAt: Date.now(),
                role: 'user'
            });
            showToast('🎉 Akun berhasil dibuat! Selamat datang, ' + nama, 'success');
            tutupAuthModal();
            resumePendingOrder();
        } catch(err) {
            const msgs = {
                'auth/email-already-in-use': 'Email sudah terdaftar, silakan login',
                'auth/invalid-email': 'Format email tidak valid',
                'auth/weak-password': 'Password terlalu lemah'
            };
            showError('regError', msgs[err.code] || err.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-user-plus"></i> Daftar Sekarang';
        }
    }

    // Lanjut order setelah login/daftar
    function resumePendingOrder() {
        if (pendingOrder) {
            const { produkId, produkNama, produkHarga } = pendingOrder;
            pendingOrder = null;
            setTimeout(() => _bukaOrderModalInternal(produkId, produkNama, produkHarga), 400);
        }
    }

    // LUPA SANDI
    async function doForgotPass(e) {
        e.preventDefault();
        hideErrors();
        const email = document.getElementById('forgotEmail').value.trim();
        const btn = document.getElementById('btnForgot');

        if(!email) { showError('forgotError', 'Masukkan alamat email!'); return; }

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengirim...';

        try {
            await auth.sendPasswordResetEmail(email);
            document.getElementById('forgotSuccess').style.display = 'block';
            showToast('📧 Email reset dikirim! Cek inbox Anda.', 'info');
        } catch(err) {
            const msgs = {
                'auth/user-not-found': 'Email tidak terdaftar',
                'auth/invalid-email': 'Format email tidak valid'
            };
            showError('forgotError', msgs[err.code] || err.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-paper-plane"></i> Kirim Link Reset';
        }
    }

    // Go to admin — double check role before redirect
    async function goToAdmin() {
        if (!currentUser) { bukaAuthModal('login'); return; }
        closeDropdown();
        try {
            const snap = await db.ref('users/' + currentUser.uid + '/role').once('value');
            if (snap.val() === 'admin') {
                window.location.href = 'admin.html';
            } else {
                showToast('⛔ Akses ditolak. Bukan admin.', 'error');
            }
        } catch(e) {
            showToast('❌ Gagal verifikasi role', 'error');
        }
    }

    // LOGOUT
    async function doLogout() {
        await auth.signOut();
        closeDropdown();
        showToast('👋 Berhasil keluar', 'info');
    }

    // GOOGLE LOGIN — works for both login and register panels
    async function loginGoogle() {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.addScope('profile');
        provider.addScope('email');
        // Force account picker tiap kali
        provider.setCustomParameters({ prompt: 'select_account' });

        // Disable semua tombol Google sementara
        document.querySelectorAll('[onclick="loginGoogle()"]').forEach(b => {
            b.disabled = true;
            b.innerHTML = '<div class="spinner" style="width:18px;height:18px;border-width:2px;margin:0 auto"></div>';
        });

        try {
            const result = await auth.signInWithPopup(provider);
            const user = result.user;

            // Simpan atau update data user di DB
            const snap = await db.ref('users/' + user.uid).once('value');
            if (!snap.exists()) {
                await db.ref('users/' + user.uid).set({
                    nama: user.displayName || '',
                    email: user.email || '',
                    foto: user.photoURL || '',
                    createdAt: Date.now(),
                    role: 'user'
                });
            } else {
                // Update foto jika berubah
                await db.ref('users/' + user.uid).update({
                    foto: user.photoURL || '',
                    lastLogin: Date.now()
                });
            }

            const isNew = result.additionalUserInfo?.isNewUser;
            showToast(
                isNew ? '🎉 Akun Google berhasil dibuat!' : '✅ Login Google berhasil!',
                'success'
            );
            tutupAuthModal();
            resumePendingOrder();

        } catch(err) {
            const msgs = {
                'auth/popup-closed-by-user': 'Login dibatalkan.',
                'auth/popup-blocked': 'Popup diblokir browser. Izinkan popup untuk situs ini.',
                'auth/cancelled-popup-request': null, // silent
                'auth/account-exists-with-different-credential': 'Email ini sudah terdaftar dengan metode lain.'
            };
            const msg = msgs[err.code];
            if (msg !== null) {
                showToast('❌ ' + (msg || err.message), 'error');
            }
        } finally {
            document.querySelectorAll('[onclick="loginGoogle()"]').forEach(b => {
                b.disabled = false;
                b.innerHTML = `<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" class="w-5 h-5"> Lanjutkan dengan Google`;
            });
        }
    }

    // PASSWORD STRENGTH
    function checkStrength(pass) {
        let score = 0;
        if(pass.length >= 6) score++;
        if(pass.length >= 10) score++;
        if(/[A-Z]/.test(pass)) score++;
        if(/[0-9]/.test(pass)) score++;
        if(/[^A-Za-z0-9]/.test(pass)) score++;

        const fill = document.getElementById('strengthFill');
        const text = document.getElementById('strengthText');
        if(!fill) return;

        const levels = [
            { color: '#ef4444', label: 'Sangat Lemah', pct: '20%' },
            { color: '#f97316', label: 'Lemah', pct: '40%' },
            { color: '#eab308', label: 'Cukup', pct: '60%' },
            { color: '#22c55e', label: 'Kuat', pct: '80%' },
            { color: '#166534', label: 'Sangat Kuat', pct: '100%' }
        ];
        const l = levels[Math.min(score, 4)];
        fill.style.width = l.pct;
        fill.style.background = l.color;
        if(text) text.textContent = pass ? l.label : '';
    }

    // ================= DROPDOWN =================
    function toggleDropdown() {
        document.getElementById('userDropdown').classList.toggle('show');
    }
    function closeDropdown() {
        document.getElementById('userDropdown')?.classList.remove('show');
    }
    document.addEventListener('click', e => {
        if(!e.target.closest('#navUser')) closeDropdown();
    });

    // ================= PRODUK =================
    function generateFotoHTML(foto) {
        if(!foto) return `<div class="product-img-wrapper"><div class="flex items-center justify-center h-52 bg-green-50 text-green-200"><i class="fas fa-leaf text-6xl"></i></div></div>`;
        let urls = Array.isArray(foto) ? foto : (foto.includes(',') ? foto.split(',').map(u=>u.trim()) : [foto]);
        urls = urls.filter(Boolean);
        if(!urls.length) return '';
        return `<div class="product-img-wrapper">
            <img src="${urls[0]}" alt="Produk" class="w-full h-52 object-cover" onclick="bukaFotoModal('${urls[0]}')"
                 onerror="this.src='https://placehold.co/400x220/dcfce7/166534?text=Jamu+Herbal'">
            ${urls.length > 1 ? `<div class="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded-full"><i class="fas fa-images mr-1"></i>${urls.length} foto</div>` : ''}
        </div>`;
    }

    function loadProduk() {
        const c = document.getElementById('produkList');
        if(!c) return;
        c.innerHTML = `<div class="col-span-3 text-center py-16"><div class="spinner mx-auto mb-4"></div><p class="text-gray-500">Memuat produk...</p></div>`;

        db.ref('produk').once('value').then(snap => {
            const data = snap.val();
            if(!data) { c.innerHTML = `<div class="col-span-3 text-center py-16 text-gray-400"><i class="fas fa-seedling text-5xl mb-4 opacity-30"></i><p>Belum ada produk tersedia</p></div>`; return; }

            let html = '';
            let total = 0;
            Object.entries(data).forEach(([key, p]) => {
                if(!p || typeof p !== 'object') return;
                total += Number(p.terjual) || 0;
                const harga = p.harga && !isNaN(p.harga) ? Number(p.harga) : null;
                const stars = Array(5).fill(0).map((_,i) => `<i class="fa-${i < (p.rating||4) ? 'solid' : 'regular'} fa-star text-amber-400 text-sm"></i>`).join('');

                html += `
                <div class="product-card fade-in-up">
                    ${generateFotoHTML(p.foto)}
                    ${p.terjual > 0 ? `<div class="badge-terjual"><i class="fas fa-fire-flame-curved mr-1"></i>${p.terjual} terjual</div>` : ''}
                    <div class="p-5">
                        <h3 class="font-bold text-lg text-gray-800 mb-2">${p.nama || 'Produk'}</h3>
                        <p class="text-gray-500 text-sm mb-3 leading-relaxed" style="white-space:pre-line;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">${p.deskripsi || ''}</p>
                        <div class="flex items-center mb-4">${stars}<span class="text-xs text-gray-400 ml-2">(${p.ulasanCount||0})</span></div>
                        <div class="flex items-center justify-between mb-4">
                            <span class="text-2xl font-bold text-green-700">${harga ? formatRp(harga) : 'Hubungi WA'}</span>
                        </div>
                        ${harga ?
                            `<button onclick="bukaOrderModal('${key}','${(p.nama||'').replace(/'/g,"\\'")}',${harga})"
                                class="btn-primary w-full justify-center group">
                                <i class="fas fa-shopping-cart"></i>Beli Sekarang
                            </button>` :
                            `<button onclick="chatWA('${(p.nama||'').replace(/'/g,"\\'")}',null)" class="btn-wa w-full justify-center"><i class="fab fa-whatsapp"></i>Chat WA</button>`
                        }
                    </div>
                </div>`;
            });
            c.innerHTML = html;
            const tb = document.getElementById('totalTerjual');
            if(tb) tb.textContent = total + ' Terjual';
        }).catch(() => {
            c.innerHTML = `<div class="col-span-3 text-center py-16 text-gray-400"><p>Gagal memuat produk. <button onclick="loadProduk()" class="text-green-600 underline">Coba lagi</button></p></div>`;
        });
    }

    // ================= TESTIMONI =================
    function loadTestimoni() {
        const c = document.getElementById('testimoniList');
        if(!c) return;
        // Ambil SEMUA testimoni untuk hitung avg rating, tapi tampil 6 terbaru
        db.ref('testimoni').orderByChild('waktu').once('value').then(snap => {
            const data = snap.val();
            if(!data) {
                c.innerHTML = `<div class="col-span-3 text-center py-12 text-gray-400"><i class="far fa-star text-5xl mb-4 opacity-30"></i><p>Belum ada testimoni</p></div>`;
                return;
            }
            const all = Object.values(data);

            // Hitung rata-rata rating dari SEMUA testimoni
            const ratingVals = all.map(t => Number(t.rating) || 5).filter(r => r > 0);
            const avgRating = ratingVals.length
                ? (ratingVals.reduce((a,b) => a+b, 0) / ratingVals.length).toFixed(1)
                : '5.0';
            const totalUlasan = ratingVals.length;

            // Update hero rating
            const heroRatingEl = document.getElementById('heroRatingVal');
            const heroUlasanEl = document.getElementById('heroUlasanCount');
            if(heroRatingEl) heroRatingEl.textContent = '⭐' + avgRating;
            if(heroUlasanEl) heroUlasanEl.textContent = totalUlasan + ' Ulasan';

            // Tampil 6 terbaru
            const list = all.reverse().slice(0, 6);
            c.innerHTML = list.map(t => `
                <div class="testimoni-card">
                    <div class="flex items-center mb-3">
                        <img src="${t.foto || 'https://ui-avatars.com/api/?name='+encodeURIComponent(t.nama||'U')+'&background=dcfce7&color=166534&bold=true'}"
                             class="w-12 h-12 rounded-full object-cover mr-3 border-2 border-green-100">
                        <div>
                            <p class="font-semibold text-gray-800">${t.nama||'Pembeli'}</p>
                            <div>${Array(5).fill(0).map((_,i) => `<i class="fa-${i<(t.rating||5)?'solid':'regular'} fa-star text-amber-400 text-xs"></i>`).join('')}</div>
                        </div>
                    </div>
                    <p class="text-gray-600 text-sm leading-relaxed mb-3">"${t.ulasan||''}"</p>
                    <p class="text-xs text-gray-400"><i class="fas fa-tag mr-1 text-green-500"></i>${t.produk||'Jamu Herbal'}</p>
                </div>`).join('');
        });
    }

    // ================= ORDER =================
    function chatWA(nama, harga) {
        const pesan = harga
            ? `Halo kak, saya mau tanya produk *${nama}* harga Rp ${Number(harga).toLocaleString()}. Bisa info lebih lanjut? 🌿`
            : `Halo kak, saya mau tanya tentang produk *${nama}*. Mohon info harga dan cara pemesanannya 🌿`;
        window.open(`https://wa.me/${OWNER_WA}?text=${encodeURIComponent(pesan)}`, '_blank');
    }

    // Simpan pending order jika user belum login
    let pendingOrder = null;

    function bukaOrderModal(produkId, produkNama, produkHarga) {
        // Wajib login untuk beli
        if (!currentUser) {
            // Simpan intent order, buka modal login
            pendingOrder = { produkId, produkNama, produkHarga };
            // Tampilkan pesan di auth modal
            bukaAuthModal('login');
            // Tampilkan notif kecil
            setTimeout(() => {
                const notice = document.getElementById('loginNotice');
                if (notice) {
                    notice.style.display = 'block';
                    notice.innerHTML = `<i class="fas fa-lock mr-2"></i>Login dulu untuk membeli <strong>${produkNama}</strong>`;
                }
            }, 100);
            return;
        }

        // User sudah login — buka modal order
        _bukaOrderModalInternal(produkId, produkNama, produkHarga);
    }

    function _bukaOrderModalInternal(produkId, produkNama, produkHarga) {
        document.getElementById('orderProdukId').value = produkId;
        document.getElementById('orderProdukHarga').value = produkHarga;
        document.getElementById('orderProdukNama').value = produkNama;
        document.getElementById('orderProductInfo').innerHTML = `
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600"><i class="fas fa-leaf"></i></div>
                <div>
                    <p class="font-bold text-gray-800">${produkNama}</p>
                    <p class="text-green-600 font-semibold">${formatRp(produkHarga)}</p>
                </div>
            </div>`;

        // Auto-fill nama dan WA dari profil user
        document.getElementById('orderNama').value = currentUser.displayName || '';
        // Coba ambil nomor WA dari DB jika ada
        db.ref('users/' + currentUser.uid + '/wa').once('value').then(snap => {
            if (snap.val()) document.getElementById('orderWA').value = snap.val();
        });

        document.getElementById('orderQty').value = 1;
        hitungTotal();
        document.getElementById('orderModal').classList.add('show');
    }

    function tutupOrderModal() {
        document.getElementById('orderModal').classList.remove('show');
        document.getElementById('orderForm').reset();
    }

    function hitungTotal() {
        const harga = Number(document.getElementById('orderProdukHarga').value) || 0;
        const qty = Number(document.getElementById('orderQty').value) || 1;
        document.getElementById('orderTotal').textContent = formatRp(harga * qty);
    }

    async function submitOrder(e) {
        e.preventDefault();
        const nama = document.getElementById('orderNama').value.trim();
        const wa = document.getElementById('orderWA').value.trim();
        const alamat = document.getElementById('orderAlamat').value.trim();
        const qty = Number(document.getElementById('orderQty').value);
        const produkId = document.getElementById('orderProdukId').value;
        const produkHarga = Number(document.getElementById('orderProdukHarga').value);
        const produkNama = document.getElementById('orderProdukNama').value;

        if(!nama || !wa || !alamat || !qty) { showToast('Semua field wajib diisi!', 'error'); return; }

        const btn = document.getElementById('btnOrder');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memproses...';

        const kode = await generateKode();
        const total = produkHarga * qty;

        const orderData = {
            kode, nama, wa: formatWA(wa), alamat,
            produkId, produkNama, produkHarga,
            jumlah: qty, total,
            status: 'menunggu-pembayaran',
            waktu: Date.now(),
            userId: currentUser ? currentUser.uid : null,
            riwayatStatus: [{ status: 'menunggu-pembayaran', waktu: Date.now(), catatan: 'Pesanan dibuat' }]
        };

        try {
            await db.ref('pesanan').push(orderData);

            // Cek rekening dari db
            const rekSnap = await db.ref('pengaturan/rekening').once('value');
            const rek = rekSnap.val() || { bank: 'BCA', nomor: '1234567890', nama: 'Jamu Herbal Alami' };

            // Tampilkan modal sukses dengan info pembayaran
            tutupOrderModal();
            tampilkanModalSukses(kode, total, rek, produkNama, nama);

        } catch(err) {
            showToast('❌ Gagal membuat pesanan: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-check-circle"></i> Konfirmasi Order';
        }
    }

    function tampilkanModalSukses(kode, total, rek, produk, nama) {
        document.getElementById('successKode').textContent = kode;
        document.getElementById('successTotal').textContent = formatRp(total);
        document.getElementById('successRek').innerHTML = `
            <div class="rekening-card">
                <p class="text-white text-opacity-80 text-sm mb-1">Transfer ke rekening</p>
                <p class="text-2xl font-bold font-mono">${rek.bank} • ${rek.nomor}</p>
                <p class="text-sm mt-1">a.n. ${rek.nama}</p>
                <p class="text-2xl font-bold mt-3">${formatRp(total)}</p>
            </div>`;
        document.getElementById('successModal').classList.add('show');

        // Auto WA
        const pesanWA = `📋 *PESANAN BARU - ${kode}*\n\n` +
            `Halo kak, saya sudah order:\n` +
            `• Produk: ${produk}\n• Total: ${formatRp(total)}\n\n` +
            `Apakah sudah bisa saya transfer ke ${rek.bank} ${rek.nomor}?\n\n` +
            `Terima kasih 🌿`;
        document.getElementById('btnSuccessWA').onclick = () => window.open(`https://wa.me/${OWNER_WA}?text=${encodeURIComponent(pesanWA)}`, '_blank');
    }

    function copyKode(id) {
        const el = document.getElementById(id);
        navigator.clipboard.writeText(el.textContent).then(() => showToast('✅ ID disalin!', 'success'));
    }

    // ================= CEK PESANAN =================

    // Sensor helper — sembunyikan sebagian karakter
    function sensorTeks(str, tampilAwal = 3, tampilAkhir = 2) {
        if (!str) return '***';
        str = String(str);
        if (str.length <= tampilAwal + tampilAkhir) {
            return str.charAt(0) + '•'.repeat(str.length - 1);
        }
        const awal  = str.substring(0, tampilAwal);
        const akhir = str.substring(str.length - tampilAkhir);
        const bintang = '•'.repeat(Math.min(str.length - tampilAwal - tampilAkhir, 6));
        return awal + bintang + akhir;
    }

    function sensorWA(wa) {
        // "628512345678" → "6285••••5678"
        if (!wa) return '***';
        const s = String(wa);
        if (s.length < 8) return s.charAt(0) + '•'.repeat(s.length - 1);
        return s.substring(0, 4) + '••••' + s.substring(s.length - 4);
    }

    function sensorAlamat(alamat) {
        if (!alamat) return '***';
        const str = String(alamat);
        const potong = Math.min(str.length, 12);
        return str.substring(0, potong) + '•••••••';
    }

    function cekPesanan() {
        const id = document.getElementById('cekId').value.trim();
        if(!id) { showToast('Masukkan ID pesanan!', 'error'); return; }

        const r = document.getElementById('cekResult');
        r.innerHTML = `<div class="text-center py-8"><div class="spinner mx-auto"></div></div>`;
        r.style.display = 'block';

        db.ref('pesanan').orderByChild('kode').equalTo(id).once('value').then(snap => {
            const data = snap.val();
            if (!data) {
                r.innerHTML = `<div class="text-center py-6 text-red-500">
                    <i class="fas fa-times-circle text-3xl mb-2"></i>
                    <p class="font-semibold">ID pesanan tidak ditemukan</p>
                </div>`;
                return;
            }

            const [orderId, order] = Object.entries(data)[0];

            // === CEK APAKAH PEMILIK PESANAN ===
            // Pemilik = user yang login DAN userId pada pesanan cocok dengan UID-nya
            const isPemilik = currentUser && order.userId && currentUser.uid === order.userId;

            const statusMap = {
                'menunggu-pembayaran': { label: '💰 Menunggu Pembayaran', cls: 's-menunggu' },
                'proses':              { label: '⚙️ Sedang Diproses',     cls: 's-proses'   },
                'dikirim':             { label: '📦 Dalam Pengiriman',    cls: 's-dikirim'  },
                'selesai':             { label: '✅ Pesanan Selesai',      cls: 's-selesai'  },
                'ditolak':             { label: '❌ Ditolak',              cls: 's-ditolak'  },
                'kadaluarsa':          { label: '⏰ Kadaluarsa',           cls: 's-kadaluarsa' }
            };
            const s = statusMap[order.status] || statusMap['menunggu-pembayaran'];

            // Countdown untuk menunggu pembayaran
            const countdownHtml = order.status === 'menunggu-pembayaran'
                ? `<div class="mt-3"><span class="countdown" data-expire="${order.waktu + EXPIRY_TIME}">
                       <i class="fas fa-hourglass-half mr-1"></i>Menghitung...
                   </span></div>`
                : '';

            // Riwayat status
            let riwayatHtml = '';
            if (order.riwayatStatus) {
                riwayatHtml = `<div class="mt-4 border-t pt-4">
                    <p class="font-semibold text-sm text-gray-700 mb-3">Riwayat Status</p>`;
                order.riwayatStatus.slice().reverse().forEach(rv => {
                    riwayatHtml += `<div class="flex gap-3 mb-2">
                        <div class="w-2 h-2 rounded-full bg-green-500 mt-1.5 shrink-0"></div>
                        <div>
                            <p class="text-sm font-medium">${statusMap[rv.status]?.label || rv.status}</p>
                            <p class="text-xs text-gray-400">${new Date(rv.waktu).toLocaleString('id-ID')}</p>
                            ${rv.catatan ? `<p class="text-xs text-gray-500">${rv.catatan}</p>` : ''}
                        </div>
                    </div>`;
                });
                riwayatHtml += '</div>';
            }

            // === SENSOR / TAMPIL PENUH BERDASARKAN isPemilik ===
            const tampilWA     = isPemilik ? order.wa     : sensorWA(order.wa);
            const tampilAlamat = isPemilik ? order.alamat : sensorAlamat(order.alamat);
            const tampilNama   = isPemilik ? order.nama   : sensorTeks(order.nama, 2, 1);

            // Banner sensor — muncul kalau bukan pemilik
            const sensorBanner = !isPemilik ? `
                <div class="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl p-3 mb-4 text-xs text-gray-500">
                    <i class="fas fa-shield-halved text-gray-400 text-base shrink-0"></i>
                    <span>Data pribadi disembunyikan.
                    ${currentUser
                        ? 'Pesanan ini bukan milik akun Anda.'
                        : '<button onclick="bukaAuthModal(\'login\')" class="text-green-600 font-semibold underline">Login</button> untuk lihat data lengkap jika ini pesanan Anda.'}
                    </span>
                </div>` : '';

            // Info pembayaran (rekening) — hanya tampil untuk pemilik & status menunggu
            let paymentHtml = '';
            if (isPemilik && order.status === 'menunggu-pembayaran') {
                db.ref('pengaturan/rekening').once('value').then(rekSnap => {
                    const rek = rekSnap.val();
                    if (!rek) return;
                    const payEl = document.getElementById('cekPaymentInfo');
                    if (payEl) payEl.innerHTML = `
                        <div class="rekening-card mt-3">
                            <p class="text-white text-opacity-80 text-xs mb-1">Transfer ke rekening</p>
                            <p class="text-xl font-bold font-mono">${rek.bank} • ${rek.nomor}</p>
                            <p class="text-sm mt-1">a.n. ${rek.nama}</p>
                            <p class="text-xl font-bold mt-2">${formatRp(order.total)}</p>
                        </div>`;
                });
                paymentHtml = `<div id="cekPaymentInfo"></div>`;
            }

            r.innerHTML = `
                <div class="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    ${sensorBanner}
                    <div class="flex justify-between items-start mb-4">
                        <div>
                            <p class="text-xs text-gray-400 mb-1">ID Pesanan</p>
                            <p class="font-mono font-bold text-lg text-gray-800">${order.kode}</p>
                        </div>
                        <span class="status-badge ${s.cls}">${s.label}</span>
                    </div>
                    ${countdownHtml}
                    ${paymentHtml}
                    <div class="grid grid-cols-2 gap-3 my-4 text-sm">
                        <div>
                            <p class="text-gray-400 text-xs">Nama</p>
                            <p class="font-semibold flex items-center gap-1">
                                ${tampilNama}
                                ${!isPemilik ? '<i class="fas fa-lock text-gray-300 text-xs"></i>' : ''}
                            </p>
                        </div>
                        <div>
                            <p class="text-gray-400 text-xs">WhatsApp</p>
                            <p class="font-semibold flex items-center gap-1">
                                ${tampilWA}
                                ${!isPemilik ? '<i class="fas fa-lock text-gray-300 text-xs"></i>' : ''}
                            </p>
                        </div>
                        <div>
                            <p class="text-gray-400 text-xs">Alamat</p>
                            <p class="font-semibold flex items-center gap-1">
                                ${tampilAlamat}
                                ${!isPemilik ? '<i class="fas fa-lock text-gray-300 text-xs"></i>' : ''}
                            </p>
                        </div>
                        <div>
                            <p class="text-gray-400 text-xs">Produk</p>
                            <p class="font-semibold">${order.produkNama}</p>
                        </div>
                        <div>
                            <p class="text-gray-400 text-xs">Jumlah</p>
                            <p class="font-semibold">${order.jumlah} pcs</p>
                        </div>
                        <div>
                            <p class="text-gray-400 text-xs">Total</p>
                            <p class="font-bold text-green-700">${formatRp(order.total)}</p>
                        </div>
                    </div>
                    ${riwayatHtml}
                    ${isPemilik && order.status === 'selesai' && !order.dapatUlasan ? `
                    <button onclick="bukaReviewModal('${orderId}','${order.produkId}','${order.produkNama}')"
                        class="btn-primary w-full justify-center mt-4">
                        <i class="fas fa-star"></i> Berikan Ulasan
                    </button>` : ''}
                </div>`;

            startCountdowns();
        });
    }

    function startCountdowns() {
        setInterval(() => {
            document.querySelectorAll('.countdown[data-expire]').forEach(el => {
                const sisa = el.dataset.expire - Date.now();
                if(sisa > 0) {
                    const m = Math.floor(sisa / 60000);
                    const s = Math.floor((sisa % 60000) / 1000);
                    el.innerHTML = `<i class="fas fa-hourglass-half mr-1"></i>Sisa: ${m}:${s.toString().padStart(2,'0')}`;
                } else {
                    el.innerHTML = `<i class="fas fa-hourglass-end mr-1"></i>Kadaluarsa`;
                    el.style.background = '#f1f5f9';
                    el.style.color = '#94a3b8';
                }
            });
        }, 1000);
    }

    // ================= RIWAYAT PESANAN USER =================
    function bukaRiwayatUser() {
        if(!currentUser) { bukaAuthModal('login'); return; }
        closeDropdown();
        document.getElementById('riwayatModal').classList.add('show');
        loadRiwayatUser();
    }

    function loadRiwayatUser(filter = 'all') {
        if(!currentUser) return;
        const c = document.getElementById('riwayatList');
        c.innerHTML = `<div class="text-center py-8"><div class="spinner mx-auto"></div></div>`;

        db.ref('pesanan').orderByChild('userId').equalTo(currentUser.uid).once('value').then(snap => {
            const data = snap.val();
            if(!data) { c.innerHTML = `<div class="text-center py-12 text-gray-400"><i class="fas fa-box-open text-4xl mb-3 opacity-30"></i><p>Belum ada pesanan</p></div>`; return; }

            let orders = Object.entries(data).map(([id, o]) => ({...o, id})).reverse();
            if(filter !== 'all') orders = orders.filter(o => o.status === filter);

            const statusMap = {
                'menunggu-pembayaran': { label: '💰 Menunggu Bayar', cls: 's-menunggu' },
                'proses': { label: '⚙️ Diproses', cls: 's-proses' },
                'dikirim': { label: '📦 Dikirim', cls: 's-dikirim' },
                'selesai': { label: '✅ Selesai', cls: 's-selesai' },
                'ditolak': { label: '❌ Ditolak', cls: 's-ditolak' },
                'kadaluarsa': { label: '⏰ Kadaluarsa', cls: 's-kadaluarsa' }
            };

            if(!orders.length) { c.innerHTML = `<div class="text-center py-12 text-gray-400"><p>Tidak ada pesanan dengan filter ini</p></div>`; return; }

            c.innerHTML = orders.map(o => {
                const s = statusMap[o.status] || statusMap['menunggu-pembayaran'];
                return `
                <div class="bg-gray-50 rounded-2xl p-4 mb-3 border border-gray-100">
                    <div class="flex justify-between items-center mb-2">
                        <p class="font-mono text-sm font-bold text-gray-700">${o.kode}</p>
                        <span class="status-badge ${s.cls}">${s.label}</span>
                    </div>
                    <p class="font-semibold text-gray-800">${o.produkNama}</p>
                    <div class="flex justify-between items-center mt-2 text-sm">
                        <span class="text-gray-400">${new Date(o.waktu).toLocaleDateString('id-ID')}</span>
                        <span class="font-bold text-green-700">${formatRp(o.total)}</span>
                    </div>
                    ${o.status === 'selesai' && !o.dapatUlasan ? `
                    <button onclick="bukaReviewModal('${o.id}','${o.produkId}','${o.produkNama}')" class="mt-3 w-full btn-secondary text-sm py-2 justify-center">
                        <i class="fas fa-star"></i> Ulasan
                    </button>` : ''}
                </div>`;
            }).join('');
        });
    }

    // ================= REVIEW =================
    let reviewRating = 0;
    function bukaReviewModal(orderId, produkId, produkNama) {
        document.getElementById('revOrderId').value = orderId;
        document.getElementById('revProdukId').value = produkId;
        document.getElementById('revProdukNama').textContent = produkNama;
        reviewRating = 0;
        renderStars(0);
        document.getElementById('revUlasan').value = '';
        document.getElementById('reviewModal').classList.add('show');
        document.getElementById('riwayatModal').classList.remove('show');
    }

    function renderStars(r) {
        document.querySelectorAll('.rev-star').forEach((s, i) => {
            s.className = `rev-star fas fa-star text-3xl cursor-pointer transition-all ${i < r ? 'text-amber-400' : 'text-gray-200'}`;
        });
    }

    async function submitReview() {
        if(!currentUser) { showToast('Login dahulu untuk memberikan ulasan!', 'error'); return; }
        if(!reviewRating) { showToast('Pilih rating dahulu!', 'error'); return; }
        const ulasan = document.getElementById('revUlasan').value.trim();
        if(!ulasan) { showToast('Tulis ulasan dahulu!', 'error'); return; }

        const orderId = document.getElementById('revOrderId').value;
        const produkId = document.getElementById('revProdukId').value;
        const produkNama = document.getElementById('revProdukNama').textContent;

        try {
            await db.ref('testimoni').push({
                nama: currentUser.displayName || currentUser.email.split('@')[0],
                email: currentUser.email,
                foto: currentUser.photoURL || '',
                rating: reviewRating,
                ulasan, produk: produkNama,
                waktu: Date.now()
            });
            await db.ref('pesanan/' + orderId).update({ dapatUlasan: true });

            showToast('⭐ Terima kasih atas ulasannya!', 'success');
            document.getElementById('reviewModal').classList.remove('show');
            loadTestimoni();
        } catch(err) {
            showToast('❌ Gagal mengirim ulasan: ' + err.message, 'error');
        }
    }

    // ================= FOTO MODAL =================
    function bukaFotoModal(src) {
        const m = document.getElementById('fotoModal');
        document.getElementById('fotoFullscreen').src = src;
        m.classList.add('show');
        document.body.style.overflow = 'hidden';
    }

    function tutupFotoModal() {
        document.getElementById('fotoModal').classList.remove('show');
        document.body.style.overflow = '';
    }

    // ================= SETTINGS LOAD =================
    function loadPengaturan() {
        db.ref('pengaturan').once('value').then(snap => {
            const cfg = snap.val() || {};
            if(cfg.waNumber) OWNER_WA = cfg.waNumber;
            const nomorEl = document.getElementById('nomorKontak');
            if(nomorEl && cfg.waNumber) nomorEl.textContent = cfg.waNumber.replace(/(\d{2})(\d{4})(\d{4})(\d+)/, '+$1 $2-$3-$4');
            const waEl = document.getElementById('kontakWALink');
            if(waEl && cfg.waNumber) waEl.href = `https://wa.me/${cfg.waNumber}`;
        });
    }

    // ================= INIT =================
    window.onload = () => {
        loadPengaturan();
        loadProduk();
        loadTestimoni();
        startCountdowns();
        startTerjualRefresh();
        setupHamburger();
    };

    function startTerjualRefresh() {
        setInterval(() => {
            db.ref('pesanan').orderByChild('status').equalTo('selesai').once('value').then(snap => {
                const data = snap.val();
                let t = 0;
                if(data) Object.values(data).forEach(o => t += o.jumlah || 0);
                const el = document.getElementById('totalTerjual');
                if(el) el.textContent = t + ' Terjual';
            });
        }, 5000);
    }

    function setupHamburger() {
        const btn = document.getElementById('hamburger');
        const menu = document.getElementById('mobileMenu');
        if(btn && menu) {
            btn.addEventListener('click', () => menu.classList.toggle('open'));
        }
    }

    document.addEventListener('keydown', e => {
        if(e.key === 'Escape') {
            document.querySelectorAll('.modal.show').forEach(m => m.classList.remove('show'));
            tutupFotoModal();
        }
    });
