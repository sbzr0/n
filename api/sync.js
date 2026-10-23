export default async function handler(req, res) {
    const OWNER = "sbzr0";
    const REPO = "n";
    const BRANCH = "main";
    const TOKEN = process.env.GITHUB_TOKEN;

    if (!TOKEN) {
        return res.status(500).json({ error: "Missing GITHUB_TOKEN in Vercel Environment Variables" });
    }

    const allowedFiles = {
        "entries.json": "entries.json",
        "finances.json": "finances.json",
        "notes.json": "notes.json"
    };
    const requestedFile = (req.query && req.query.file) || (req.body && req.body.file) || "entries.json";
    const PATH = allowedFiles[requestedFile] || "entries.json";

    const apiUrl = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}`;
    const headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${TOKEN}`,
        "Content-Type": "application/json"
    };

    try {
        if (req.method === "GET") {
            const ghRes = await fetch(`${apiUrl}?ref=${BRANCH}&t=${Date.now()}`, { headers });
            if (ghRes.status === 404) {
                return res.status(200).json({ sha: null, records: [], finances: [], notes: [] });
            }
            if (!ghRes.ok) {
                return res.status(ghRes.status).json({ error: `GitHub GET failed (${ghRes.status})` });
            }

            const data = await ghRes.json();
            const content = Buffer.from(data.content, "base64").toString("utf-8");
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
            const { records = [], finances = [], notes = [] } = req.body || {};
            let currentSha = (req.body && req.body.sha) || null;

            // Always fetch latest SHA from GitHub to prevent 409 conflict errors
            const checkRes = await fetch(`${apiUrl}?ref=${BRANCH}&t=${Date.now()}`, { headers });
            if (checkRes.ok) {
                const checkData = await checkRes.json();
                currentSha = checkData.sha;
            }

            const payloadObj = {
                databaseVersion: 3,
                updatedAt: new Date().toISOString(),
                totalRecords: records.length,
                records,
                finances,
                notes
            };

            const bodyPayload = {
                message: `Sync ${PATH} (${records.length} items) [${new Date().toISOString().slice(0, 19).replace("T", " ")}]`,
                content: Buffer.from(JSON.stringify(payloadObj, null, 2)).toString("base64"),
                branch: BRANCH
            };
            if (currentSha) bodyPayload.sha = currentSha;

            const ghRes = await fetch(apiUrl, {
                method: "PUT",
                headers,
                body: JSON.stringify(bodyPayload)
            });

            const data = await ghRes.json();
            if (!ghRes.ok) {
                return res.status(ghRes.status).json({ error: data.message || `HTTP ${ghRes.status}` });
            }
            return res.status(200).json({ success: true, sha: data.content?.sha });
        }

        return res.status(405).json({ error: "Method not allowed" });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
