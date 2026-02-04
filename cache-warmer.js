/**
 * 🚀 ULTIMATE CLOUDFLARE CACHE WARMER (Secure Edition)
 * ====================================================
 * * 🛠️ SETUP INSTRUCTIONS:
 * 1. WORKER: Create a Worker in Cloudflare Dashboard.
 * 2. ROUTE: Settings -> Triggers -> Add Route -> `technochat.in/cw-trigger*`
 * 3. ENV VARS (Settings -> Variables):
 * - Add Variable: `VISUAL_MODE` = "true" (or "false")
 * - Add Secret:   `API_KEY` = "YourSuperSecretKeyHere"
 * 4. CONFIG: Update the sitemaps section below.
 * * 🎮 MODES:
 * 1. AUTO (Browser):   https://technochat.in/cw-trigger?mode=warm&offset=0
 * 2. DEBUG (Browser):  https://technochat.in/cw-trigger?mode=debug&offset=0
 * 3. API (Automation): https://technochat.in/cw-trigger?mode=api&offset=0&key=YOUR_SECRET
 * 4. TEST (Health):    https://technochat.in/cw-trigger?mode=test&key=YOUR_SECRET
 * ==================================================
 */

export default {
  async fetch(request, env, ctx) {
    return await handleRequest(request, env, ctx);
  }
};

// --- ⚙️ CONFIGURATION ---
const CONFIG = {
  // 🟢 CLEAN URL MODE:
  // If TRUE: 'warm' & 'debug' modes (Browser) DO NOT require/expose the API Key.
  // If FALSE: All modes require the API Key.
  // ⬇️ Loaded from ENV (VISUAL_MODE: "true" / "false")
  CLEAN_URL_VISUAL_MODE: true,

  // 📋 SITEMAPS FOR API / AUTOMATION
  SITEMAPS_API: [
    "https://technochat.in/sitemap-posttype-post.xml",
    "https://technochat.in/sitemap-taxonomy-category.xml",
    "https://technochat.in/sitemap-posttype-page.xml"
  ],

  // 📋 SITEMAPS FOR BROWSER (VISUAL) MODE
  // (Can be the same as API, or a larger list if you prefer)
  SITEMAPS_VISUAL: [
    "https://technochat.in/sitemap.xml"
  ],

  BATCH_SIZE: 40,
  VERIFY_SIZE: 40,
  DELAY_MS: 50,
  WORKER_ROUTE: "https://technochat.in/cw-trigger", // Must match your Cloudflare Route

  // ⬇️ Loaded from ENV (API_KEY: Secret)
  API_SECRET: ""
};

const fmtSize = (bytes) => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
};

