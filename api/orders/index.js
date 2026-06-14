// api/orders/index.js
// GET  /api/orders        → list pesanan (admin: semua, user: punya sendiri)
// POST /api/orders        → buat pesanan baru

const { db } = require('../../lib/firebase');
const { verifyToken, handleOptions } = require('../../lib/auth');

module.exports = async (req, res) => {
    if (req.method === 'OPTIONS') return handleOptions(res);

    try {
        const user = await verifyToken(req);

        // ── GET: ambil list pesanan ──────────────────────────
        if (req.method === 'GET') {
            let snap;
            if (user.role === 'admin') {
                snap = await db.ref('pesanan').orderByChild('waktu').once('value');
            } else {
                snap = await db.ref('pesanan')
                    .orderByChild('uid')
                    .equalTo(user.uid)
                    .once('value');
            }
            const data = snap.val() || {};
            const list = Object.entries(data).map(([id, val]) => ({ id, ...val }));
            list.sort((a, b) => (b.waktu || 0) - (a.waktu || 0));
            return res.status(200).json({ success: true, data: list });
        }

        // ── POST: buat pesanan baru ──────────────────────────
        if (req.method === 'POST') {
            const { kode, nama, wa, alamat, produk, qty, total, rekening } = req.body;

            if (!kode || !nama || !produk || !total) {
                return res.status(400).json({ success: false, message: 'Data tidak lengkap' });
            }

            // Cek duplikat kode
            const cekSnap = await db.ref('pesanan')
                .orderByChild('kode').equalTo(kode).once('value');
            if (cekSnap.val()) {
                return res.status(409).json({ success: false, message: 'ID pesanan sudah dipakai' });
            }

            const newRef = db.ref('pesanan').push();
            await newRef.set({
                kode, nama, wa, alamat, produk, qty, total, rekening,
                uid: user.uid,
                status: 'pending',
                waktu: Date.now(),
            });

            return res.status(201).json({ success: true, id: newRef.key, kode });
        }

        res.status(405).json({ success: false, message: 'Method tidak diizinkan' });
    } catch (err) {
        const status = err.status || 500;
        res.status(status).json({ success: false, message: err.message || 'Server error' });
    }
};
