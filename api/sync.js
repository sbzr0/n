export default async function handler(req, res) {
    const OWNER = "sbzr0";
    const REPO = "n";
    const PATH = "entries.json";
    const BRANCH = "main";
    const TOKEN = process.env.GITHUB_TOKEN; // Stored securely in Vercel

    if (!TOKEN) return res.status(500).json({ error: "Missing GITHUB_TOKEN in Vercel" });

    const apiUrl = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}`;

    if (req.method === "GET") {
        const ghRes = await fetch(`${apiUrl}?ref=${BRANCH}&t=${Date.now()}`, {
            headers: {
                "Accept": "application/vnd.github+json",
                "Authorization": `Bearer ${TOKEN}`
            }
        });
        if (ghRes.status === 404) return res.status(200).json({ records: [] });
        if (!ghRes.ok) return res.status(ghRes.status).json({ error: "GitHub fetch failed" });

        const data = await ghRes.json();
        const content = Buffer.from(data.content, 'base64').toString('utf-8');
        return res.status(200).json({ sha: data.sha, ...JSON.parse(content) });
    }

    if (req.method === "POST") {
        const { records, sha } = req.body;
        const bodyPayload = {
            message: `Update entries via TapReview [${new Date().toISOString()}]`,
            content: Buffer.from(JSON.stringify({ records }, null, 2)).toString('base64'),
            branch: BRANCH
        };
        if (sha) bodyPayload.sha = sha;

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
        if (!ghRes.ok) return res.status(ghRes.status).json({ error: data.message });
        return res.status(200).json({ success: true, sha: data.content?.sha });
    }

    return res.status(405).json({ error: "Method not allowed" });
}