async function handleRequest(request, env, ctx) {
  // 🔧 LOAD ENVIRONMENT VARIABLES (NO LOGIC REMOVED)
  if (typeof env.VISUAL_MODE === "string") {
    CONFIG.CLEAN_URL_VISUAL_MODE = env.VISUAL_MODE.toLowerCase() === "true";
  }

  if (env.API_KEY) {
    CONFIG.API_SECRET = env.API_KEY;
  }

  const url = new URL(request.url);
  const params = url.searchParams;
  const mode = params.get("mode") || "warm";

  // Determine which Sitemap List to use
  const targetSitemaps =
    mode === "api" || mode === "test"
      ? CONFIG.SITEMAPS_API
      : CONFIG.SITEMAPS_VISUAL;

  // 🔒 SECURITY CHECK
  // If Clean URL Mode is ON, skip check for 'warm'/'debug'. Otherwise check everything.
  const requiresAuth =
    !((mode === "warm" || mode === "debug") && CONFIG.CLEAN_URL_VISUAL_MODE);

  if (requiresAuth && CONFIG.API_SECRET) {
    const key = params.get("key");
    if (key !== CONFIG.API_SECRET) {
      return new Response(
        JSON.stringify({
          status: "error",
          msg: "⛔ Unauthorized: Invalid or Missing Key"
        }),
        {
          status: 401,
          headers: { "content-type": "application/json" }
        }
      );
    }
  }

  // 🧪 TEST MODE
  if (mode === "test") {
    return new Response(
      JSON.stringify({
        status: "ok",
        msg: "✅ Connection Valid",
        timestamp: new Date().toISOString()
      }),
      { headers: { "content-type": "application/json" } }
    );
  }

  // 1. GET PARAMETERS
  const smIdx = parseInt(params.get("smIdx") || "0");
  const offset = parseInt(params.get("offset") || "0");
  let runningBytes = parseInt(params.get("totalBytes") || "0");
  const chainStartTime = parseInt(
    params.get("startTime") || Date.now()
  );

  // 2. CHECK COMPLETION
  if (smIdx >= targetSitemaps.length) {
    if (mode === "api") {
      console.log("✅ [API] Chain Complete.");
      return new Response(
        JSON.stringify({
          status: "done",
          msg: "All Sitemaps Completed"
        }),
        { headers: { "content-type": "application/json" } }
      );
    }

    const totalTimeSec = (
      (Date.now() - chainStartTime) /
      1000
    ).toFixed(1);

    // Verification on the first visual sitemap
    const { urls } = await fetchAndParseSitemap(targetSitemaps[0]);
    return await runVerification(urls, runningBytes, totalTimeSec);
  }

  // 3. FETCH CURRENT SITEMAP
  const currentSitemapUrl = targetSitemaps[smIdx];
  const { urls, size, error } =
    await fetchAndParseSitemap(currentSitemapUrl);

  if (error) {
    const errorMsg = `Sitemap Error: ${error}`;
    console.error(
      `❌ [${mode.toUpperCase()}] ${errorMsg} - URL: ${currentSitemapUrl}`
    );

    // API Mode: Return JSON to let Driver skip
    if (mode === "api") {
      return new Response(
        JSON.stringify({
          status: "continue",
          next_smIdx: smIdx + 1,
          next_offset: 0,
          msg: `Skipping Sitemap ${smIdx + 1} (${error})`
        }),
        { headers: { "content-type": "application/json" } }
      );
    }

    // Visual Mode: Auto-Redirect
    const nextUrl = buildNextUrl(
      mode,
      smIdx + 1,
      0,
      runningBytes,
      chainStartTime
    );
    return handleRedirect(
      mode,
      "⚠️ Sitemap Error",
      `Skipping... (${error})`,
      nextUrl,
      0,
      [],
      runningBytes
    );
  }

  if (offset === 0) runningBytes += size;

  // 4. PREPARE BATCH
  const batch = urls.slice(offset, offset + CONFIG.BATCH_SIZE);

  // 5. CHECK IF SITEMAP FINISHED
  if (batch.length === 0) {
    console.log(
      `✅ [${mode.toUpperCase()}] Sitemap ${smIdx + 1} Finished.`
    );

    if (mode === "api") {
      return new Response(
        JSON.stringify({
          status: "continue",
          next_smIdx: smIdx + 1,
          next_offset: 0,
          msg: "Sitemap Done. Moving to next..."
        }),
        { headers: { "content-type": "application/json" } }
      );
    }

    const nextUrl = buildNextUrl(
      mode,
      smIdx + 1,
      0,
      runningBytes,
      chainStartTime
    );
    return handleRedirect(
      mode,
      "Sitemap Complete",
      "Loading next sitemap...",
      nextUrl,
      100,
      [],
      runningBytes
    );
  }

  // 6. PROCESS BATCH
  const batchResults = await processBatch(batch);

  let batchBytes = 0;
  let stats = { hit: 0, miss: 0, dynamic: 0, error: 0 };

  batchResults.forEach((r) => {
    batchBytes += r.size;
    if (r.cf === "HIT") stats.hit++;
    else if (r.cf === "MISS") stats.miss++;
    else if (r.cf === "DYNAMIC" || r.cf === "BYPASS") stats.dynamic++;
    else stats.error++;
  });

  runningBytes += batchBytes;

  // 📝 SYSTEM LOGGING
  console.log(
    `📊 [${mode.toUpperCase()}] SM:${smIdx + 1} Batch ${offset}-${
      offset + batch.length
    } | HIT:${stats.hit} MISS:${stats.miss} DYN:${stats.dynamic} ERR:${
      stats.error
    } | Size:${fmtSize(batchBytes)}`
  );

  // 7. PREPARE NEXT STEP
  const nextOffset = offset + CONFIG.BATCH_SIZE;
  const progress = Math.min(
    Math.round((nextOffset / urls.length) * 100),
    99
  );

  // 8. RETURN RESPONSE
  if (mode === "api") {
    return new Response(
      JSON.stringify({
        status: "continue",
        next_smIdx: smIdx,
        next_offset: nextOffset,
        total_bytes: runningBytes,
        start_time: chainStartTime,
        batch_count: batch.length,
        current_sitemap_index: smIdx + 1,
        stats: stats
      }),
      { headers: { "content-type": "application/json" } }
    );
  }

  // Visual HTML Response
  const nextUrl = buildNextUrl(
    mode,
    smIdx,
    nextOffset,
    runningBytes,
    chainStartTime
  );
  return generateHtml(
    mode,
    `Warming Sitemap ${smIdx + 1}`,
    `Batch ${offset} - ${offset + batch.length}`,
    nextUrl,
    progress,
    batchResults,
    runningBytes
  );
}

