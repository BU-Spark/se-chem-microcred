export interface DatabaseClient {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

class InMemoryDatabase implements DatabaseClient {
  async connect() {
    // No-op placeholder implementation.
  }

  async disconnect() {
    // No-op placeholder implementation.
  }
}

let client: DatabaseClient | undefined;

export function getDbClient(): DatabaseClient {
  if (!client) {
    client = new InMemoryDatabase();
  }
  return client;
}
