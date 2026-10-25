import {
  DeleteObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

type S3Configuration = {
  client: S3Client;
  bucket: string;
  endpoint: URL;
};

let s3Configuration: S3Configuration | undefined;

function getS3Configuration(): S3Configuration {
  if (s3Configuration) return s3Configuration;

  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  const endpointValue = process.env.AWS_ENDPOINT_URL?.trim();
  if (!accessKeyId || !secretAccessKey || !endpointValue) {
    throw new Error("AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_ENDPOINT_URL must be configured.");
  }

  const endpoint = new URL(endpointValue);
  if (endpoint.protocol !== "https:" && endpoint.protocol !== "http:") {
    throw new Error("AWS_ENDPOINT_URL must use HTTP or HTTPS.");
  }
  if (endpoint.search || endpoint.hash) {
    throw new Error("AWS_ENDPOINT_URL must not include a query string or fragment.");
  }
  endpoint.pathname = endpoint.pathname.replace(/\/+$/, "");

  const bucket = process.env.S3_BUCKET?.trim() || "fluentia-assets";
  const client = new S3Client({
    endpoint: endpoint.toString().replace(/\/$/, ""),
    region: process.env.AWS_DEFAULT_REGION?.trim() || "us-east-1",
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  s3Configuration = { client, bucket, endpoint };
  return s3Configuration;
}

function cleanFileName(fileName: string): string {
  const cleanName = fileName
    .replace(/[\\/]+/g, "_")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  if (!cleanName || cleanName === "." || cleanName === "..") {
    throw new Error("A valid file name is required.");
  }
  return cleanName;
}

function cleanFolderName(folderName: string): string {
  const segments = folderName.split("/");
  if (
    segments.length === 0
    || segments.some((segment) => !/^[a-zA-Z0-9_-]+$/.test(segment))
  ) {
    throw new Error("The storage folder name is invalid.");
  }
  return segments.join("/");
}

function objectKeyFromPublicUrl(urlValue: string, configuration: S3Configuration): string | null {
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    return null;
  }

  const endpointPath = configuration.endpoint.pathname.replace(/\/+$/, "");
  const objectPrefix = `${endpointPath}/${encodeURIComponent(configuration.bucket)}/`;
  if (
    url.origin !== configuration.endpoint.origin
    || !url.pathname.startsWith(objectPrefix)
    || url.search
    || url.hash
  ) {
    return null;
  }

  try {
    return decodeURIComponent(url.pathname.slice(objectPrefix.length));
  } catch {
    return null;
  }
}

function getPublicObjectUrl(endpoint: URL, bucket: string, key: string): string {
  const basePath = endpoint.pathname.replace(/\/+$/, "");
  const encodedKey = key.split("/").map((segment) => encodeURIComponent(segment)).join("/");
  return `${endpoint.origin}${basePath}/${encodeURIComponent(bucket)}/${encodedKey}`;
}

export async function uploadToS3(
  fileBody: ReadableStream<Uint8Array>,
  fileSize: number | undefined,
  fileName: string,
  folderName: string,
  ownerId: string,
  contentType: string,
): Promise<string> {
  try {
    const configuration = getS3Configuration();
    const key = `${cleanFolderName(folderName)}/${ownerId}/${cleanFileName(fileName)}`;
    const partSize = Math.max(5 * 1024 * 1024, Math.ceil((fileSize || 0) / 10_000));
    await new Upload({
      client: configuration.client,
      params: {
        Bucket: configuration.bucket,
        Key: key,
        Body: fileBody,
        ...(fileSize === undefined ? {} : { ContentLength: fileSize }),
        ContentType: contentType,
        ACL: "public-read",
      },
      partSize,
      queueSize: 4,
      leavePartsOnError: false,
    }).done();
    return getPublicObjectUrl(configuration.endpoint, configuration.bucket, key);
  } catch (error) {
    console.error("Paasta S3 upload failed:", error);
    throw error;
  }
}

export async function deleteS3Object(url: string, ownerId: string, canDeleteAny: boolean): Promise<boolean> {
  try {
    const configuration = getS3Configuration();
    const key = objectKeyFromPublicUrl(url, configuration);
    if (!key) return false;

    const segments = key.split("/");
    const objectOwnerId = segments.length >= 3 ? segments[segments.length - 2] : "";
    if (!objectOwnerId || (!canDeleteAny && objectOwnerId !== ownerId)) {
      throw new Error("You do not have permission to delete this uploaded file.");
    }

    await configuration.client.send(new DeleteObjectCommand({
      Bucket: configuration.bucket,
      Key: key,
    }));
    return true;
  } catch (error) {
    console.error("Paasta S3 deletion failed:", error);
    throw error;
  }
}
