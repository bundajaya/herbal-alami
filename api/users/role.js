// api/users/role.js
// GET  /api/users/role         → cek role sendiri (login required)
// POST /api/users/role         → set role user tertentu (admin only)

const { db } = require('../../lib/firebase');
const { verifyToken, requireAdmin, handleOptions } = require('../../lib/auth');

module.exports = async (req, res) => {
    if (req.method === 'OPTIONS') return handleOptions(res);

    try {
        // GET — user cek role sendiri
        if (req.method === 'GET') {
            const user = await verifyToken(req);
            const snap = await db.ref(`users/${user.uid}/role`).once('value');
            return res.status(200).json({ success: true, role: snap.val() || 'user' });
        }

        // POST — admin set role user lain
        if (req.method === 'POST') {
            await requireAdmin(req);
            const { targetUid, role } = req.body;
            if (!targetUid || !['admin', 'user'].includes(role)) {
                return res.status(400).json({ success: false, message: 'Data tidak valid' });
            }
            await db.ref(`users/${targetUid}/role`).set(role);
            return res.status(200).json({ success: true, message: `Role diubah ke ${role}` });
        }

        res.status(405).json({ success: false, message: 'Method tidak diizinkan' });
    } catch (err) {
        const status = err.status || 500;
        res.status(status).json({ success: false, message: err.message });
    }
};
