function getSslSetting(env, connectionUrl, host) {
  const explicitSetting = env.DATABASE_SSL;
  if (explicitSetting !== undefined) {
    const normalizedSetting = explicitSetting.toLowerCase();
    if (normalizedSetting === "true") return true;
    if (normalizedSetting === "false") return false;
    throw new Error("DATABASE_SSL must be set to true or false.");
  }

  const sslMode = env.PGSSLMODE || connectionUrl?.searchParams.get("sslmode");
  if (sslMode) {
    if (!["disable", "allow", "prefer", "require", "verify-ca", "verify-full"].includes(sslMode)) {
      throw new Error("PGSSLMODE or the PostgreSQL URL sslmode parameter is invalid.");
    }
    return sslMode !== "disable";
  }

  const isInternalHost =
    host === "localhost"
    || host.endsWith(".local")
    || host.endsWith(".internal")
    || host.endsWith(".svc")
    || /^database-[a-z0-9-]+$/i.test(host);

  return !isInternalHost;
}

function parsePort(value) {
  if (value === undefined || value === "") return undefined;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PostgreSQL port must be an integer between 1 and 65535.");
  }
  return port;
}

export function getPostgresConfig(env = process.env) {
  const connectionString = env.DATABASE_URL || env.POSTGRES_URL;
  if (connectionString) {
    let parsedUrl;
    try {
      parsedUrl = new URL(connectionString);
    } catch {
      throw new Error("DATABASE_URL or POSTGRES_URL must be a valid PostgreSQL URL.");
    }

    if (
      (parsedUrl.protocol !== "postgres:" && parsedUrl.protocol !== "postgresql:")
      || !parsedUrl.hostname
    ) {
      throw new Error("DATABASE_URL or POSTGRES_URL must be a valid PostgreSQL URL.");
    }

    const ssl = getSslSetting(env, parsedUrl, parsedUrl.hostname);
    return {
      connectionString,
      ssl: ssl ? { rejectUnauthorized: false } : false,
    };
  }

  const configuredHost = (env.DATABASE_HOST || env.POSTGRES_HOST || env.PGHOST)?.trim();
  if (!configuredHost) {
    throw new Error("Configure DATABASE_URL, POSTGRES_URL, or a PostgreSQL host.");
  }

  let host = configuredHost;
  let port = parsePort(env.DATABASE_PORT || env.POSTGRES_PORT || env.PGPORT);
  if (host.includes(":")) {
    let parsedHost;
    try {
      parsedHost = new URL(`postgres://${host}`);
    } catch {
      throw new Error("PostgreSQL host must be a hostname, optionally followed by :port.");
    }
    host = parsedHost.hostname;
    if (parsedHost.port) {
      if (port !== undefined) {
        throw new Error("Specify the PostgreSQL port either in the host or port variable, not both.");
      }
      port = parsePort(parsedHost.port);
    }
  }

  if (!host) {
    throw new Error("PostgreSQL host is invalid.");
  }

  const ssl = getSslSetting(env, undefined, host);
  return {
    host,
    ...(port === undefined ? {} : { port }),
    database: env.DATABASE_NAME || env.POSTGRES_DB || env.PGDATABASE,
    user: env.DATABASE_USER || env.POSTGRES_USER || env.PGUSER,
    password: env.DATABASE_PASSWORD || env.POSTGRES_PASSWORD || env.PGPASSWORD,
    ssl: ssl ? { rejectUnauthorized: false } : false,
  };
}
