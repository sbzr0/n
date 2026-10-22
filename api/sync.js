export default async function handler(req, res) {
    const OWNER = "sbzr0";
    const REPO = "n";
    const PATH = "entries.json";
    const BRANCH = "main";
    const TOKEN = process.env.GITHUB_TOKEN;

    if (!TOKEN) return res.status(500).json({ error: "Missing GITHUB_TOKEN in Vercel" });

    const apiUrl = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}`;

    if (req.method === "GET") {
        const ghRes = await fetch(`${apiUrl}?ref=${BRANCH}&t=${Date.now()}`, {
            headers: {
                "Accept": "application/vnd.github+json",
                "Authorization": `Bearer ${TOKEN}`
            }
        });
        if (ghRes.status === 404) {
            return res.status(200).json({ records: [], finances: [], notes: [] });
        }
        if (!ghRes.ok) {
            return res.status(ghRes.status).json({ error: "GitHub fetch failed" });
        }

        const data = await ghRes.json();
        const content = Buffer.from(data.content, 'base64').toString('utf-8');
        let parsed = {};
        try {
            parsed = JSON.parse(content);
        } catch (e) {}

        const records = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.records) ? parsed.records : []);
        const finances = Array.isArray(parsed.finances) ? parsed.finances : [];
        const notes = Array.isArray(parsed.notes) ? parsed.notes : [];

        return res.status(200).json({
            sha: data.sha,
            records,
            finances,
            notes
        });
    }

    if (req.method === "POST") {
        const { records = [], finances = [], notes = [], sha } = req.body || {};

        let latestSha = sha;
        if (!latestSha) {
            const checkRes = await fetch(`${apiUrl}?ref=${BRANCH}&t=${Date.now()}`, {
                headers: {
                    "Accept": "application/vnd.github+json",
                    "Authorization": `Bearer ${TOKEN}`
                }
            });
            if (checkRes.ok) {
                const checkData = await checkRes.json();
                latestSha = checkData.sha;
            }
        }

        const payloadObj = {
            databaseVersion: 3,
            updatedAt: new Date().toISOString(),
            totalRecords: records.length,
            totalFinances: finances.length,
            totalNotes: notes.length,
            records,
            finances,
            notes
        };

        const bodyPayload = {
            message: `Sync TapReview [NFC:${records.length} | Fin:${finances.length} \vert{} Notes:${notes.length}]`,
            content: Buffer.from(JSON.stringify(payloadObj, null, 2)).toString('base64'),
            branch: BRANCH
        };
        if (latestSha) bodyPayload.sha = latestSha;

        const ghRes = await fetch(apiUrl, {
            method: "PUT",
            headers: {
                "Accept": "application/vnd.github+json",
                "Authorization": `Bearer ${TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(bodyPayload)
        });

        const data = await ghRes.json();
        if (!ghRes.ok) return res.status(ghRes.status).json({ error: data.message || "GitHub write failed" });
        return res.status(200).json({ success: true, sha: data.content?.sha });
    }

    return res.status(405).json({ error: "Method not allowed" });
}
