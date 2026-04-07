/**
 * Standardized "Noise" lists for common SDK scenarios.
 * Users can mix, match, and extend these.
 */

/**
 * Generic JSON/Log noise common in the wild.
 */
export const genericBlocklist: string[] = [
  '__typename', // GraphQL metadata
  '_links', // HAL/HATEOAS metadata
  'href', // Link metadata
  'checksum', // Integrity metadata
  'etag', // Cache metadata
  'css_classes', // Styling metadata
  'created_by_ip', // Infra metadata
  'url', // Link metadata
]

/**
 * Specialized noise common in the GitHub ecosystem.
 */
export const githubBlocklist: string[] = [
  'node_id', // GitHub internal IDs
  'gravatar_id', // Visual metadata
  'avatar_url', // Visual metadata
  'html_url', // Repository link (redundant context)
  'git_url', // Repository link
  'ssh_url', // Repository link
  'clone_url', // Repository link
  'svn_url', // Repository link
]
