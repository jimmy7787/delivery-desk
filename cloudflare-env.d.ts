declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    APP_ENV?: string;
    CF_ACCESS_TEAM_DOMAIN?: string;
    CF_ACCESS_AUD?: string;
  }
}