// --- 🛠️ HELPERS ---
// (No changes below this line – logic preserved exactly)


// --- 🛠️ HELPERS ---

function buildNextUrl(mode, smIdx, offset, bytes, time) {
  let url = `${CONFIG.WORKER_ROUTE}?mode=${mode}&smIdx=${smIdx}&offset=${offset}&totalBytes=${bytes}&startTime=${time}`;

  // 🔒 Only append API Key if NOT in Clean Mode (or if mode requires it)
  const isCleanMode =
    (mode === "warm" || mode === "debug") &&
    CONFIG.CLEAN_URL_VISUAL_MODE;

  if (!isCleanMode && CONFIG.API_SECRET) {
    url += `&key=${CONFIG.API_SECRET}`;
  }

  return url;
}

function handleRedirect(mode, title, sub, nextUrl, progress, logs, bytes) {
  return generateHtml(mode, title, sub, nextUrl, progress, logs, bytes);
}

// 🔄 UPDATED: SITEMAP PARSER (Recursive Sub-Sitemap Support)
async function fetchAndParseSitemap(url) {
  // Internal fetcher with retry
  const fetchUrl = async (u, attempt = 1) => {
    try {
      const res = await fetch(u, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; Cloudflare-Warmer/1.0)"
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text(); // Get text for regex parsing
    } catch (e) {
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 1000));
        return fetchUrl(u, attempt + 1);
      }
      throw e;
    }
  };

  try {
    const xml = await fetchUrl(url);
    const urls = [];

    // 1. Check for Sub-Sitemaps (<sitemapindex>)
    const sitemapRegex =
      /<sitemap>[\s\S]*?<loc>(.*?)<\/loc>[\s\S]*?<\/sitemap>/g;
    let smMatch;
    const subSitemaps = [];

    // If it's an index, grab all children URLs
    while ((smMatch = sitemapRegex.exec(xml)) !== null) {
      subSitemaps.push(smMatch[1]);
    }

    if (subSitemaps.length > 0) {
      // 🔄 It's a Sitemap Index! Fetch children in parallel (limit 10 for safety)
      // Note: We only go 1 level deep to prevent infinite recursion/timeouts
      const limit = 10;
      const toProcess = subSitemaps.slice(0, limit);

      console.log(
        `📂 Found Sitemap Index: ${url} with ${subSitemaps.length} children. Processing first ${limit}...`
      );

      const childrenResults = await Promise.all(
        toProcess.map(async (childUrl) => {
          try {
            const childXml = await fetchUrl(childUrl);
            const childUrls = [];
            const urlRegex =
              /<url>[\s\S]*?<loc>(.*?)<\/loc>[\s\S]*?<\/url>/g;
            let uMatch;
            while ((uMatch = urlRegex.exec(childXml)) !== null) {
              childUrls.push(uMatch[1]);
            }
            return childUrls;
          } catch (e) {
            console.error(
              `Error fetching child sitemap ${childUrl}: ${e.message}`
            );
            return [];
          }
        })
      );

      // Flatten array
      childrenResults.forEach((child) => urls.push(...child));
    } else {
      // 2. Standard Sitemap (Direct URLs)
      const urlRegex =
        /<url>[\s\S]*?<loc>(.*?)<\/loc>[\s\S]*?<\/url>/g;
      let match;
      while ((match = urlRegex.exec(xml)) !== null) {
        urls.push(match[1]);
      }
    }

    if (urls.length === 0) {
      return { urls: [], size: 0, error: "Empty or Invalid XML" };
    }

    return {
      urls: urls.sort(),
      size: new TextEncoder().encode(xml).length,
      error: null
    };
  } catch (e) {
    return { urls: [], size: 0, error: e.message };
  }
}

