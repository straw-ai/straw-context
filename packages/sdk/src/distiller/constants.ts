export const DEFAULT_NOISE_KEYS = new Set([
  '__typename', // GraphQL metadata
  '_links', // HAL/HATEOAS metadata
  'href', // Link metadata
  'avatar_url', // Visual metadata
  'gravatar_id', // Visual metadata
  'node_id', // GitHub/Relay internal IDs
  'checksum', // Integrity metadata
  'etag', // Cache metadata
  'css_classes', // Styling metadata
  'created_by_ip', // Infra metadata
  'url', // Link metadata
])
