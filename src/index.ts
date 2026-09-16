import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";

type Bindings = {
	BUCKET: R2Bucket;
	DB: D1Database;
	UPLOAD_TOKEN: string;
	MAX_UPLOAD_BYTES?: string;
};

type ImageRow = {
	id: string;
	r2_key: string;
	content_type: string;
	size: number;
	created_at: number;
};

const DEFAULT_MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const DEFAULT_LIST_LIMIT = 60;
const MAX_LIST_LIMIT = 200;

/**
 * SVG is deliberately absent: it can carry scripts, and images are served from
 * the same origin as the UI that holds the upload token.
 */
const EXTENSIONS: Record<string, string> = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/gif": "gif",
	"image/webp": "webp",
	"image/avif": "avif",
};

const app = new Hono<{ Bindings: Bindings }>();

/**
 * Detects the image type from the bytes themselves. The client-declared
 * Content-Type is never trusted; whatever this returns is what we store and
 * what we serve back.
 */
function sniffImageType(bytes: Uint8Array): string | null {
	const startsWith = (offset: number, ...sig: number[]) =>
		sig.every((byte, i) => bytes[offset + i] === byte);
	const ascii = (offset: number, text: string) =>
		startsWith(offset, ...[...text].map((c) => c.charCodeAt(0)));

	if (startsWith(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) {
		return "image/png";
	}
	if (startsWith(0, 0xff, 0xd8, 0xff)) {
		return "image/jpeg";
	}
	if (ascii(0, "GIF87a") || ascii(0, "GIF89a")) {
		return "image/gif";
	}
	if (ascii(0, "RIFF") && ascii(8, "WEBP")) {
		return "image/webp";
	}
	if (ascii(4, "ftyp") && (ascii(8, "avif") || ascii(8, "avis"))) {
		return "image/avif";
	}
	return null;
}

/** 128 bits of randomness, URL-safe, 22 characters. */
function newId(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function tokenMatches(provided: string, expected: string): Promise<boolean> {
	const encoder = new TextEncoder();
	const [a, b] = await Promise.all([
		crypto.subtle.digest("SHA-256", encoder.encode(provided)),
		crypto.subtle.digest("SHA-256", encoder.encode(expected)),
	]);
	if (typeof crypto.subtle.timingSafeEqual === "function") {
		return crypto.subtle.timingSafeEqual(a, b);
	}
	const viewA = new Uint8Array(a);
	const viewB = new Uint8Array(b);
	let diff = 0;
	for (let i = 0; i < viewA.length; i++) {
		diff |= viewA[i] ^ viewB[i];
	}
	return diff === 0;
}

function maxUploadBytes(env: Bindings): number {
	const parsed = Number(env.MAX_UPLOAD_BYTES);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_UPLOAD_BYTES;
}

function publicUrl(requestUrl: string, row: Pick<ImageRow, "id" | "content_type">): string {
	const extension = EXTENSIONS[row.content_type];
	const name = extension ? `${row.id}.${extension}` : row.id;
	return new URL(`/i/${name}`, requestUrl).toString();
}

function toJson(requestUrl: string, row: ImageRow) {
	return {
		id: row.id,
		url: publicUrl(requestUrl, row),
		content_type: row.content_type,
		size: row.size,
		created_at: row.created_at,
	};
}

const requireToken: MiddlewareHandler<{ Bindings: Bindings }> = async (c, next) => {
	const expected = c.env.UPLOAD_TOKEN;
	if (!expected) {
		return c.json(
			{ error: "UPLOAD_TOKEN is not configured on this instance." },
			500,
		);
	}
	const provided = /^Bearer\s+(.+)$/i.exec(c.req.header("authorization") ?? "")?.[1] ?? "";
	if (!provided || !(await tokenMatches(provided, expected))) {
		return c.json({ error: "Unauthorized." }, 401);
	}
	await next();
};

app.use("/api/*", requireToken);

app.post("/api/upload", async (c) => {
	const limit = maxUploadBytes(c.env);

	const declaredLength = Number(c.req.header("content-length") ?? "0");
	if (declaredLength > limit) {
		return c.json({ error: `Image is larger than ${limit} bytes.` }, 413);
	}

	const requestType = c.req.header("content-type") ?? "";
	let buffer: ArrayBuffer;
	if (requestType.startsWith("multipart/form-data")) {
		const file = (await c.req.formData()).get("file");
		if (!(file instanceof File)) {
			return c.json({ error: "Expected a `file` field." }, 400);
		}
		buffer = await file.arrayBuffer();
	} else {
		buffer = await c.req.arrayBuffer();
	}

	if (buffer.byteLength === 0) {
		return c.json({ error: "Empty upload." }, 400);
	}
	if (buffer.byteLength > limit) {
		return c.json({ error: `Image is larger than ${limit} bytes.` }, 413);
	}

	const bytes = new Uint8Array(buffer);
	const contentType = sniffImageType(bytes);
	if (!contentType) {
		return c.json(
			{ error: "Unsupported image. PNG, JPEG, GIF, WebP and AVIF are accepted." },
			415,
		);
	}

	const row: ImageRow = {
		id: newId(),
		r2_key: "",
		content_type: contentType,
		size: buffer.byteLength,
		created_at: Date.now(),
	};
	row.r2_key = `images/${row.id}`;

	await c.env.BUCKET.put(row.r2_key, buffer, {
		httpMetadata: {
			contentType,
			cacheControl: "public, max-age=31536000, immutable",
		},
	});

	try {
		await c.env.DB.prepare(
			"INSERT INTO images (id, r2_key, content_type, size, created_at) VALUES (?, ?, ?, ?, ?)",
		)
			.bind(row.id, row.r2_key, row.content_type, row.size, row.created_at)
			.run();
	} catch (error) {
		// Never leave an object behind that nothing points at.
		await c.env.BUCKET.delete(row.r2_key);
		throw error;
	}

	return c.json(toJson(c.req.url, row), 201);
});

app.get("/api/images", async (c) => {
	const requestedLimit = Number(c.req.query("limit") ?? DEFAULT_LIST_LIMIT);
	const limit = Math.min(
		Number.isFinite(requestedLimit) && requestedLimit > 0
			? requestedLimit
			: DEFAULT_LIST_LIMIT,
		MAX_LIST_LIMIT,
	);

	const beforeCreatedAt = Number(c.req.query("before_created_at"));
	const beforeId = c.req.query("before_id");
	const paginated = Number.isFinite(beforeCreatedAt) && Boolean(beforeId);

	const statement = paginated
		? c.env.DB.prepare(
				"SELECT id, r2_key, content_type, size, created_at FROM images WHERE (created_at, id) < (?, ?) ORDER BY created_at DESC, id DESC LIMIT ?",
			).bind(beforeCreatedAt, beforeId, limit)
		: c.env.DB.prepare(
				"SELECT id, r2_key, content_type, size, created_at FROM images ORDER BY created_at DESC, id DESC LIMIT ?",
			).bind(limit);

	const { results } = await statement.all<ImageRow>();
	const last = results.at(-1);

	return c.json({
		items: results.map((row) => toJson(c.req.url, row)),
		next: results.length === limit && last
			? { before_created_at: last.created_at, before_id: last.id }
			: null,
	});
});

app.delete("/api/images/:id", async (c) => {
	const id = c.req.param("id");
	const row = await c.env.DB.prepare("SELECT r2_key FROM images WHERE id = ?")
		.bind(id)
		.first<Pick<ImageRow, "r2_key">>();

	if (!row) {
		return c.json({ error: "Not found." }, 404);
	}

	await c.env.BUCKET.delete(row.r2_key);
	await c.env.DB.prepare("DELETE FROM images WHERE id = ?").bind(id).run();

	return c.body(null, 204);
});

app.get("/i/:name", async (c) => {
	const id = c.req.param("name").replace(/\.[a-z0-9]+$/i, "");
	const object = await c.env.BUCKET.get(`images/${id}`, {
		onlyIf: c.req.raw.headers,
	});

	if (!object) {
		return c.text("Not found.", 404);
	}

	const headers = new Headers({
		"cache-control": "public, max-age=31536000, immutable",
		"content-security-policy": "default-src 'none'; sandbox",
		etag: object.httpEtag,
		"x-content-type-options": "nosniff",
	});
	headers.set(
		"content-type",
		object.httpMetadata?.contentType ?? "application/octet-stream",
	);
	headers.set("content-length", String(object.size));

	// R2 omits the body when the caller's precondition (If-None-Match) held.
	if (!("body" in object) || !object.body) {
		return new Response(null, { status: 304, headers });
	}

	return new Response(object.body, { headers });
});

export default app;
