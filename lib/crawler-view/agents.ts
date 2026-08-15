/**
 * The bots worth asking about, and what each one is actually for.
 *
 * `purpose` matters more than it looks. A site can allow the agent that answers
 * a user's question while blocking the one that collects training data, and most
 * robots.txt files do this by accident rather than on purpose.
 *
 * `control` agents are the odd ones: Google-Extended and Applebot-Extended never
 * make requests. They exist only as robots.txt tokens that signal how already
 * crawled content may be used, so fetching "as" them is meaningless.
 */
export type Purpose = "training" | "search" | "user" | "control";

export type Agent = {
  /** The token to match in robots.txt, as published by the operator. */
  token: string;
  label: string;
  operator: string;
  purpose: Purpose;
  /** Full User-Agent header, for agents we actually send a request as. */
  ua?: string;
  note?: string;
};

export const purposeLabels: Record<Purpose, string> = {
  training: "Training data",
  search: "Search & indexing",
  user: "User-triggered fetch",
  control: "Usage control tokens",
};

export const purposeNotes: Record<Purpose, string> = {
  training: "Collects pages to train or improve models.",
  search: "Builds an index used to answer questions with citations.",
  user: "Fetches a page because someone asked the assistant about it.",
  control: "Never crawls. Signals how already collected content may be used.",
};

