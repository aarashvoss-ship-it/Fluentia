import { NextRequest, NextResponse } from "next/server";

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "music.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "www.youtu.be",
]);

function getVideoId(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return null;

  if (url.hostname.toLowerCase().endsWith("youtu.be")) return url.pathname.split("/").filter(Boolean)[0] || null;
  const watchId = url.searchParams.get("v");
  if (watchId) return watchId;
  const pathMatch = url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/);
  return pathMatch?.[1] || null;
}

export async function POST(request: NextRequest) {
  let body: { url?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Provide a valid YouTube video URL." }, { status: 400 });
  }
  if (typeof body.url !== "string" || body.url.length > 2048) {
    return NextResponse.json({ error: "Provide a valid YouTube video URL." }, { status: 400 });
  }

  const videoId = getVideoId(body.url);
  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return NextResponse.json({ error: "Playlist-only links are not supported. Paste a link to an individual YouTube video." }, { status: 422 });
  }

  try {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const response = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(videoUrl)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return NextResponse.json({ error: "YouTube could not provide metadata for this video." }, { status: 502 });
    const metadata = await response.json() as { title?: unknown };
    if (typeof metadata.title !== "string" || !metadata.title.trim()) {
      return NextResponse.json({ error: "YouTube did not return a title for this video." }, { status: 502 });
    }
    return NextResponse.json({ title: metadata.title.trim() });
  } catch {
    return NextResponse.json({ error: "YouTube metadata is unavailable right now." }, { status: 502 });
  }
}