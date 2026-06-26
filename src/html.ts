import { assets } from "./assets.js";

const knownSymbols = new Set<string>();
for (const asset of assets) {
  knownSymbols.add(asset.symbol.toUpperCase());
}

const skipWords = new Set([
  "THE", "FOR", "AND", "ARE", "NOT", "ALL", "YOU", "USE", "TRY", "TIP",
  "ASSET", "NAME", "PRICE", "VOLUME", "SOURCE", "STABLES", "METRIC",
  "SYMBOL", "SCORE", "AMOUNT", "TOTAL", "START", "BUILD", "DATA",
  "RANK", "BTC", "ETH"
]);

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/btc", label: "BTC" },
  { href: "/eth", label: "ETH" },
  { href: "/sol", label: "SOL" },
  { href: "/trending", label: "Trending" },
  { href: "/help", label: "Help" },
];

export function renderHtmlPage(title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#1a1a2e">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>${escapeHtml(title)}</title>
<style>
  body {
    background: #1a1a2e;
    color: #e0e0e0;
    font-family: Menlo, Monaco, 'Courier New', monospace;
    font-size: 16px;
    line-height: 1.6;
    padding: 16px;
    margin: 0;
    -webkit-text-size-adjust: 100%;
  }
  nav {
    position: sticky;
    top: 0;
    z-index: 100;
    background: #1a1a2e;
    border-bottom: 1px solid #333;
    padding: 8px 0 10px 0;
    margin: -16px -16px 12px -16px;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
  }
  nav a {
    color: #00bcd4;
    text-decoration: none;
    font-size: 15px;
    padding: 6px 0;
  }
  nav a::before {
    content: ">> ";
    color: #555;
  }
  nav a:active { opacity: 0.6; }
  pre {
    margin: 0;
    font-family: inherit;
    font-size: inherit;
    line-height: inherit;
    white-space: pre-wrap;
    word-break: break-word;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  a { color: #00bcd4; text-decoration: none; }
  a:active { opacity: 0.6; }
  .footer {
    margin-top: 24px;
    padding-top: 12px;
    border-top: 1px solid #333;
    color: #666;
    font-size: 14px;
    line-height: 2;
  }
  .footer a { color: #666; }
  .footer a:active { color: #00bcd4; }
</style>
</head>
<body>
<nav>${navLinks.map((l) => `<a href="${l.href}">${l.label}</a>`).join("")}</nav>
<pre>${makeLinks(content)}</pre>
<div class="footer">
<a href="/help">help</a> ·
<a href="https://github.com/luchopcerra">github</a> ·
<a href="https://x.com/luchopcerra">x</a> ·
<a href="https://www.linkedin.com/in/luciano-perez-cerra/">linkedin</a>
</div>
</body>
</html>`;
}

export function makeLinks(text: string): string {
  const parts = text.split(/(<[^>]*>)/);

  return parts.map((part, i) => {
    if (i % 2 === 1) return part;

    let p = part;

    p = p.replace(/(https?:\/\/[^\s<>'"`]+)/g, '<a href="$1">$1</a>');

    p = p.replace(
      /([\w-]+\.perezcerraluciano\.workers\.dev[^\s<>'"`:]*)/g,
      '<a href="https://$1">$1</a>'
    );

    p = p.replace(
      /(localhost:\d+[^\s<>'"`:]*)/g,
      '<a href="http://$1">$1</a>'
    );

    p = p.replace(
      /(\/(?:help|--help|-h|trending|install|api\/assets|health|feed\.txt|rss\.xml|api\/prices|compare(?:\/[a-z0-9]+)+)\b)/g,
      '<a href="$1">$1</a>'
    );

    p = p.replace(/\b([A-Z]{2,6})\b/g, (match) => {
      if (skipWords.has(match)) return match;
      if (!knownSymbols.has(match)) return match;
      return `<a href="/${match.toLowerCase()}">${match}</a>`;
    });

    return p;
  }).join('');
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