async function processBatch(urls) {
  const results = [];

  await Promise.all(
    urls.map(async (u) => {
      const start = Date.now();
      try {
        await new Promise((r) =>
          setTimeout(r, Math.random() * CONFIG.DELAY_MS)
        );
        const res = await fetch(u, {
          headers: {
            "User-Agent": "CF-Worker-Warmer",
            "X-Purpose": "Warming"
          }
        });
        const buf = await res.arrayBuffer();
        const size = buf.byteLength;
        const cfStatus =
          res.headers.get("cf-cache-status") || "MISS";

        let cssClass = "miss";
        if (cfStatus === "HIT") cssClass = "hit";
        else if (cfStatus === "DYNAMIC" || cfStatus === "BYPASS") {
          cssClass = "dynamic";
        }

        results.push({
          url: u.replace("https://technochat.in", ""),
          status: res.status,
          cf: cfStatus,
          size: size,
          sizeStr: fmtSize(size),
          time: Date.now() - start,
          icon: cfStatus === "HIT" ? "⚡" : "☁️",
          cls: cssClass
        });
      } catch (e) {
        results.push({
          url: u,
          status: "ERR",
          cf: "ERR",
          size: 0,
          sizeStr: "0 B",
          time: 0,
          icon: "❌",
          cls: "err"
        });
      }
    })
  );

  return results.sort((a, b) => a.url.localeCompare(b.url));
}

// --- 🕵️ VERIFICATION ---
async function runVerification(allUrls, totalBytes, totalTime) {
  const randomUrls = allUrls
    .sort(() => 0.5 - Math.random())
    .slice(0, CONFIG.VERIFY_SIZE);

  let hitCount = 0;
  const logs = [];

  await Promise.all(
    randomUrls.map(async (u) => {
      const start = Date.now();
      try {
        const res = await fetch(u, {
          headers: { "User-Agent": "CF-Warmer-Verify" }
        });
        await res.arrayBuffer();
        const cf =
          res.headers.get("cf-cache-status") || "MISS";
        if (cf === "HIT") hitCount++;

        const time = Date.now() - start;
        const cleanUrl = u.replace("https://technochat.in", "");
        const icon = cf === "HIT" ? "💚" : "⚠️";

        let cssClass = "miss";
        if (cf === "HIT") cssClass = "hit";
        else if (cf === "DYNAMIC" || cf === "BYPASS") {
          cssClass = "dynamic";
        }

        logs.push({
          url: cleanUrl,
          status: res.status,
          cf: cf,
          time: time,
          icon: icon,
          cls: cssClass
        });
      } catch (e) {}
    })
  );

  const successRate = Math.round(
    (hitCount / randomUrls.length) * 100
  );
  const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);

  return generateFinalReport(
    successRate,
    totalMB,
    totalTime,
    logs
  );
}

