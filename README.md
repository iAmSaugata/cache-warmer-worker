# 🚀 Ultimate Cloudflare Cache Warmer

A powerful, production-ready Cloudflare Worker that systematically warms your website's cache by fetching URLs from your sitemaps. Features a beautiful visual interface, API mode for automation, and intelligent sitemap parsing with recursive support.

## ✨ Features

- **🎨 Beautiful Visual Interface** - Clean, modern UI with real-time progress tracking
- **🤖 API Mode** - Automate cache warming via REST API
- **📊 Live Statistics** - Track cache hits, misses, data transfer, and performance
- **🔄 Recursive Sitemap Support** - Automatically processes sitemap indexes and child sitemaps
- **🔒 Secure** - API key authentication with optional clean URL mode for browser access
- **⚡ Efficient** - Configurable batch processing with concurrent requests
- **📈 Verification Report** - Post-warming analysis with cache efficiency metrics
- **🎯 Multi-Mode Operation** - Visual, Debug, API, and Test modes

## 🎮 Operation Modes

### 1. **AUTO Mode** (Browser - Auto-advance)
Automatically processes batches and advances through sitemaps without manual intervention.
```
https://yourdomain.com/cw-trigger?mode=warm&offset=0
```

### 2. **DEBUG Mode** (Browser - Manual control)
Manual batch-by-batch processing with "Next Batch" button for controlled warming.
```
https://yourdomain.com/cw-trigger?mode=debug&offset=0
```

### 3. **API Mode** (Automation)
JSON responses for programmatic control and integration with external tools.
```
https://yourdomain.com/cw-trigger?mode=api&offset=0&key=YOUR_SECRET_KEY
```

### 4. **TEST Mode** (Health Check)
Verify worker configuration and API key validity.
```
https://yourdomain.com/cw-trigger?mode=test&key=YOUR_SECRET_KEY
```

## 🛠️ Installation & Configuration

### Step 1: Create Cloudflare Worker

