    const firebaseConfig = {
        apiKey: "AIzaSyD1xADf6KbttaSRl3bYuKEMUrQ4SJmTtH4",
        authDomain: "jamu-herbal-alami.firebaseapp.com",
        databaseURL: "https://jamu-herbal-alami-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "jamu-herbal-alami",
        storageBucket: "jamu-herbal-alami.firebasestorage.app",
        messagingSenderId: "770031966685",
        appId: "1:770031966685:web:dc20683776e310c0b0fe34"
    };
    try { firebase.initializeApp(firebaseConfig); } catch(e) { console.error('Firebase init error', e); }
    const db   = firebase.database();
    const auth = firebase.auth();

    // GLOBALS
    const EXPIRY_TIME = 10 * 60 * 1000;
    let allPesanan = [];
    let OWNER_WA = "6285187980564";
    let currentAdminUser = null;

    // =====================================================
    //  SECURITY: Page is invisible by default
    //  Only shown after role=admin confirmed from Firebase
    // =====================================================
    document.getElementById('loginScreen').style.display = 'flex';
    // Make sure main content is not accessible in DOM visually
    document.querySelectorAll('.sidebar, .main').forEach(el => el.style.visibility = 'hidden');

    // ===== UTILITY =====
    function showToast(msg, type = 'success') {
        const t = document.getElementById('toast');
        t.className = `toast ${type}`;
        t.innerHTML = `<i class="fas ${type==='success'?'fa-check-circle':type==='error'?'fa-times-circle':'fa-info-circle'}"></i> ${msg}`;
        t.style.display = 'flex';
        clearTimeout(t._t);
        t._t = setTimeout(() => t.style.display = 'none', 3500);
    }

    function formatRp(n) { return 'Rp ' + Number(n).toLocaleString('id-ID'); }

    function formatWA(n) {
        if(!n) return '';
        let c = n.replace(/\D/g, '');
        if(c.startsWith('0')) c = '62' + c.substring(1);
        return c;
    }

    function getBadgeClass(status) {
        const map = { 'menunggu-pembayaran':'b-menunggu','proses':'b-proses','dikirim':'b-dikirim','selesai':'b-selesai','ditolak':'b-ditolak','kadaluarsa':'b-kadaluarsa' };
        return map[status] || 'b-kadaluarsa';
    }

    function getStatusLabel(status) {
        const map = { 'menunggu-pembayaran':'ðŸ’° Menunggu','proses':'âš™ï¸ Proses','dikirim':'ðŸ“¦ Dikirim','selesai':'âœ… Selesai','ditolak':'âŒ Ditolak','kadaluarsa':'â° Kadaluarsa' };
        return map[status] || status;
    }

    // Topbar clock
    setInterval(() => {
        const el = document.getElementById('topbarTime');
        if(el) el.textContent = new Date().toLocaleString('id-ID', {weekday:'short',hour:'2-digit',minute:'2-digit'});
    }, 1000);

    // =====================================================
    //  AUTH ADMIN â€” STRICT ROLE CHECK
    //  Only role === 'admin' in Firebase DB can enter.
    //  Email fallback is removed for security.
    // =====================================================
    auth.onAuthStateChanged(async user => {
        if (!user) {
            // Not logged in â†’ show login screen
            lockAdmin();
            return;
        }

        // User logged in â†’ verify role from Firebase Realtime DB
        try {
            const snap = await db.ref('users/' + user.uid + '/role').once('value');
            const role = snap.val();

            if (role === 'admin') {
                // âœ… GRANTED
                currentAdminUser = user;
                grantAdminAccess(user);
            } else {
                // âŒ DENIED â€” sign out silently and show error
                await auth.signOut();
                lockAdmin();
                showAdminError('â›” Akses ditolak. Akun ini tidak memiliki hak admin.');
            }
        } catch(err) {
            await auth.signOut();
            lockAdmin();
            showAdminError('âŒ Gagal memverifikasi akses: ' + err.message);
        }
    });

    function grantAdminAccess(user) {
        // Hide login, reveal admin UI
        document.getElementById('loginScreen').style.display = 'none';
        document.querySelectorAll('.sidebar, .main').forEach(el => el.style.visibility = 'visible');

        const name = user.displayName || user.email.split('@')[0];
        document.getElementById('topbarName').textContent = name;
        document.getElementById('topbarAvatar').textContent = name.charAt(0).toUpperCase();

        // Log access
        db.ref('admin_log').push({
            uid: user.uid,
            email: user.email,
            action: 'LOGIN',
            timestamp: Date.now(),
            ua: navigator.userAgent.substring(0, 100)
        });

        initAdmin();
    }

    function lockAdmin() {
        document.getElementById('loginScreen').style.display = 'flex';
        document.querySelectorAll('.sidebar, .main').forEach(el => el.style.visibility = 'hidden');
        currentAdminUser = null;
    }

    async function doAdminLogin() {
        const email = document.getElementById('adminEmail').value.trim();
        const pass  = document.getElementById('adminPass').value;
        const btn   = document.getElementById('btnAdminLogin');
        const errEl = document.getElementById('adminLoginError');
        errEl.style.display = 'none';

        if (!email || !pass) { showAdminError('Email dan password wajib diisi!'); return; }

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memverifikasi...';

        try {
            await auth.signInWithEmailAndPassword(email, pass);
            // onAuthStateChanged will handle role check
        } catch(err) {
            const msgs = {
                'auth/wrong-password': 'Password salah',
                'auth/user-not-found': 'Email tidak terdaftar',
                'auth/invalid-email': 'Format email tidak valid',
                'auth/too-many-requests': 'Terlalu banyak percobaan. Coba lagi nanti.',
                'auth/invalid-credential': 'Email atau password salah'
            };
            showAdminError(msgs[err.code] || err.message);
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-shield-halved"></i> Masuk ke Admin Panel';
        }
    }

    function showAdminError(msg) {
        const el = document.getElementById('adminLoginError');
        el.textContent = msg;
        el.style.display = 'block';
    }

    async function doAdminLogout() {
        if (currentAdminUser) {
            await db.ref('admin_log').push({
                uid: currentAdminUser.uid,
                email: currentAdminUser.email,
                action: 'LOGOUT',
                timestamp: Date.now()
            });
        }
        await auth.signOut();
        lockAdmin();
        showToast('ðŸ‘‹ Berhasil keluar dari admin panel', 'info');
    }

    // ===== INIT ADMIN =====
    function initAdmin() {
        loadDashboard();
        loadAllPesanan();
        loadAdminProduk();
        loadAdminTestimoni();
        loadPengaturan();
        loadKonfirmasiList();
        startExpiredChecker();
    }

    // ===== PAGE SWITCHER =====
    function switchPage(page) {
        document.querySelectorAll('.page-panel').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

        document.getElementById('page' + page.charAt(0).toUpperCase() + page.slice(1)).classList.add('active');
        document.querySelector(`[data-page="${page}"]`)?.classList.add('active');

        const titles = {
            dashboard: ['Dashboard', 'Ringkasan aktivitas toko'],
            pesanan: ['Manajemen Pesanan', 'Kelola dan update status pesanan'],
            produk: ['Manajemen Produk', 'Tambah, edit, hapus produk'],
            testimoni: ['Testimoni', 'Kelola ulasan pelanggan'],
            konfirmasi: ['Konfirmasi Pembayaran', 'Verifikasi transfer pelanggan'],
            pengaturan: ['Pengaturan', 'Konfigurasi toko dan sistem']
        };
        const [title, subtitle] = titles[page] || ['', ''];
        document.getElementById('pageTitle').textContent = title;
        document.getElementById('pageSubtitle').textContent = subtitle;

        // Close sidebar on mobile
        if(window.innerWidth < 768) document.getElementById('sidebar').classList.remove('open');
    }

    // ===== DASHBOARD =====
    function loadDashboard() {
        // Stats
        db.ref('produk').once('value').then(s => { document.getElementById('statProduk').textContent = s.numChildren(); });
        db.ref('testimoni').once('value').then(s => { document.getElementById('statTestimoni').textContent = s.numChildren(); });
        db.ref('pesanan').once('value').then(s => {
            const data = s.val() || {};
            const orders = Object.values(data);
            document.getElementById('statPesanan').textContent = orders.length;
            const omzet = orders.filter(o => o.status === 'selesai').reduce((a, o) => a + (o.total || 0), 0);
            document.getElementById('statOmzet').textContent = formatRp(omzet);

            // Menunggu
            const menunggu = orders.filter(o => o.status === 'menunggu-pembayaran');
            const c = document.getElementById('dashboardMenunggu');
            if(!menunggu.length) {
                c.innerHTML = '<p class="text-center text-gray-400 py-6"><i class="fas fa-check-circle text-green-400 text-2xl mb-2 block"></i>Tidak ada pesanan menunggu</p>';
                return;
            }
            c.innerHTML = menunggu.slice(0,5).map(o => `
                <div class="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                    <div>
                        <p class="font-mono text-sm font-bold">${o.kode}</p>
                        <p class="text-sm text-gray-600">${o.nama} Â· ${o.produkNama}</p>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="font-bold text-green-700 text-sm">${formatRp(o.total)}</span>
                        <button onclick="bukaKonfirmasi('${o._id}','${o.kode}',${o.total},'${o.nama}')" class="btn btn-green btn-sm">Konfirmasi</button>
                    </div>
                </div>`).join('');
        });
    }

    // ===== PESANAN =====
    function loadAllPesanan() {
        const tbody = document.getElementById('pesananBody');
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-10"><div class="spinner mx-auto mb-2"></div></td></tr>';

        db.ref('pesanan').orderByChild('waktu').once('value').then(snap => {
            const data = snap.val();
            if(!data) { tbody.innerHTML = '<tr><td colspan="7" class="text-center py-10 text-gray-400">Belum ada pesanan</td></tr>'; return; }

            allPesanan = Object.entries(data).map(([id, o]) => ({...o, _id: id})).reverse();
            renderPesanan(allPesanan);

            // Badge
            const menunggu = allPesanan.filter(o => o.status === 'menunggu-pembayaran').length;
            const badge = document.getElementById('badgePesananBaru');
            if(menunggu > 0) { badge.textContent = menunggu; badge.classList.remove('hidden'); }
            else badge.classList.add('hidden');
        });
    }

    function renderPesanan(orders) {
        const tbody = document.getElementById('pesananBody');
        if(!orders.length) { tbody.innerHTML = '<tr><td colspan="7" class="text-center py-10 text-gray-400">Tidak ada data</td></tr>'; return; }

        tbody.innerHTML = orders.map(o => `
            <tr>
                <td><span class="font-mono text-xs font-bold text-gray-700">${o.kode}</span></td>
                <td>
                    <p class="font-semibold text-sm">${o.nama}</p>
                    <p class="text-xs text-gray-400">${o.wa || ''}</p>
                </td>
                <td>
                    <p class="text-sm">${o.produkNama}</p>
                    <p class="text-xs text-gray-400">Ã—${o.jumlah}</p>
                </td>
                <td class="font-bold text-green-700 text-sm">${formatRp(o.total)}</td>
                <td>
                    <select class="input text-xs py-1 px-2 w-36" onchange="ubahStatus('${o._id}',this.value,this)" style="border-radius:8px">
                        <option value="menunggu-pembayaran" ${o.status==='menunggu-pembayaran'?'selected':''}>ðŸ’° Menunggu</option>
                        <option value="proses" ${o.status==='proses'?'selected':''}>âš™ï¸ Proses</option>
                        <option value="dikirim" ${o.status==='dikirim'?'selected':''}>ðŸ“¦ Dikirim</option>
                        <option value="selesai" ${o.status==='selesai'?'selected':''}>âœ… Selesai</option>
                        <option value="ditolak" ${o.status==='ditolak'?'selected':''}>âŒ Ditolak</option>
                        <option value="kadaluarsa" ${o.status==='kadaluarsa'?'selected':''}>â° Kadaluarsa</option>
                    </select>
                </td>
                <td class="text-xs text-gray-400">${new Date(o.waktu).toLocaleString('id-ID',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</td>
                <td>
                    <div class="flex gap-1">
                        <button onclick="lihatDetailPesanan('${o._id}')" class="btn btn-outline btn-icon btn-sm" title="Detail"><i class="fas fa-eye"></i></button>
                        ${o.status==='menunggu-pembayaran'?`<button onclick="bukaKonfirmasi('${o._id}','${o.kode}',${o.total},'${o.nama}')" class="btn btn-green btn-icon btn-sm" title="Konfirmasi"><i class="fas fa-check"></i></button>`:''}
                        <button onclick="lihatRiwayat('${o._id}')" class="btn btn-outline btn-icon btn-sm" title="Riwayat"><i class="fas fa-history"></i></button>
                        <button onclick="hapusPesanan('${o._id}')" class="btn btn-red btn-icon btn-sm" title="Hapus"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>`).join('');
    }

    function filterPesanan() {
        const q = document.getElementById('searchPesanan').value.toLowerCase();
        const s = document.getElementById('filterStatus').value;
        let filtered = allPesanan;
        if(s !== 'all') filtered = filtered.filter(o => o.status === s);
        if(q) filtered = filtered.filter(o => (o.nama||'').toLowerCase().includes(q) || (o.kode||'').toLowerCase().includes(q) || (o.produkNama||'').toLowerCase().includes(q));
        renderPesanan(filtered);
    }

    function ubahStatus(id, status, selectEl) {
        db.ref('pesanan/' + id).once('value').then(snap => {
            const order = snap.val();
            const riwayat = order.riwayatStatus || [];
            riwayat.push({ status, waktu: Date.now(), catatan: `Status diubah ke ${status} oleh Admin` });
            db.ref('pesanan/' + id).update({ status, riwayatStatus: riwayat }).then(() => {
                showToast(`âœ… Status diubah ke ${getStatusLabel(status)}`);
                loadDashboard();
                if(status === 'selesai') {
                    db.ref('produk/' + order.produkId + '/terjual').transaction(c => (c||0) + (order.jumlah||1));
                    const waMsg = `âœ… *PESANAN SELESAI!*\n\nHalo ${order.nama},\nPesanan *${order.kode}* telah selesai.\n\nTerima kasih telah berbelanja! ðŸŒ¿`;
                    window.open(`https://wa.me/${formatWA(order.wa)}?text=${encodeURIComponent(waMsg)}`, '_blank');
                } else if(status === 'dikirim') {
                    const waMsg = `ðŸ“¦ *PESANAN DIKIRIM!*\n\nHalo ${order.nama},\nPesanan *${order.kode}* sudah kami kirim.\nEstimasi tiba 2-3 hari kerja.\n\nTerima kasih! ðŸŒ¿`;
                    window.open(`https://wa.me/${formatWA(order.wa)}?text=${encodeURIComponent(waMsg)}`, '_blank');
                }
            });
        });
    }

    function lihatDetailPesanan(id) {
        db.ref('pesanan/' + id).once('value').then(snap => {
            const o = snap.val();
            if(!o) return;
            const badgeCls = getBadgeClass(o.status);
            document.getElementById('detailContent').innerHTML = `
                <div class="grid grid-cols-2 gap-4 mb-5">
                    <div class="bg-gray-50 rounded-xl p-4">
                        <p class="text-xs text-gray-400 mb-1">ID Pesanan</p>
                        <p class="font-mono font-bold text-sm">${o.kode}</p>
                    </div>
                    <div class="bg-gray-50 rounded-xl p-4 text-right">
                        <p class="text-xs text-gray-400 mb-1">Status</p>
                        <span class="badge ${badgeCls}">${getStatusLabel(o.status)}</span>
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-3 text-sm mb-5">
                    <div><p class="text-gray-400 text-xs">Nama</p><p class="font-semibold">${o.nama}</p></div>
                    <div><p class="text-gray-400 text-xs">WhatsApp</p><a href="https://wa.me/${formatWA(o.wa)}" target="_blank" class="font-semibold text-green-600">${o.wa}</a></div>
                    <div class="col-span-2"><p class="text-gray-400 text-xs">Alamat</p><p class="font-semibold">${o.alamat}</p></div>
                    <div><p class="text-gray-400 text-xs">Produk</p><p class="font-semibold">${o.produkNama}</p></div>
                    <div><p class="text-gray-400 text-xs">Jumlah</p><p class="font-semibold">${o.jumlah} pcs</p></div>
                    <div><p class="text-gray-400 text-xs">Total</p><p class="font-bold text-green-700 text-lg">${formatRp(o.total)}</p></div>
                    <div><p class="text-gray-400 text-xs">Waktu Pesan</p><p class="font-semibold">${new Date(o.waktu).toLocaleString('id-ID')}</p></div>
                </div>
                ${o.konfirmasiPembayaran ? `
                <div class="bg-green-50 rounded-xl p-4 mb-4 border border-green-200">
                    <p class="font-bold text-green-700 mb-2">âœ… Pembayaran Terkonfirmasi</p>
                    <p class="text-sm">Bank: ${o.konfirmasiPembayaran.bank} Â· Pengirim: ${o.konfirmasiPembayaran.pengirim}</p>
                    <p class="text-sm">Tanggal: ${o.konfirmasiPembayaran.tanggal}</p>
                </div>` : ''}
                <div class="flex gap-2">
                    <a href="https://wa.me/${formatWA(o.wa)}" target="_blank" class="flex-1 btn btn-green btn-sm justify-center"><i class="fab fa-whatsapp"></i> Chat WA</a>
                    ${o.status==='menunggu-pembayaran'?`<button onclick="bukaKonfirmasi('${id}','${o.kode}',${o.total},'${o.nama}')" class="flex-1 btn btn-yellow btn-sm justify-center"><i class="fas fa-check"></i> Konfirmasi</button>`:''}
                </div>`;
            document.getElementById('detailModal').classList.add('show');
        });
    }

    function lihatRiwayat(id) {
        db.ref('pesanan/' + id).once('value').then(snap => {
            const o = snap.val();
            if(!o || !o.riwayatStatus) {
                document.getElementById('riwayatContent').innerHTML = '<p class="text-gray-400 text-center py-4">Belum ada riwayat</p>';
            } else {
                document.getElementById('riwayatContent').innerHTML = o.riwayatStatus.slice().reverse().map(r => `
                    <div class="flex gap-3 mb-4 last:mb-0">
                        <div class="w-2.5 h-2.5 rounded-full bg-green-500 mt-1.5 shrink-0"></div>
                        <div class="flex-1 pb-3 border-b border-gray-100 last:border-0">
                            <p class="font-semibold text-sm">${getStatusLabel(r.status)}</p>
                            ${r.catatan ? `<p class="text-xs text-gray-500">${r.catatan}</p>` : ''}
                            <p class="text-xs text-gray-400 mt-1">${new Date(r.waktu).toLocaleString('id-ID')}</p>
                        </div>
                    </div>`).join('');
            }
            document.getElementById('riwayatModal').classList.add('show');
        });
    }

    function hapusPesanan(id) {
        if(!confirm('Yakin mau hapus pesanan ini?')) return;
        db.ref('pesanan/' + id).remove().then(() => {
            showToast('âœ… Pesanan dihapus');
            loadAllPesanan();
        });
    }

    function exportCSV() {
        if(!allPesanan.length) { showToast('Tidak ada data untuk diexport', 'error'); return; }
        let csv = 'Kode,Nama,WA,Produk,Jumlah,Total,Status,Waktu\n';
        allPesanan.forEach(o => {
            csv += `"${o.kode}","${o.nama}","${o.wa}","${o.produkNama}",${o.jumlah},${o.total},"${o.status}","${new Date(o.waktu).toLocaleString('id-ID')}"\n`;
        });
        const blob = new Blob(['\uFEFF'+csv], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'pesanan-' + new Date().toISOString().slice(0,10) + '.csv';
        a.click();
        showToast('âœ… CSV berhasil diexport');
    }

    // ===== PRODUK =====
    // ===== CLOUDINARY CONFIG =====
    const CLOUDINARY_CLOUD = 'uorsiujb';
    const CLOUDINARY_PRESET = 'Herbal.Unsigned';
    let uploadedFotos = []; // array of URLs
    let isUploadingFoto = false;

    async function uploadKeCloudinary(file) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('upload_preset', CLOUDINARY_PRESET);
        fd.append('folder', 'jamu-herbal');
        const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, {
            method: 'POST', body: fd
        });
        if (!res.ok) throw new Error('Upload gagal');
        const data = await res.json();
        return data.secure_url;
    }

    async function handleFotoUpload(files) {
        if (!files || files.length === 0) return;
        isUploadingFoto = true;
        const area = document.getElementById('uploadAreaContent');
        const prog = document.getElementById('uploadProgress');
        const progText = document.getElementById('uploadProgressText');
        area.style.display = 'none';
        prog.style.display = 'block';

        for (let i = 0; i < files.length; i++) {
            progText.textContent = `Mengupload foto ${i+1} dari ${files.length}...`;
            try {
                const url = await uploadKeCloudinary(files[i]);
                uploadedFotos.push(url);
                renderFotoPreviews();
            } catch(e) {
                showToast('âŒ Gagal upload foto ' + (i+1), 'error');
            }
        }

        area.style.display = 'block';
        prog.style.display = 'none';
        document.getElementById('pFoto').value = uploadedFotos.join(',');
        isUploadingFoto = false;

        // Reset input file supaya bisa pilih file yang sama lagi kalau perlu
        const inputEl = document.getElementById('fotoUploadInput');
        if (inputEl) inputEl.value = '';
    }

    function renderFotoPreviews() {
        const c = document.getElementById('fotoPreviewList');
        c.innerHTML = uploadedFotos.map((url, i) => `
            <div class="foto-thumb">
                <img src="${url}" alt="foto ${i+1}">
                <button type="button" class="del-btn" onclick="hapusFotoPreview(${i})">Ã—</button>
            </div>`).join('');
    }

    function hapusFotoPreview(i) {
        uploadedFotos.splice(i, 1);
        renderFotoPreviews();
        document.getElementById('pFoto').value = uploadedFotos.join(',');
    }

    // ===== PRODUK =====
    function loadAdminProduk() {
        const c = document.getElementById('adminProdukList');
        db.ref('produk').once('value').then(snap => {
            const data = snap.val();
            if (!data) {
                c.innerHTML = '<div class="col-span-3 text-center py-10 text-gray-400"><i class="fas fa-box-open text-4xl mb-3 opacity-30"></i><p>Belum ada produk</p></div>';
                return;
            }
            c.innerHTML = Object.entries(data).map(([id, p]) => {
                const fotos = Array.isArray(p.foto) ? p.foto : (p.foto ? [p.foto] : []);
                const thumb = fotos[0] || 'https://placehold.co/400x200/dcfce7/166534?text=Produk';
                const manfaatArr = p.manfaat ? p.manfaat.split(';').map(s=>s.trim()).filter(Boolean).slice(0,3) : [];
                return `
                <div class="produk-admin-card">
                    <div class="card-foto">
                        <img src="${thumb}" onerror="this.src='https://placehold.co/400x200/dcfce7/166534?text=Produk'" alt="${p.nama}">
                        ${fotos.length > 1 ? `<span style="position:absolute;bottom:8px;right:8px;background:rgba(0,0,0,.55);color:white;font-size:10px;padding:2px 7px;border-radius:20px;"><i class="fas fa-images mr-1"></i>${fotos.length}</span>` : ''}
                        ${p.kategori ? `<span style="position:absolute;top:8px;left:8px;background:#166534cc;color:white;font-size:10px;padding:2px 8px;border-radius:20px;">${p.kategori}</span>` : ''}
                    </div>
                    <div class="card-body">
                        <h3 class="font-bold text-gray-800 mb-1 leading-tight">${p.nama}</h3>
                        <p class="text-green-700 font-bold text-lg mb-1">${p.harga ? formatRp(p.harga) : '<span class="text-blue-600">Hubungi WA</span>'}</p>
                        ${p.berat ? `<p class="text-xs text-gray-400 mb-1"><i class="fas fa-weight-hanging mr-1"></i>${p.berat}</p>` : ''}
                        ${p.stok !== undefined && p.stok !== '' ? `<p class="text-xs ${p.stok < 5 ? 'text-red-500' : 'text-gray-400'} mb-1"><i class="fas fa-cubes mr-1"></i>Stok: ${p.stok}</p>` : ''}
                        ${manfaatArr.length ? `<div class="flex flex-wrap gap-1 mb-2">${manfaatArr.map(m=>`<span class="tag">${m}</span>`).join('')}</div>` : ''}
                        <p class="text-xs text-gray-400 mb-3"><i class="fas fa-fire mr-1 text-orange-400"></i>${p.terjual||0} terjual Â· â­${p.avgRating||'â€“'} (${p.ulasanCount||0})</p>
                        <div class="flex gap-2">
                            <button onclick="editProduk('${id}')" class="flex-1 btn btn-outline btn-sm justify-center"><i class="fas fa-edit"></i> Edit</button>
                            <button onclick="hapusProduk('${id}')" class="btn btn-red btn-icon btn-sm"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                </div>`;
            }).join('');
        });
    }

    function resetProdukForm() {
        ['pId','pNama','pKategori','pBerat','pHarga','pStok','pDeskripsi',
         'pManfaat','pKomposisi','pKandungan','pCarapakai','pPenyimpanan','pPeringatan','pFoto']
            .forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
        uploadedFotos = [];
        isUploadingFoto = false;
        renderFotoPreviews();
    }

    function bukaTambahProduk() {
        document.getElementById('produkModalTitle').textContent = 'âž• Tambah Produk';
        resetProdukForm();
        document.getElementById('produkModal').classList.add('show');
        setupDragDrop();
    }

    function tutupProdukModal() {
        document.getElementById('produkModal').classList.remove('show');
    }

    function editProduk(id) {
        db.ref('produk/' + id).once('value').then(snap => {
            const p = snap.val();
            if (!p) return;
            document.getElementById('produkModalTitle').textContent = 'âœï¸ Edit Produk';
            resetProdukForm();
            document.getElementById('pId').value = id;
            document.getElementById('pNama').value = p.nama || '';
            document.getElementById('pKategori').value = p.kategori || '';
            document.getElementById('pBerat').value = p.berat || '';
            document.getElementById('pHarga').value = p.harga || '';
            document.getElementById('pStok').value = p.stok !== undefined ? p.stok : '';
            document.getElementById('pDeskripsi').value = p.deskripsi || '';
            document.getElementById('pManfaat').value = p.manfaat || '';
            document.getElementById('pKomposisi').value = p.komposisi || '';
            document.getElementById('pKandungan').value = p.kandungan || '';
            document.getElementById('pCarapakai').value = p.carapakai || '';
            document.getElementById('pPenyimpanan').value = p.penyimpanan || '';
            document.getElementById('pPeringatan').value = p.peringatan || '';

            // Load existing photos
            uploadedFotos = Array.isArray(p.foto) ? [...p.foto] : (p.foto ? [p.foto] : []);
            document.getElementById('pFoto').value = uploadedFotos.join(',');
            renderFotoPreviews();

            document.getElementById('produkModal').classList.add('show');
            setupDragDrop();
        });
    }

    let dragDropInit = false;
    function setupDragDrop() {
        if (dragDropInit) return;
        dragDropInit = true;
        const area = document.getElementById('uploadArea');
        if (!area) return;
        ['dragenter','dragover'].forEach(evt => {
            area.addEventListener(evt, e => {
                e.preventDefault(); e.stopPropagation();
                area.style.borderColor = '#16a34a';
                area.style.background = '#bbf7d0';
            });
        });
        ['dragleave','drop'].forEach(evt => {
            area.addEventListener(evt, e => {
                e.preventDefault(); e.stopPropagation();
                area.style.borderColor = '#86efac';
                area.style.background = '#f0fdf4';
            });
        });
        area.addEventListener('drop', e => {
            const files = e.dataTransfer.files;
            if (files && files.length) handleFotoUpload(files);
        });
    }

    function simpanProduk(e) {
        e.preventDefault();
        if (isUploadingFoto) {
            return showToast('â³ Tunggu upload foto selesai dulu', 'error');
        }
        const id = document.getElementById('pId').value;
        const nama = document.getElementById('pNama').value.trim();
        if (!nama) return showToast('âŒ Nama produk wajib diisi', 'error');

        const hargaStr = document.getElementById('pHarga').value.trim();
        const stokStr = document.getElementById('pStok').value.trim();
        const fotoStr = document.getElementById('pFoto').value.trim();

        const data = {
            nama,
            kategori: document.getElementById('pKategori').value.trim(),
            berat: document.getElementById('pBerat').value.trim(),
            deskripsi: document.getElementById('pDeskripsi').value.trim(),
            manfaat: document.getElementById('pManfaat').value.trim(),
            komposisi: document.getElementById('pKomposisi').value.trim(),
            kandungan: document.getElementById('pKandungan').value.trim(),
            carapakai: document.getElementById('pCarapakai').value.trim(),
            penyimpanan: document.getElementById('pPenyimpanan').value.trim(),
            peringatan: document.getElementById('pPeringatan').value.trim(),
            // Pakai null (bukan dihilangkan) supaya update() beneran menghapus
            // nilai lama di Firebase kalau field dikosongkan admin
            harga: (hargaStr && !isNaN(hargaStr)) ? parseInt(hargaStr) : null,
            stok: (stokStr !== '') ? parseInt(stokStr) : null,
            foto: null,
        };

        if (fotoStr) {
            const arr = fotoStr.split(',').map(u => u.trim()).filter(Boolean);
            data.foto = arr.length === 1 ? arr[0] : arr;
        }
        if (!id) { data.terjual = 0; data.ulasanCount = 0; data.avgRating = 0; }

        const btnSimpan = document.getElementById('btnSimpanProduk');
        btnSimpan.disabled = true;
        btnSimpan.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;margin:0 auto"></div>';

        // update() dengan value null akan menghapus key tsb di Firebase RTDB â€”
        // jadi field yang dikosongkan admin (harga/stok/foto) beneran hilang,
        // bukan tersisa nilai lama seperti sebelumnya.
        const ref = id ? db.ref('produk/' + id).update(data) : db.ref('produk').push(data);
        ref.then(() => {
            showToast('âœ… Produk ' + (id ? 'diperbarui' : 'ditambahkan'));
            tutupProdukModal();
            loadAdminProduk();
        }).catch(err => {
            showToast('âŒ ' + err.message, 'error');
        }).finally(() => {
            btnSimpan.disabled = false;
            btnSimpan.innerHTML = '<i class="fas fa-save"></i> Simpan Produk';
        });
    }

    function hapusProduk(id) {
        if (!confirm('Yakin hapus produk ini? Tindakan tidak bisa dibatalkan.')) return;
        db.ref('produk/' + id).remove().then(() => {
            showToast('âœ… Produk dihapus');
            loadAdminProduk();
        });
    }

    // ===== TESTIMONI =====
    function loadAdminTestimoni() {
        const tbody = document.getElementById('testimoniBody');
        db.ref('testimoni').orderByChild('waktu').once('value').then(snap => {
            const data = snap.val();
            if(!data) { tbody.innerHTML = '<tr><td colspan="6" class="text-center py-10 text-gray-400">Belum ada testimoni</td></tr>'; return; }

            const list = Object.entries(data).map(([id,t]) => ({...t, _id: id})).reverse();
            tbody.innerHTML = list.map(t => `
                <tr>
                    <td>
                        <div class="flex items-center gap-2">
                            <img src="${t.foto || 'https://ui-avatars.com/api/?name='+encodeURIComponent(t.nama||'U')+'&background=dcfce7&color=166534'}"
                                 class="w-8 h-8 rounded-full object-cover">
                            <p class="font-semibold text-sm">${t.nama}</p>
                        </div>
                    </td>
                    <td class="text-sm text-gray-600">${t.produk}</td>
                    <td>
                        <div class="flex">${Array(5).fill(0).map((_,i) => `<i class="fa-${i<(t.rating||5)?'solid':'regular'} fa-star text-amber-400 text-xs"></i>`).join('')}</div>
                    </td>
                    <td class="text-sm text-gray-600 max-w-xs truncate">${t.ulasan}</td>
                    <td class="text-xs text-gray-400">${new Date(t.waktu).toLocaleDateString('id-ID')}</td>
                    <td>
                        <button onclick="hapusTestimoni('${t._id}')" class="btn btn-red btn-icon btn-sm"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>`).join('');
        });
    }

    function hapusTestimoni(id) {
        if(!confirm('Yakin hapus testimoni ini?')) return;
        db.ref('testimoni/' + id).once('value').then(snap => {
            const t = snap.val();
            return db.ref('testimoni/' + id).remove().then(() => {
                showToast('âœ… Testimoni dihapus');
                loadAdminTestimoni();
                if (t && t.produkId) recalcProdukRating(t.produkId);
            });
        });
    }

    // Hitung ulang avgRating & ulasanCount produk dari semua testimoni yang terkait
    function recalcProdukRating(produkId) {
        if (!produkId) return;
        db.ref('testimoni').orderByChild('produkId').equalTo(produkId).once('value').then(snap => {
            const data = snap.val();
            const list = data ? Object.values(data) : [];
            const vals = list.map(t => Number(t.rating)).filter(r => r >= 1 && r <= 5);
            const avg = vals.length ? parseFloat((vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1)) : 0;
            db.ref('produk/' + produkId).update({ avgRating: avg, ulasanCount: vals.length });
        });
    }

    // ===== KONFIRMASI PEMBAYARAN =====
    function loadKonfirmasiList() {
        const c = document.getElementById('konfirmasiList');
        db.ref('pesanan').orderByChild('status').equalTo('menunggu-pembayaran').once('value').then(snap => {
            const data = snap.val();
            if(!data) { c.innerHTML = '<p class="text-center text-gray-400 py-8"><i class="fas fa-check-circle text-green-400 text-3xl mb-2 block"></i>Tidak ada pesanan menunggu</p>'; return; }

            const list = Object.entries(data).map(([id,o]) => ({...o, _id: id})).reverse();
            c.innerHTML = list.map(o => {
                const sisa = (o.waktu + EXPIRY_TIME) - Date.now();
                const sisaText = sisa > 0 ? `${Math.floor(sisa/60000)}:${String(Math.floor((sisa%60000)/1000)).padStart(2,'0')}` : 'Kadaluarsa';
                return `
                <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-3">
                    <div class="flex justify-between items-start mb-2">
                        <div>
                            <p class="font-mono font-bold text-sm">${o.kode}</p>
                            <p class="text-sm text-gray-700">${o.nama} Â· ${o.produkNama}</p>
                        </div>
                        <span class="font-bold text-green-700">${formatRp(o.total)}</span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-xs text-red-600"><i class="fas fa-hourglass-half mr-1"></i>${sisaText}</span>
                        <button onclick="bukaKonfirmasi('${o._id}','${o.kode}',${o.total},'${o.nama}')" class="btn btn-green btn-sm">
                            <i class="fas fa-check"></i> Konfirmasi
                        </button>
                    </div>
                </div>`;
            }).join('');
        });
    }

    function cariPesananUntukKonfirmasi() {
        const id = document.getElementById('konfirmasiSearchId').value.trim();
        if(!id) { showToast('Masukkan ID pesanan!', 'error'); return; }

        db.ref('pesanan').orderByChild('kode').equalTo(id).once('value').then(snap => {
            const data = snap.val();
            const c = document.getElementById('konfirmasiInfo');
            if(!data) {
                c.innerHTML = '<div class="bg-red-50 border border-red-200 rounded-xl p-4 text-red-600"><i class="fas fa-times-circle mr-2"></i>ID pesanan tidak ditemukan</div>';
                c.style.display = 'block';
                return;
            }
            const [orderId, order] = Object.entries(data)[0];
            c.innerHTML = `
                <div class="bg-green-50 border border-green-200 rounded-xl p-4">
                    <p class="font-bold text-green-800 mb-2">âœ… Pesanan ditemukan</p>
                    <p class="text-sm"><strong>Nama:</strong> ${order.nama}</p>
                    <p class="text-sm"><strong>Produk:</strong> ${order.produkNama}</p>
                    <p class="text-sm"><strong>Total:</strong> ${formatRp(order.total)}</p>
                    <p class="text-sm"><strong>Status:</strong> ${getStatusLabel(order.status)}</p>
                    ${order.status === 'menunggu-pembayaran' ? `
                    <button onclick="bukaKonfirmasi('${orderId}','${order.kode}',${order.total},'${order.nama}')" class="btn btn-green mt-3 w-full justify-center">
                        <i class="fas fa-check-circle"></i> Konfirmasi Pembayaran
                    </button>` : '<p class="text-amber-600 text-sm mt-2">âš ï¸ Pesanan ini sudah dikonfirmasi atau tidak dalam status menunggu</p>'}
                </div>`;
            c.style.display = 'block';
        });
    }

    function bukaKonfirmasiDariId() {
        const id = document.getElementById('quickId').value.trim();
        if(!id) { showToast('Masukkan ID pesanan!', 'error'); return; }
        document.getElementById('konfirmasiSearchId').value = id;
        switchPage('konfirmasi');
        cariPesananUntukKonfirmasi();
    }

    function bukaKonfirmasi(orderId, kode, total, nama) {
        document.getElementById('konfOrderId').value = orderId;
        document.getElementById('konfJumlah').value = total;
        document.getElementById('konfirmasiModal').classList.add('show');
        document.getElementById('konfModalInfo').innerHTML = `
            <p class="font-bold text-blue-800 mb-1">ðŸ“‹ ${kode}</p>
            <p class="text-sm">Atas nama: <strong>${nama}</strong></p>
            <p class="text-sm">Total: <strong class="text-green-700">${formatRp(total)}</strong></p>`;
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('konfTanggal').value = today;
    }

    async function prosesKonfirmasiPembayaran(e) {
        e.preventDefault();
        const orderId = document.getElementById('konfOrderId').value;
        const bank = document.getElementById('konfBank').value;
        const pengirim = document.getElementById('konfPengirim').value.trim();
        const tanggal = document.getElementById('konfTanggal').value;
        const jumlah = parseInt(document.getElementById('konfJumlah').value);

        if(!bank || !pengirim || !tanggal) { showToast('Semua field wajib diisi!', 'error'); return; }

        try {
            const snap = await db.ref('pesanan/' + orderId).once('value');
            const order = snap.val();

            if(order.status !== 'menunggu-pembayaran') {
                showToast('Pesanan sudah dikonfirmasi atau tidak valid', 'error');
                return;
            }

            const waktuKadaluarsa = (order.waktu || 0) + EXPIRY_TIME;
            if(Date.now() > waktuKadaluarsa) {
                if(!confirm('âš ï¸ Pesanan sudah melewati batas 10 menit. Tetap konfirmasi?')) return;
            }

            const konfData = { bank, pengirim, tanggal, jumlah, waktuKonfirmasi: Date.now(), dikonfirmasiOleh: 'Admin' };
            const riwayat = order.riwayatStatus || [];
            riwayat.push({ status: 'proses', waktu: Date.now(), catatan: `Pembayaran dikonfirmasi dari ${bank} atas nama ${pengirim}` });

            await db.ref('pesanan/' + orderId).update({
                status: 'proses',
                konfirmasiPembayaran: konfData,
                riwayatStatus: riwayat,
                waktuKonfirmasi: Date.now()
            });

            showToast('âœ… Pembayaran dikonfirmasi! Status: DIPROSES');
            document.getElementById('konfirmasiModal').classList.remove('show');
            document.getElementById('konfirmasiModal').querySelector('form').reset();

            // Notif WA ke pembeli
            const waMsg = `âœ… *PEMBAYARAN DIKONFIRMASI!*\n\nHalo ${order.nama},\nPembayaran pesanan *${order.kode}* sudah kami terima.\n\nðŸ“¦ Status: *SEDANG DIPROSES*\nKami akan segera memproses pesanan Anda.\n\nTerima kasih! ðŸŒ¿`;
            window.open(`https://wa.me/${formatWA(order.wa)}?text=${encodeURIComponent(waMsg)}`, '_blank');

            loadAllPesanan();
            loadKonfirmasiList();
            loadDashboard();
        } catch(err) {
            showToast('âŒ ' + err.message, 'error');
        }
    }

    // ===== PENGATURAN =====
    function loadPengaturan() {
        db.ref('pengaturan').once('value').then(snap => {
            const cfg = snap.val() || {};
            if(cfg.rekening) {
                document.getElementById('bankName').value = cfg.rekening.bank || '';
                document.getElementById('bankNumber').value = cfg.rekening.nomor || '';
                document.getElementById('bankOwner').value = cfg.rekening.nama || '';
                updateRekeningPreview(cfg.rekening);
            }
            if(cfg.waNumber) {
                document.getElementById('waNumber').value = cfg.waNumber;
                OWNER_WA = cfg.waNumber;
            }
        });
    }

    function updateRekeningPreview(rek) {
        const el = document.getElementById('rekeningPreview');
        if(!el) return;
        el.innerHTML = `
            <p class="text-white text-opacity-80 text-sm mb-1">Rekening Aktif</p>
            <p class="text-2xl font-bold">${rek.bank || '-'}</p>
            <p class="text-xl font-mono mt-1">${rek.nomor || '-'}</p>
            <p class="text-sm mt-1 text-green-200">a.n. ${rek.nama || '-'}</p>`;
    }

    function simpanRekening() {
        const bank = document.getElementById('bankName').value.trim();
        const nomor = document.getElementById('bankNumber').value.trim();
        const nama = document.getElementById('bankOwner').value.trim();
        if(!bank || !nomor || !nama) { showToast('Semua field wajib diisi!', 'error'); return; }
        db.ref('pengaturan/rekening').set({ bank, nomor, nama }).then(() => {
            showToast('âœ… Rekening diperbarui');
            updateRekeningPreview({ bank, nomor, nama });
        });
    }

    function simpanWA() {
        const wa = document.getElementById('waNumber').value.trim().replace(/\D/g, '');
        if(!wa) { showToast('Nomor WA wajib diisi!', 'error'); return; }
        db.ref('pengaturan/waNumber').set(wa).then(() => {
            OWNER_WA = wa;
            showToast('âœ… Nomor WA diperbarui');
        });
    }

    function ubahPassword() {
        const newPass = document.getElementById('newPassword').value;
        const confirmPass = document.getElementById('confirmPassword').value;
        if(newPass.length < 6) { showToast('Password minimal 6 karakter!', 'error'); return; }
        if(newPass !== confirmPass) { showToast('Konfirmasi password tidak cocok!', 'error'); return; }

        auth.currentUser.updatePassword(newPass).then(() => {
            showToast('âœ… Password berhasil diubah');
            document.getElementById('newPassword').value = '';
            document.getElementById('confirmPassword').value = '';
        }).catch(err => showToast('âŒ ' + err.message, 'error'));
    }

    // ===== EXPIRED CHECKER =====
    function startExpiredChecker() {
        setInterval(() => {
            db.ref('pesanan').orderByChild('status').equalTo('menunggu-pembayaran').once('value').then(snap => {
                const data = snap.val();
                if(!data) return;
                const now = Date.now();
                Object.entries(data).forEach(([id, o]) => {
                    if(o.waktu && (now - o.waktu) > EXPIRY_TIME) {
                        const riwayat = o.riwayatStatus || [];
                        riwayat.push({ status: 'kadaluarsa', waktu: now, catatan: 'Kadaluarsa otomatis (10 menit)' });
                        db.ref('pesanan/' + id).update({ status: 'kadaluarsa', riwayatStatus: riwayat });
                    }
                });
            });
        }, 30000);
    }

    // ===== HAPUS KADALUARSA =====
    function hapusKadaluarsa() {
        if(!confirm('Hapus semua pesanan kadaluarsa?')) return;
        db.ref('pesanan').orderByChild('status').equalTo('kadaluarsa').once('value').then(snap => {
            const data = snap.val();
            if(!data) { showToast('Tidak ada pesanan kadaluarsa', 'info'); return; }
            const promises = Object.keys(data).map(id => db.ref('pesanan/' + id).remove());
            Promise.all(promises).then(() => {
                showToast(`âœ… ${promises.length} pesanan kadaluarsa dihapus`);
                loadAllPesanan();
            });
        });
    }

    // ===== RESET DATA =====
    function confirmResetData() {
        if(!confirm('âš ï¸ PERINGATAN! Ini akan menghapus SEMUA pesanan dan testimoni. Yakin?')) return;
        if(!prompt('Ketik "RESET" untuk konfirmasi:')?.toUpperCase() === 'RESET') return;

        Promise.all([
            db.ref('pesanan').remove(),
            db.ref('testimoni').remove()
        ]).then(() => {
            showToast('âœ… Data berhasil direset');
            loadAllPesanan();
            loadAdminTestimoni();
            loadDashboard();
        }).catch(err => showToast('âŒ ' + err.message, 'error'));
    }

    // ===== KEYBOARD =====
    document.addEventListener('keydown', e => {
        if(e.key === 'Escape') document.querySelectorAll('.modal.show').forEach(m => m.classList.remove('show'));
    });

    // Auto reload setiap 30 detik
    setInterval(() => {
        if(auth.currentUser) {
            loadDashboard();
            loadKonfirmasiList();
        }
    }, 30000);