export const agents: Agent[] = [
  // OpenAI
  {
    token: "GPTBot",
    label: "GPTBot",
    operator: "OpenAI",
    purpose: "training",
    ua: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.1; +https://openai.com/gptbot",
  },
  {
    token: "OAI-SearchBot",
    label: "OAI-SearchBot",
    operator: "OpenAI",
    purpose: "search",
    ua: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)",
    note: "Blocking this removes you from ChatGPT search results. It does not affect training.",
  },
  {
    token: "ChatGPT-User",
    label: "ChatGPT-User",
    operator: "OpenAI",
    purpose: "user",
    ua: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ChatGPT-User/1.0; +https://openai.com/bot)",
  },

  // Anthropic
  {
    token: "ClaudeBot",
    label: "ClaudeBot",
    operator: "Anthropic",
    purpose: "training",
    ua: "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
  },
  {
    token: "Claude-SearchBot",
    label: "Claude-SearchBot",
    operator: "Anthropic",
    purpose: "search",
    ua: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-SearchBot/1.0; +Claude-SearchBot@anthropic.com)",
  },
  {
    token: "Claude-User",
    label: "Claude-User",
    operator: "Anthropic",
    purpose: "user",
    ua: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +Claude-User@anthropic.com)",
  },

  // Google
  {
    token: "Googlebot",
    label: "Googlebot",
    operator: "Google",
    purpose: "search",
    ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    note: "Crawls for Google Search. Blocking it removes you from Google's results entirely.",
  },
  {
    token: "Google-Extended",
    label: "Google-Extended",
    operator: "Google",
    purpose: "control",
    note: "Controls whether Google may use your content for Gemini training and grounding. Separate from Googlebot — blocking it costs you nothing in Search.",
  },

  // Microsoft
  {
    token: "bingbot",
    label: "Bingbot",
    operator: "Microsoft",
    purpose: "search",
    ua: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/126.0.0.0 Safari/537.36",
    note: "Powers Bing Search. The same index also grounds Copilot's web answers, so blocking it affects both.",
  },

  // Yandex
  {
    token: "YandexBot",
    label: "YandexBot",
    operator: "Yandex",
    purpose: "search",
    ua: "Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)",
  },

  // Baidu
  {
    token: "Baiduspider",
    label: "Baiduspider",
    operator: "Baidu",
    purpose: "search",
    ua: "Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)",
  },

  // DuckDuckGo
  {
    token: "DuckDuckBot",
    label: "DuckDuckBot",
    operator: "DuckDuckGo",
    purpose: "search",
    ua: "DuckDuckBot/1.1; (+http://duckduckgo.com/duckduckbot.html)",
    note: "The classic DuckDuckGo web crawler, distinct from DuckAssistBot's AI-answer fetches below.",
  },

  // Common Crawl
  {
    token: "CCBot",
    label: "CCBot",
    operator: "Common Crawl",
    purpose: "training",
    ua: "CCBot/2.0 (https://commoncrawl.org/faq/)",
    note: "The quiet one. Its archive feeds training sets across the whole industry, so allowing it is closer to a blanket permission than most people realize.",
  },

  // Perplexity
  {
    token: "PerplexityBot",
    label: "PerplexityBot",
    operator: "Perplexity",
    purpose: "search",
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot",
  },
  {
    token: "Perplexity-User",
    label: "Perplexity-User",
    operator: "Perplexity",
    purpose: "user",
    ua: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)",
  },

  // Apple
  {
    token: "Applebot",
    label: "Applebot",
    operator: "Apple",
    purpose: "search",
    ua: "Mozilla/5.0 (Applebot/0.1; +http://www.apple.com/go/applebot)",
  },
  {
    token: "Applebot-Extended",
    label: "Applebot-Extended",
    operator: "Apple",
    purpose: "control",
    note: "Opts your content out of Apple's generative model training without affecting Siri or Spotlight.",
  },

  // Meta
  {
    token: "Meta-ExternalAgent",
    label: "Meta-ExternalAgent",
    operator: "Meta",
    purpose: "training",
    ua: "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/web-crawlers)",
  },
  {
    token: "Meta-ExternalFetcher",
    label: "Meta-ExternalFetcher",
    operator: "Meta",
    purpose: "user",
    ua: "meta-externalfetcher/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/web-crawlers)",
  },

  // Others
  {
    token: "Bytespider",
    label: "Bytespider",
    operator: "ByteDance",
    purpose: "training",
    note: "ByteDance has not published an official User-Agent string for this crawler, so this tool can't request as it — evaluated against robots.txt only.",
  },
  {
    token: "Amazonbot",
    label: "Amazonbot",
    operator: "Amazon",
    purpose: "search",
    ua: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Amazonbot/0.1; +https://developer.amazon.com/support/amazonbot) Chrome/126.0.0.0 Safari/537.36",
  },
  {
    token: "MistralAI-User",
    label: "MistralAI-User",
    operator: "Mistral",
    purpose: "user",
    ua: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; MistralAI-User/1.0; +https://docs.mistral.ai/robots)",
  },
  {
    token: "cohere-ai",
    label: "cohere-ai",
    operator: "Cohere",
    purpose: "training",
    note: "Cohere has not published an official User-Agent string for this token, so this tool can't request as it — evaluated against robots.txt only.",
  },
  {
    token: "AI2Bot",
    label: "AI2Bot",
    operator: "Allen Institute",
    purpose: "training",
    ua: "Mozilla/5.0 (compatible) AI2Bot (+https://www.allenai.org/crawler)",
  },
  {
    token: "DuckAssistBot",
    label: "DuckAssistBot",
    operator: "DuckDuckGo",
    purpose: "search",
    ua: "DuckAssistBot/1.2; (+http://duckduckgo.com/duckassistbot.html)",
  },
  {
    token: "Diffbot",
    label: "Diffbot",
    operator: "Diffbot",
    purpose: "training",
    note: "Diffbot's published User-Agent has changed across versions and the current one isn't confirmed, so this tool can't request as it — evaluated against robots.txt only.",
  },
  {
    token: "Omgilibot",
    label: "Omgilibot",
    operator: "Webz.io",
    purpose: "training",
    ua: "omgili/0.5 +https://omgili.com",
    note: "Collects pages into datasets sold on to other companies, some of which are used for model training. Blocking it does not tell you who the eventual buyer is. Sends as \"omgili\" on the wire even though the robots.txt token is Omgilibot.",
  },
  {
    token: "YouBot",
    label: "YouBot",
    operator: "You.com",
    purpose: "search",
    note: "You.com has not published a full User-Agent string for this crawler, so this tool can't request as it — evaluated against robots.txt only.",
  },
  {
    token: "Timpibot",
    label: "Timpibot",
    operator: "Timpi",
    purpose: "search",
    note: "Crawls for Timpi, a decentralized search index. Often listed alongside training crawlers in blocklists, though its stated purpose is search. No official User-Agent string is published, so this tool can't request as it — evaluated against robots.txt only.",
  },
];

/**
 * Agents we send a real request as. Excludes control-purpose tokens (they
 * never make requests, so there's nothing real to send as) and the handful
 * of crawlers whose operators haven't published a confirmed User-Agent
 * string — sending a made-up header would misrepresent what the real
 * crawler gets.
 */
export const fetchableAgents = agents.filter((a) => a.ua);

export const browserUa =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