1. Log into your [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **Workers & Pages** → **Create Application** → **Create Worker**
3. Name your worker (e.g., `cache-warmer`)
4. Click **Deploy** (we'll add code next)

### Step 2: Add Worker Code

1. Click **Edit Code** on your newly created worker
2. Delete the default code
3. Copy and paste the entire cache warmer code
4. Click **Save and Deploy**

### Step 3: Configure Route

1. Go to your worker's **Settings** → **Triggers**
2. Click **Add Route**
3. Configure:
   - **Route**: `yourdomain.com/cw-trigger*` (replace with your domain)
   - **Zone**: Select your domain
4. Click **Save**

> **Important**: The route pattern `/cw-trigger*` catches all requests to `/cw-trigger` with any query parameters.

### Step 4: Set Environment Variables

1. Navigate to **Settings** → **Variables**
2. Add the following:

#### Environment Variable (Optional)
- **Variable Name**: `VISUAL_MODE`
- **Value**: `true` or `false`
- **Purpose**: When `true`, browser modes (warm/debug) don't require API key in URL

#### Secret (Required)
- **Variable Name**: `API_KEY`
- **Value**: Your secret key (e.g., `MySecureKey123!`)
- **Purpose**: Authenticates API and test mode requests
- Click **Encrypt** to store as a secret

### Step 5: Configure Sitemaps

Edit the `CONFIG` object in the worker code:

```javascript
const CONFIG = {
  // Browser/Visual modes use this sitemap list
  SITEMAPS_VISUAL: [
    "https://yourdomain.com/sitemap.xml"
  ],

  // API/Test modes use this sitemap list
  SITEMAPS_API: [
    "https://yourdomain.com/sitemap-posttype-post.xml",
    "https://yourdomain.com/sitemap-taxonomy-category.xml",
    "https://yourdomain.com/sitemap-posttype-page.xml"
  ],

  BATCH_SIZE: 40,        // URLs processed per batch
  VERIFY_SIZE: 40,       // Random URLs to verify after completion
  DELAY_MS: 50,          // Random delay between requests (0-50ms)
  WORKER_ROUTE: "https://yourdomain.com/cw-trigger"
};
```

**Replace `yourdomain.com` with your actual domain!**

### Step 6: Update Domain References

Search and replace `technochat.in` with your domain in:
- `WORKER_ROUTE` in CONFIG
- URL shortening in `processBatch()` function
- URL shortening in `runVerification()` function

```javascript
// Find and replace these lines:
url: u.replace("https://technochat.in", ""),
// With:
url: u.replace("https://yourdomain.com", ""),
```

## 📋 Configuration Options

### CONFIG Object

| Option | Default | Description |
|--------|---------|-------------|
| `CLEAN_URL_VISUAL_MODE` | `true` | Loaded from ENV. If `true`, browser modes don't expose API key in URL |
| `SITEMAPS_VISUAL` | Array | Sitemap URLs for browser modes (warm/debug) |
| `SITEMAPS_API` | Array | Sitemap URLs for API/automation modes |
| `BATCH_SIZE` | `40` | Number of URLs to process simultaneously |
| `VERIFY_SIZE` | `40` | Number of random URLs to verify after warming |
| `DELAY_MS` | `50` | Maximum random delay between requests (ms) |
| `WORKER_ROUTE` | String | Your worker's public URL (must match trigger route) |

### Environment Variables

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `VISUAL_MODE` | Variable | No | Set to `"true"` to enable clean URLs for browser modes |
| `API_KEY` | Secret | Yes | Authentication key for API and test modes |

## 🚦 Usage Examples

### Starting Cache Warming (Browser)

**Auto Mode** (hands-free):
```
https://yourdomain.com/cw-trigger?mode=warm&offset=0
```

**Debug Mode** (manual control):
```
https://yourdomain.com/cw-trigger?mode=debug&offset=0
```

### API Integration (Automation)

**Test Connection**:
```bash
curl "https://yourdomain.com/cw-trigger?mode=test&key=YOUR_SECRET_KEY"
```

Response:
```json
{
  "status": "ok",
  "msg": "✅ Connection Valid",
  "timestamp": "2026-02-04T10:30:00.000Z"
}
```

**Start Warming**:
```bash
curl "https://yourdomain.com/cw-trigger?mode=api&offset=0&key=YOUR_SECRET_KEY"
```

Response:
```json
{
  "status": "continue",
  "next_smIdx": 0,
  "next_offset": 40,
  "total_bytes": 245632,
  "start_time": 1738665000000,
  "batch_count": 40,
  "current_sitemap_index": 1,
  "stats": {
    "hit": 5,
    "miss": 32,
    "dynamic": 3,
    "error": 0
  }
}
```

**Continue Processing** (use values from previous response):
```bash
curl "https://yourdomain.com/cw-trigger?mode=api&smIdx=0&offset=40&totalBytes=245632&startTime=1738665000000&key=YOUR_SECRET_KEY"
```

### Automation Script Example

```bash
#!/bin/bash

API_KEY="YOUR_SECRET_KEY"
BASE_URL="https://yourdomain.com/cw-trigger"

# Test connection
echo "Testing connection..."
curl -s "${BASE_URL}?mode=test&key=${API_KEY}"

# Start warming
echo -e "\n\nStarting cache warming..."
NEXT_URL="${BASE_URL}?mode=api&offset=0&key=${API_KEY}"

while true; do
  RESPONSE=$(curl -s "$NEXT_URL")
  STATUS=$(echo "$RESPONSE" | jq -r '.status')
  
  if [ "$STATUS" == "done" ]; then
    echo "✅ Warming complete!"
    break
  fi
  
  # Extract next request parameters
  SM_IDX=$(echo "$RESPONSE" | jq -r '.next_smIdx')
  OFFSET=$(echo "$RESPONSE" | jq -r '.next_offset')
  BYTES=$(echo "$RESPONSE" | jq -r '.total_bytes')
  START=$(echo "$RESPONSE" | jq -r '.start_time')
  
  echo "Processing sitemap $SM_IDX, offset $OFFSET..."
  
  NEXT_URL="${BASE_URL}?mode=api&smIdx=${SM_IDX}&offset=${OFFSET}&totalBytes=${BYTES}&startTime=${START}&key=${API_KEY}"
  
  sleep 1  # Rate limiting
done
```

## 📊 Understanding the Output

### Visual Mode Dashboard

The browser interface shows:
- **Header**: Current operation title and mode
- **Stats**: Data transferred and operation mode
- **Progress Bar**: Current sitemap completion percentage
- **Cache Status Table**: Real-time results per URL
  - ⚡ HIT - Served from cache
  - ☁️ MISS - Not in cache, fetched from origin
  - 🔄 DYNAMIC - Dynamic content (bypassed cache)
  - ❌ ERR - Request failed

### Verification Report

After completing all sitemaps, you'll see:
- **Cache Efficiency Score**: Percentage of URLs cached (HIT status)
- **Total Data Transferred**: Cumulative size of all fetched resources
- **Total Time**: Duration of entire warming process
- **Sample Verification**: Random URL check to confirm cache status

## 🔐 Security Considerations

### Clean URL Mode (`VISUAL_MODE=true`)

**Enabled (Default)**:
- Browser modes (`warm`, `debug`) work without API key in URL
- API and test modes still require authentication
- Cleaner, more user-friendly URLs for manual use

**Disabled (`VISUAL_MODE=false`)**:
- ALL modes require API key in URL
- Maximum security for public-facing workers

### API Key Best Practices

1. **Use Strong Keys**: Minimum 16 characters, mix of letters, numbers, symbols
2. **Store as Secret**: Always use encrypted variables in Cloudflare
3. **Rotate Regularly**: Change keys periodically
4. **Limit Access**: Don't share API key publicly
5. **Monitor Logs**: Check worker analytics for unauthorized access

## 🎯 Advanced Features

### Recursive Sitemap Support

The worker automatically detects and processes sitemap indexes:

```xml
<!-- Sitemap Index -->
<sitemapindex>
  <sitemap>
    <loc>https://yourdomain.com/sitemap-posts.xml</loc>
  </sitemap>
  <sitemap>
    <loc>https://yourdomain.com/sitemap-pages.xml</loc>
  </sitemap>
</sitemapindex>
```

It will:
1. Detect the sitemap index structure
2. Fetch up to 10 child sitemaps in parallel
3. Extract all URLs from children
4. Process them in batches

**Note**: Only processes one level deep to prevent infinite recursion.

### Custom Batch Configuration

Adjust processing speed by modifying:

```javascript
BATCH_SIZE: 40,   // Lower = slower, more controlled
                  // Higher = faster, more aggressive

DELAY_MS: 50,     // Random delay between 0-50ms
                  // Increase to reduce server load
```

### Multiple Sitemap Lists

Use different sitemaps for different modes:

```javascript
// Complete site for visual monitoring
SITEMAPS_VISUAL: [
  "https://yourdomain.com/sitemap.xml"
],

// Targeted sitemaps for API automation
SITEMAPS_API: [
  "https://yourdomain.com/sitemap-critical.xml",
  "https://yourdomain.com/sitemap-homepage.xml"
]
```

## 🐛 Troubleshooting

### Issue: "Unauthorized: Invalid or Missing Key"

**Solution**: 
- Verify `API_KEY` secret is set in worker settings
- Ensure you're passing `key` parameter in API/test modes
- Check that key matches exactly (case-sensitive)

### Issue: Worker route not responding

**Solution**:
- Verify route is added: `yourdomain.com/cw-trigger*`
- Ensure route zone matches your domain
- Check worker is deployed (green "Active" status)
- Test route: `curl https://yourdomain.com/cw-trigger?mode=test&key=YOUR_KEY`

### Issue: "Empty or Invalid XML" error

**Solution**:
- Verify sitemap URLs are accessible
- Check sitemap format (must be valid XML)
- Test sitemap URL directly in browser
- Ensure no authentication is required for sitemap access

### Issue: Low cache hit rate after warming

**Possible causes**:
- Cache-Control headers on origin may be preventing caching
- Dynamic content that bypasses cache
- Cloudflare cache rules may be excluding certain URLs

**Check**:
- Page Rules in Cloudflare Dashboard
- Cache TTL settings
- Origin server cache headers

### Issue: Timeouts or slow performance

**Solution**:
- Reduce `BATCH_SIZE` (try 20 instead of 40)
- Increase `DELAY_MS` (try 100-200ms)
- Split large sitemaps into smaller ones
- Check worker CPU time in analytics

## 📈 Performance Optimization

### For Large Sites (1000+ URLs)

```javascript
BATCH_SIZE: 30,      // Reduce concurrent load
DELAY_MS: 100,       // Add breathing room
VERIFY_SIZE: 50      // Larger sample for accuracy
```

### For Small Sites (<500 URLs)

```javascript
BATCH_SIZE: 50,      // Process faster
DELAY_MS: 25,        // Minimal delay
VERIFY_SIZE: 30      // Sufficient sample
```

### Scheduled Warming (via Cron)

Use Cloudflare's Cron Triggers:

1. Add cron trigger in worker settings
2. Modify worker to handle cron events:

```javascript
export default {
  async scheduled(event, env, ctx) {
    // Auto-trigger warming via API mode
    const url = `${CONFIG.WORKER_ROUTE}?mode=api&offset=0&key=${env.API_KEY}`;
    await fetch(url);
  }
}
```

3. Set schedule (e.g., `0 2 * * *` for daily at 2 AM)

## 📝 Logging & Monitoring

The worker logs to Cloudflare's real-time logs:

```
📊 [WARM] SM:1 Batch 0-40 | HIT:5 MISS:32 DYN:3 ERR:0 | Size:1.2 MB
```

Access logs via:
- **Cloudflare Dashboard** → Workers → Your Worker → Logs
- **Wrangler CLI**: `wrangler tail`

## 🤝 Contributing

Contributions are welcome! Feel free to:
- Report bugs
- Suggest features
- Submit pull requests
- Improve documentation

## 📄 License

MIT License - feel free to use and modify for your needs.

## 🙏 Credits

Built with ❤️ for the Cloudflare Workers platform.

---

## 🔗 Quick Links

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Cloudflare Dashboard](https://dash.cloudflare.com)
- [Sitemap Protocol](https://www.sitemaps.org/protocol.html)

---

**Need Help?** Open an issue on GitHub or check the troubleshooting section above.
