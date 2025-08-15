// app/api/upload/route.ts
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import admin from "firebase-admin";

/**
 * Server-side upload route using firebase-admin.
 *
 * Expects a multipart/form-data POST with a "file" field.
 *
 * Environment variables used:
 * - FIREBASE_SERVICE_ACCOUNT_KEY  -> stringified service account JSON (preferred)
 * - FIREBASE_STORAGE_BUCKET      -> e.g. "aoun-ai-c5005.appspot.com"
 *
 * Alternatively, you can set GOOGLE_APPLICATION_CREDENTIALS to a path to
 * a service account JSON file and omit FIREBASE_SERVICE_ACCOUNT_KEY.
 */

// initialize admin app only once (safe in Next)
if (!admin.apps.length) {
  // Either parse a stringified service account OR rely on ADC via GOOGLE_APPLICATION_CREDENTIALS
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
  } else {
    // If GOOGLE_APPLICATION_CREDENTIALS is set to a file path, this will use ADC
    admin.initializeApp({
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
  }
}

const bucket = admin.storage().bucket();

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = `${Date.now()}-${uuidv4()}-${file.name}`;
    const destinationPath = `uploads/${fileName}`;
    const fileRef = bucket.file(destinationPath);

    // Save the file buffer to the bucket
    await fileRef.save(buffer, {
      metadata: {
        contentType: file.type || "application/octet-stream",
      },
      resumable: false, // small files: disable resumable for simplicity
    });

    // Option A: generate a signed URL (recommended for private buckets)
    const [signedUrl] = await fileRef.getSignedUrl({
      action: "read",
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Return signed URL and internal path (you can persist path in DB if you prefer)
    return NextResponse.json({
      url: signedUrl,
      path: destinationPath,
      name: fileName,
    });
  } catch (error) {
    console.error("[API /upload] Error uploading file:", error);
    return NextResponse.json(
      { error: (error as Error).message ?? "Upload failed" },
      { status: 500 },
    );
  }
}
