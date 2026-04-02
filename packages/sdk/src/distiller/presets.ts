import type { DistillOptions } from './types.js'

export const presets: Record<string, DistillOptions> = {
  github: {
    maxStringLength: 500, // Reasonable for dense PR data
    tableifyThreshold: 3,
    dropKeys: [
      'node_id',
      'gravatar_id',
      'url',
      'html_url',
      'followers_url',
      'following_url',
      'gists_url',
      'starred_url',
      'subscriptions_url',
      'organizations_url',
      'repos_url',
      'events_url',
      'received_events_url',
      'ssh_url',
      'clone_url',
      'svn_url',
      'blobs_url',
      'git_tags_url',
      'git_refs_url',
      'trees_url',
      'statuses_url',
      'languages_url',
      'stargazers_url',
      'contributors_url',
      'subscribers_url',
      'subscription_url',
      'commits_url',
      'git_commits_url',
      'comments_url',
      'issue_comment_url',
      'contents_url',
      'compare_url',
      'merges_url',
      'archive_url',
      'downloads_url',
      'issues_url',
      'pulls_url',
      'milestones_url',
      'notifications_url',
      'labels_url',
      'releases_url',
      'deployments_url',
    ],
  },
  stripe: {
    maxStringLength: 300,
    dropKeys: [
      'object', // Redundant if you know the resource
      'livemode', // Usually noise for integration logs
      'idempotency_key',
      'request.id',
    ],
  },
  graphql: {
    dropKeys: ['__typename'],
  },
}