// --- 🎨 UI (Awesome Light Theme) ---
const CSS = `
  :root { --bg-body: #f0f2f5; --bg-card: #ffffff; --text-primary: #111827; --text-secondary: #6b7280; --border: #e5e7eb; --accent-gradient: linear-gradient(135deg, #3b82f6, #2563eb); --accent-shadow: rgba(37, 99, 235, 0.3); --hit-gradient: linear-gradient(135deg, #22c55e, #16a34a); --miss-gradient: linear-gradient(135deg, #ef4444, #dc2626); --dyn-gradient: linear-gradient(135deg, #f59e0b, #d97706); --success-glow: rgba(34, 197, 94, 0.4); }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg-body); color: var(--text-primary); padding: 40px 20px; margin: 0; }
  .dashboard { background: var(--bg-card); border-radius: 24px; box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.08); max-width: 900px; margin: 0 auto; overflow: hidden; border: 1px solid rgba(255,255,255,0.5); }
  .header { display: flex; justify-content: space-between; align-items: center; padding: 30px 40px; border-bottom: 1px solid var(--border); background: #fafafa; }
  .title h1 { margin: 0; font-size: 22px; font-weight: 800; color: var(--text-primary); letter-spacing: -0.5px; }
  .title small { color: var(--text-secondary); font-size: 14px; font-weight: 500; }
  .stats { display: flex; gap: 30px; }
  .stat-box { display: flex; flex-direction: column; align-items: flex-end; }
  .stat-val { color: var(--text-primary); font-weight: 800; font-size: 15px; }
  .stat-label { color: var(--text-secondary); font-size: 11px; text-transform: uppercase; font-weight: 700; }
  .progress-section { padding: 0 40px; margin-top: 30px; }
  .bar-container { background: #e5e7eb; height: 10px; border-radius: 99px; overflow: hidden; box-shadow: inset 0 2px 4px rgba(0,0,0,0.05); }
  .bar-fill { background: var(--accent-gradient); height: 100%; transition: width 0.4s ease; border-radius: 99px; }
  .progress-info { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 13px; font-weight: 700; color: var(--text-secondary); }
  .controls { padding: 20px 40px; display: flex; justify-content: flex-end; align-items: center; height: 40px; }
  .btn-awesome { background: var(--accent-gradient); color: #fff; padding: 12px 28px; border-radius: 50px; text-decoration: none; font-size: 15px; font-weight: 700; display: inline-flex; align-items: center; gap: 10px; box-shadow: 0 10px 25px -5px var(--accent-shadow); transition: all 0.3s ease; }
  .btn-awesome:hover { transform: translateY(-2px); box-shadow: 0 15px 30px -5px var(--accent-shadow); }
  .btn-svg { width: 24px; height: 24px; stroke-width: 3px; }
  .spinner-container { display: flex; align-items: center; gap: 12px; color: var(--text-secondary); font-size: 13px; font-weight: 600; background: #f3f4f6; padding: 8px 16px; border-radius: 50px; }
  .spinner { width: 18px; height: 18px; border: 3px solid #e5e7eb; border-top: 3px solid #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; }
  @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  .ring-wrapper { padding: 60px 0 40px 0; text-align: center; background: #fafafa; border-bottom: 1px solid var(--border); }
  .ring-container { position: relative; width: 180px; height: 180px; margin: 0 auto 25px auto; display: flex; justify-content: center; align-items: center; }
  .ring-glow { position: absolute; inset: -10px; border-radius: 50%; background: conic-gradient(from 0deg, transparent 20%, var(--success-glow) 100%); filter: blur(20px); opacity: 0.7; z-index: 0; animation: pulseGlow 3s infinite alternate; }
  .ring-inner { position: relative; z-index: 1; width: 100%; height: 100%; background: #fff; border-radius: 50%; border: 6px solid #22c55e; display: flex; justify-content: center; align-items: center; box-shadow: inset 0 0 20px var(--success-glow), 0 10px 25px -5px rgba(34, 197, 94, 0.3); }
  .ring-number { font-size: 56px; font-weight: 900; color: #166534; line-height: 1; }
  .ring-title { margin: 0; font-size: 26px; font-weight: 800; color: var(--text-primary); }
  .ring-sub { color: var(--text-secondary); font-size: 15px; margin-top: 8px; font-weight: 500; }
  @keyframes pulseGlow { 0% { opacity: 0.5; transform: scale(0.95); } 100% { opacity: 0.8; transform: scale(1.05); } }
  .table-container { padding: 0 40px 40px 40px; }
  table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 13px; margin-top: 20px; }
  th { text-align: left; color: var(--text-secondary); font-weight: 700; border-bottom: 2px solid var(--border); padding: 15px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
  td { padding: 15px 10px; border-bottom: 1px solid var(--border); color: var(--text-primary); vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  .mono { font-family: 'SFMono-Regular', Consolas, monospace; font-size: 12px; }
  .url { color: #2563eb; max-width: 350px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; text-decoration: none; font-weight: 600; }
  .badge { padding: 6px 12px; border-radius: 99px; font-weight: 800; font-size: 11px; display: inline-block; min-width: 50px; text-align: center; color: white; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
  .hit .badge { background: var(--hit-gradient); }
  .miss .badge { background: var(--miss-gradient); }
  .dynamic .badge { background: var(--dyn-gradient); }
  .err .badge { background: #333; }
`;

