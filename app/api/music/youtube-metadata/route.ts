import { NextRequest, NextResponse } from "next/server";
import { getYoutubeVideoId } from "@/lib/musicTracks";

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

  const videoId = getYoutubeVideoId(body.url);
  if (!videoId) {
    return NextResponse.json({ error: "Playlist-only links are not supported. Paste a link to an individual YouTube video." }, { status: 422 });
  }

  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const endpoints = [
    `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`,
    `https://noembed.com/embed?url=${encodeURIComponent(videoUrl)}`,
  ];
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) continue;
      const metadata = await response.json() as { title?: unknown; author_name?: unknown };
      if (typeof metadata.title === "string" && metadata.title.trim()) {
        return NextResponse.json({
          title: metadata.title.trim(),
          authorName: typeof metadata.author_name === "string" ? metadata.author_name.trim() : "",
        });
      }
    } catch {
      // Try the next public oEmbed provider.
    }
  }
  return NextResponse.json({ error: "Metadata could not be loaded. Enter a title manually to add this video." }, { status: 502 });
}