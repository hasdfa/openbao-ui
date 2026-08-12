export const REPOSITORY_URL = "https://github.com/krolbot/openbao-ui";

const revision = process.env.NEXT_PUBLIC_BUILD_REVISION?.trim();

export const BUILD_REVISION = revision && /^[0-9a-f]{7,40}$/i.test(revision)
  ? revision.slice(0, 12)
  : "development";