function generateHtml(
  mode,
  title,
  subtitle,
  nextUrl,
  progress,
  logs = [],
  totalBytes
) {
  const isDebug = mode === "debug";
  const svgArrow = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="btn-svg"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>`;
  const control = isDebug
    ? `<a href="${nextUrl}" class="btn-awesome">${svgArrow} Next Batch</a>`
    : `<div class="spinner-container"><div class="spinner"></div><span>Auto-processing...</span></div><meta http-equiv="refresh" content="1;url=${nextUrl}" />`;
  const rows = logs
    .map(
      (l) =>
        `<tr class="${l.cls}"><td><span class="badge">${l.cf}</span></td><td class="mono"><b>${l.status}</b></td><td class="mono">${l.sizeStr}</td><td class="mono" style="color:#6b7280">${l.time}ms</td><td><span class="url mono" title="${l.url}">${l.url}</span></td></tr>`
    )
    .join("");

  return new Response(
    `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Cache Warmer</title><style>${CSS}</style></head><body><div class="dashboard"><div class="header"><div class="title"><h1>Cloudflare Warmer</h1><small>${title}</small></div><div class="stats"><div class="stat-box"><span class="stat-label">Data Transferred</span><span class="stat-val">${fmtSize(
      totalBytes
    )}</span></div><div class="stat-box"><span class="stat-label">Mode</span><span class="stat-val" style="color:#3b82f6">${mode.toUpperCase()}</span></div></div></div><div class="progress-section"><div class="progress-info"><span>${subtitle}</span><span>${progress}%</span></div><div class="bar-container"><div class="bar-fill" style="width:${progress}%"></div></div></div><div class="controls">${control}</div><div class="table-container"><table><thead><tr><th>Cache</th><th>St</th><th>Size</th><th>Time</th><th>Resource</th></tr></thead><tbody>${rows}</tbody></table></div></div></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

function generateFinalReport(rate, mb, time, logs) {
  const rows = logs
    .map(
      (l) =>
        `<tr class="${l.cls}"><td><span class="badge">${l.cf}</span></td><td class="mono" style="color:#6b7280">${l.time}ms</td><td><span class="url mono">${l.url}</span></td></tr>`
    )
    .join("");

  let ringColor, ringGlow;
  if (rate > 90) {
    ringColor = "#166534";
    ringGlow = "var(--success-glow)";
  } else if (rate > 70) {
    ringColor = "#d97706";
    ringGlow = "rgba(245, 158, 11, 0.4)";
  } else {
    ringColor = "#dc2626";
    ringGlow = "rgba(239, 68, 68, 0.4)";
  }

  const ringStyle = `border-color: ${ringColor}; color: ${ringColor}; box-shadow: inset 0 0 20px ${ringGlow}, 0 10px 25px -5px ${ringGlow};`;

  return new Response(
    `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Report</title><style>${CSS}</style></head><body><div class="dashboard"><div class="ring-wrapper"><div class="ring-container"><div class="ring-glow" style="background: conic-gradient(from 0deg, transparent 20%, ${ringGlow} 100%);"></div><div class="ring-inner" style="${ringStyle}"><span class="ring-number">${rate}</span></div></div><h1 class="ring-title">Cache Efficiency</h1><p class="ring-sub">Verification Report</p></div><div class="header" style="justify-content: center; gap: 50px; background: white; border-bottom: none; padding-top: 30px;"><div class="stat-box" style="align-items: center;"><span class="stat-label">Total Data</span><span class="stat-val" style="font-size:18px">${mb} MB</span></div><div class="stat-box" style="align-items: center;"><span class="stat-label">Total Time</span><span class="stat-val" style="font-size:18px">${time}s</span></div><div class="stat-box" style="align-items: center;"><span class="stat-label">Verified URLs</span><span class="stat-val" style="font-size:18px">${logs.length}</span></div></div><div class="table-container"><h4 style="margin: 30px 0 15px 0; color: var(--text-secondary); text-transform: uppercase; font-size: 12px; letter-spacing: 1px; font-weight: 800;">Sample Verification Data</h4><table><tbody>${rows}</tbody></table></div></div></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } }
  );
}
