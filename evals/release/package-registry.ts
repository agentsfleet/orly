import { isDeepStrictEqual } from "node:util";
import { z } from "zod";

const LOOPBACK = "127.0.0.1";
const PACKAGE_LIMIT = 12;
const REQUEST_LIMIT = 256;
const ARCHIVE_BYTES = 16 * 1024 * 1024;
const MANIFEST_BYTES = 2 * 1024 * 1024;
const PIPE_OUTPUT = "pipe";
const INVENTORY_ERROR = "Archive inventory mismatch";
const ARCHIVE_INSPECTOR = String.raw`
import hashlib, io, json, sys, tarfile
ARCHIVE_LIMIT = ${ARCHIVE_BYTES}
FILE_LIMIT = ${MANIFEST_BYTES}
TOTAL_LIMIT = 4 * ARCHIVE_LIMIT
MEMBER_LIMIT = 4096
PATH_LIMIT = 512
OUTPUT_LIMIT = ${MANIFEST_BYTES}
payload = sys.stdin.buffer.read(ARCHIVE_LIMIT + 1)
if len(payload) > ARCHIVE_LIMIT:
    raise ValueError("Archive exceeds byte limit")
files, metadata, total = {}, None, 0
with tarfile.open(fileobj=io.BytesIO(payload), mode="r:gz") as archive:
    for index, member in enumerate(archive):
        if index >= MEMBER_LIMIT:
            raise ValueError("Archive exceeds member limit")
        parts = member.name.split("/")
        if len(member.name) > PATH_LIMIT or parts[0] != "package" or ".." in parts:
            raise ValueError("Unsafe archive path")
        if member.isdir():
            continue
        if not member.isfile() or len(parts) < 2 or any(not part for part in parts):
            raise ValueError("Unsupported archive member")
        relative = "/".join(parts[1:])
        total += member.size
        if relative in files or member.size > FILE_LIMIT or total > TOTAL_LIMIT:
            raise ValueError("Archive file inventory exceeds limits")
        with archive.extractfile(member) as source:
            data = source.read(FILE_LIMIT + 1)
        if len(data) != member.size:
            raise ValueError("Archive member size mismatch")
        files[relative] = hashlib.sha256(data).hexdigest()
        if relative == "package.json":
            metadata = json.loads(data)
output = json.dumps({"metadata": metadata, "files": files})
if not files or metadata is None or len(output.encode()) > OUTPUT_LIMIT:
    raise ValueError("Invalid archive inventory")
print(output)
`;
const SHA256 = "sha256";
const HASH = z.string().regex(/^[a-f0-9]{64}$/);
const packageSchema = z.strictObject({
  name: z.string().min(1), version: z.string().min(1), tarball: z.string().min(1), sha256: HASH,
  metadata: z.object({ name: z.string(), version: z.string(), dependencies: z.record(z.string(), z.string()).optional() }).passthrough(),
  files: z.record(z.string(), HASH),
});
const manifestSchema = z.strictObject({ packages: z.array(packageSchema).min(1).max(PACKAGE_LIMIT) });
export type PackedPackage = z.infer<typeof packageSchema>;

export function hash(value: Uint8Array | string): string {
  return new Bun.CryptoHasher(SHA256).update(value).digest("hex");
}

async function verifiedBytes(entry: PackedPackage): Promise<Uint8Array> {
  const file = Bun.file(entry.tarball);
  if (file.size > ARCHIVE_BYTES) throw new Error("Package archive exceeds its byte limit.");
  const bytes = await file.bytes();
  if (hash(bytes) !== entry.sha256) throw new Error(`Package digest mismatch: ${entry.name}`);
  return bytes;
}

async function verifyInventory(entry: PackedPackage): Promise<void> {
  const result = Bun.spawnSync(["python3", "-c", ARCHIVE_INSPECTOR], {
    stdin: await verifiedBytes(entry), stdout: PIPE_OUTPUT, stderr: PIPE_OUTPUT, timeout: 10_000,
  });
  if (result.exitCode !== 0 || result.stdout.length > MANIFEST_BYTES) throw new Error(`Archive inspection failed: ${entry.name}`);
  const actual = JSON.parse(result.stdout.toString());
  if (!isDeepStrictEqual(actual, { metadata: entry.metadata, files: entry.files })) throw new Error(`${INVENTORY_ERROR}: ${entry.name}`);
}

export async function readManifest(path: string): Promise<PackedPackage[]> {
  const file = Bun.file(path);
  if (file.size > MANIFEST_BYTES) throw new Error("Package manifest exceeds its byte limit.");
  const { packages } = manifestSchema.parse(await file.json());
  if (new Set(packages.map((entry) => entry.name)).size !== packages.length) throw new Error("Duplicate package in closure.");
  for (const entry of packages) {
    if (entry.name !== entry.metadata.name || entry.version !== entry.metadata.version) throw new Error("Package metadata identity differs.");
    for (const dependency of Object.keys(entry.metadata.dependencies ?? {})) {
      if (!packages.some((candidate) => candidate.name === dependency)) throw new Error(`Dependency absent from closure: ${dependency}`);
    }
    await verifyInventory(entry);
  }
  return packages;
}

export class PackageRegistry {
  #server: ReturnType<typeof Bun.serve>;
  #requests: string[] = [];
  #missing = false;

  private constructor(assets: Map<string, Uint8Array>, packages: PackedPackage[]) {
    this.#server = Bun.serve({ hostname: LOOPBACK, port: 0, fetch: (request) => {
      const path = decodeURIComponent(new URL(request.url).pathname.slice(1));
      if (this.#requests.length >= REQUEST_LIMIT) return new Response("Fixture request limit reached.", { status: 429 });
      this.#requests.push(path);
      if (this.#missing) return new Response("Fixture package resolution refused.", { status: 404 });
      const asset = assets.get(path);
      if (asset) return new Response(new Uint8Array(asset).buffer);
      const entry = packages.find((candidate) => candidate.name === path);
      if (!entry) return new Response("Package outside fixture closure.", { status: 404 });
      const filename = `${entry.name.replaceAll("/", "-")}-${entry.version}.tgz`;
      const integrity = new Bun.CryptoHasher("sha512").update(assets.get(filename) ?? new Uint8Array()).digest("base64");
      return Response.json({ name: entry.name, "dist-tags": { latest: entry.version }, versions: {
        [entry.version]: { ...entry.metadata, dist: { tarball: `${this.url}${filename}`, integrity: `sha512-${integrity}` } },
      } });
    } });
  }

  static async create(packages: PackedPackage[]): Promise<PackageRegistry> {
    const assets = new Map<string, Uint8Array>();
    for (const entry of packages) {
      const bytes = await verifiedBytes(entry);
      assets.set(`${entry.name.replaceAll("/", "-")}-${entry.version}.tgz`, bytes);
    }
    return new PackageRegistry(assets, packages);
  }

  get url(): string { return `http://${LOOPBACK}:${this.#server.port}/`; }
  get requests(): string[] { return [...this.#requests]; }
  refuseResolution(): void { this.#missing = true; }
  close(): void { this.#server.stop(true); }
}
